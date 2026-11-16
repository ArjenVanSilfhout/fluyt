# scripts

Local tooling for this repo; none of it ships in the plugin payload.

- `validate-local.ps1` - the dual-package local gate (CI is authoritative).
- `guard-matrix.js` - fixture matrix for the shipped guard hook.
- `publish-release.ps1` - the release publisher. Needs `-NotesFile`: a short summary you write (per the
  `release` skill, step 3); it never builds notes from the CHANGELOG and refuses to run without one.
- `plugin-vocabulary-allowlist.txt`, `component-size-budget.txt` - data files the gate reads.
- `hooks/pre-push` - the opt-in denylist scan below.
- `denylist-scan.js` - the gh-publish scan (hook, release script, audit mode) in the last section.

## Denylist pre-push hook

`hooks/pre-push` rejects a push when the tree, a commit (author, committer, message) or an
annotated tag contains a term from a denylist file you keep outside the repo (for example names,
emails or internal hostnames you never want published). The terms are never committed. The hook is
optional. It fails closed: a missing, unreadable or empty terms file blocks the push.

Set it up once per clone:

```sh
git config core.hooksPath scripts/hooks
mkdir -p ~/.config/denylist
printf '%s\n' 'example-term' 'another-term' > ~/.config/denylist/terms.txt
```

One term per line; blank lines and `#` comments are ignored; matching is case-insensitive.
Set `DENYLIST_FILE` to use a different path:

```sh
DENYLIST_FILE=/path/to/terms.txt sh scripts/hooks/pre-push --all
```

Run with `--all` (or from a terminal) to scan the full history and tree, e.g. before publishing a
repo.

## gh-publish denylist scan

Issues, PR descriptions, comments, release notes and milestones never pass through `git push`, so the
pre-push hook cannot see them. `denylist-scan.js` checks that text against the **same denylist file**
(`DENYLIST_FILE`, else `${XDG_CONFIG_HOME:-$HOME/.config}/denylist/terms.txt`; same parsing). Three
callers, one implementation:

- **The hook** (`.claude/settings.json`, PreToolUse, one entry for the Bash tool and one for the
  PowerShell tool). **It does not interpret shell.** Four fix rounds on a hook that modelled heredocs,
  pipes, `printf`, redirections, expansions and PowerShell expressions kept finding one more way to
  get a term through, so published text is accepted only from a form whose value is certain without
  interpreting anything, and every other publishing form is refused. Each tool call is judged in one
  of two tiers:

  - **Accepted: the strict form.** The whole call is exactly **one `gh` invocation**, optionally
    after one `cd <dir>` joined with `&&` or `;`, written with literal words only: bare words of
    letters, digits and `. _ - / : = @` (PowerShell: also a backslash, never last, and no leading
    `@`, which splats); single-quoted strings (no `'` inside); double-quoted strings without `$`,
    a backtick, `!` or a double quote (bash: also no backslash). A word may be a bare prefix and one
    quoted string (`--title='x'`, `query="x"`). **PowerShell adds one rule:** a single-quoted string
    may hold no double-quote character of either kind, because Windows PowerShell 5.1 strips an
    embedded double quote from a native command line (checked on 5.1 and 7.7); put such a title in
    bash, or in a file. No newline, operator, redirection, pipe, comment, continuation, variable,
    substitution, heredoc, here-string, call operator or wrapper (`env`, `sudo`, `xargs` ...).
    **Published text must come from a file** (`--body-file` / `-F`, `--notes-file`, `gh pr create
    --template`, `--recover`, `gh api --input`, `gh api -F key=@file`) named by a **literal path**:
    not `-`, an existing regular file, valid UTF-8 (one BOM is stripped; a NUL byte or invalid
    bytes, so UTF-16 and binary files, block), at most 4 MiB. A relative path resolves against the
    cwd the hook is given and is accepted only when there is no `cd` before gh; after a `cd` it must
    be absolute (on Windows under the Bash tool: `C:/dir/f.md` or `/c/dir/f.md`). **Short
    title-like fields may be plain literals** and are scanned: `--title`/`-t`, `--subject`,
    `--comment`/`-c` (close, reopen), `--description`/`-d`, `--homepage`, the alt text of
    `--attach 'file#alt'`, and `gh api -f`/`-F key=value` fields (so `gh api graphql -f query='...'`
    reads keep working). **An inline body or notes text is refused, even when clean:** `--body`/`-b`,
    `--notes`/`-n`, and a `gh api` field named `body` or `notes`. JSON inputs (`--input`,
    `--recover`) are scanned raw and as decoded strings; text that is not valid JSON blocks.
    Because the call is one command, nothing in it can write the file the hook reads.
  - **Everything else that mentions `gh`.** The shell parser is used only to *find* `gh`
    invocations inside a compound command, never to resolve text. No `gh` invocation found (a commit
    message that mentions gh, `grep gh docs/`): allowed. Every `gh` invocation found is read-only and
    recognised (`cd x; gh pr view 9 --json state --jq .state; gh run list | head`): allowed. **Any
    `gh` invocation that publishes, is unknown or cannot be parsed blocks** with "a publishing gh
    command must be the only command in the call, in the strict form". A command that hands a
    command STRING that mentions gh to a host (`bash -c`, `env -S`, `sudo -s`, `ssh`, `tmux`,
    `flock -c`, `python -c`, `node -e`, `eval`, `iex`, `pwsh -Command`, a pipe or heredoc into a
    shell), a script file run in a call that also holds a gh command as text, a variable, array,
    alias or git alias that holds a gh command, a command word built from an expansion, glob or brace
    (`g$()h`, `g?`), `<( )` process substitution, `-EncodedCommand`, and parameter or arithmetic
    expansions the lexer cannot follow also block.

  **When blocked: write the text to a file in an earlier call** (the Write tool, or a command that
  only writes the file), then run the publishing `gh` command **alone**, with the file path as a
  literal. Do not chain it with `&&`, `;`, a pipe or a redirection.

  **Never blocked by the strict form, and still scanned:** read-only verbs and commands (`gh pr
  view`, `gh run list`, `gh pr ready`, `gh api <path> --jq ...`). **Blocked even alone:** commands
  whose text the scan cannot read: `gh gist create|edit`, `gh workflow run`, `gh variable set`,
  `gh discussion` writes, `gh project item-*`, `gh agent-task create`, `gh repo autolink create`,
  gh extensions and user-defined aliases (`gh alias set`; an alias or extension is an unknown
  command). The tables behind this are read from `gh --help` (gh 2.103.3: re-check them after a
  gh upgrade); a covered verb, an unknown long flag on it, an unknown short-flag letter in a cluster
  (`-wb`, `-dt`) and an unknown flag before the verb all block, and flags before the verb count
  (`gh -R o/r issue create`, `gh --body x issue comment 1`).

  **Matching** is case-insensitive fixed-string after NFKC normalisation and removal of Unicode
  format characters (zero-width and bidi marks, soft hyphen), on terms and text alike, per line and
  also against the whole value with line breaks removed and with whitespace runs collapsed (a term
  split by a line break or padded with blanks still matches). **Not applied:** diacritic folding and
  confusable-letter mapping (a Cyrillic lookalike passes).

  The block reason names only the command, the field and the line number: never the matched term,
  and never a filesystem path - the denylist is named as "DENYLIST_FILE, else the default under the
  XDG config dir". A hit, a missing or empty denylist, bad hook JSON, an unparseable command, a
  missing script, a hang and any crash all **block** (exit 2; the saved command tests that the
  script exists, then runs `timeout 6 node ".../scripts/denylist-scan.js" --hook` and turns any
  non-zero exit, including `timeout`'s 124 and a missing `timeout` or `node`, into exit 2). The
  bound is inside the command because a hook the client itself times out is a **non-blocking**
  error, i.e. the publish would go through; the entry's `timeout` field (20 s) sits well above the
  inner 6 s so the inner bound always fires first. Commands that do not mention `gh` are not parsed
  and pass silently.
- **`publish-release.ps1`** runs the same scan on the title and the notes file before anything else
  (also under `-DryRun`) and aborts through its usual error path. A tool hook only sees that script's
  call, never the `gh release create` inside it.
- **Audit mode**, for what is already published (and web-UI edits, which no hook sees):
  `node scripts/denylist-scan.js --audit [--repo OWNER/REPO]` pulls issues, PRs, comments, reviews,
  review comments, releases, milestones and labels through read-only `gh api` and prints
  `HIT <kind> <id> <field> line N`, never the text. Exit 1 on a hit or any fetch error. Run it before
  a release.

**Known gaps** (what still passes unscanned, or is not seen):

- **Scripts that run `gh`** (`bash x.sh`, `node x.js`, a Makefile target): the hook sees the script
  call, not the commands inside it.
- **Non-`gh` publishing:** `curl` to the API, a tag message pushed with `git push` (the pre-push
  hook covers pushed commits and tags), an edit in the GitHub web UI. The audit mode is the
  backstop.
- **A `gh` word that is not spelled `gh`** and that no refusal above recognises: a function or alias
  from a shell profile, a wrapper command this scan does not list. Closed cheaply: `g$()h`,
  `g${x}h`, `g?`, `{g,x}h`, a command word built from an expansion followed by a gh group and verb,
  and `-EncodedCommand`. A hand-written lexer finds `gh` in compound commands, so a construct it
  mis-lexes can hide one.
- **Text the call does not carry:** `--fill`, `--fill-first`, `--fill-verbose`, `--generate-notes`,
  `--notes-from-tag` (commits and tags the push already published), and an editor or browser form
  (`-e`, `-w`).
- **Rendering:** text that matches nothing but that GitHub displays as a term (HTML entities, a
  Markdown escape or an HTML comment inside the term, combining marks, a lookalike letter from
  another script). The audit mode reads the same stored text, so it shares the gap.
- **Names and attachments:** branch, label, milestone, assignee and template names, `gh repo
  rename`, the bytes of an `--attach`ed file, release assets and `issue artifact` files.
- **A body file changed after the hook read it** by *another* process before gh reads it (a race
  the single-command form removes only for the command itself).
- **A relative path is resolved against the `cwd` the hook is given.** If the tool's shell has a
  different working directory, a relative path can name another file; use an absolute path to avoid
  it.
- **Windows under the Bash tool:** the shell turns arguments that start with `/` into Windows paths
  (`/c` becomes `C:/`), which can change a title's text but not add one.

`scripts/guard-matrix.js` scores both hook entries from the saved commands on disk with a fixture
denylist, including the must-block controls (denylist missing, denylist empty, scanner script absent, a
scanner that never returns, a PATH without `timeout`/`node`) under a per-row time limit, so a hang
scores as a failure instead of stalling the run.

**Second machine.** The hook lives in committed settings, so a machine without the denylist file is
**blocked from all gh publishing** in this repo (reads such as `gh pr view` still pass). Provision the
file as in the pre-push section above (`mkdir -p ~/.config/denylist`, one term per line), or point
`DENYLIST_FILE` at it. Nothing else is needed; the hook finds the script through `$CLAUDE_PROJECT_DIR`
(unset, the session's working directory), so the session must be rooted at this repo - otherwise this
settings file is not loaded at all.
