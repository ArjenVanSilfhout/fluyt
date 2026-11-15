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
  PowerShell tool). It scans the **values** of `--body`, `--title`, `--notes`, `--subject`,
  `--comment`, `--description` and `gh api` fields, and the **contents** of `--body-file`,
  `--notes-file`, `gh api -F key=@file` and `--input` files; heredocs, here-strings, `< file` and
  pipes from `cat`/`echo`/`Get-Content` feeding `-` are scanned too. It never scans the command line
  as a whole or a path, so a term in a temp path does not block. A hit, a missing or empty denylist,
  bad hook JSON, an unparseable command, a missing script, a hang and any crash all **block** (exit 2;
  the saved command tests that the script exists, then runs `timeout 6 node ".../scripts/denylist-scan.js"
  --hook` and turns any non-zero exit, including `timeout`'s 124 and a missing `timeout` or `node`, into
  exit 2). The bound is inside the command because a hook the client itself times out is a
  **non-blocking** error, i.e. the publish would go through; the entry's `timeout` field (20 s) sits well
  above the inner 6 s so the inner bound always fires first. A value the hook cannot
  read statically (a shell variable, another command's output, a file rewritten in the same command)
  blocks with advice to write the text to a file in an earlier call and pass `--body-file <file>`.
  The `new` aliases (`gh issue|pr|release|repo new`) are scanned as their `create` verbs, and a verb of
  a covered group that the scanner does not know (a new gh verb, or flags placed before the verb)
  **blocks** when the command carries one of that group's text flags (`--body`, `-b`, `--title`, ...);
  an unknown verb without one passes. The verb tables are read from `gh <group> <verb> --help`
  (gh 2.103.3): re-check them after a gh upgrade. Short flags follow gh's pflag parsing (`-wb text`,
  `-dt=x`, `-wbtext`): booleans chain and the first value-taking letter takes the rest of the token or
  the next argument, so a text flag later in a cluster is scanned, a non-text one (`-l`, `-R`) is not,
  and a letter the per-command short-flag table does not know **blocks**.
  The block reason names only the command, the field and the line number: never the matched term, and
  never a filesystem path - the denylist is named as "DENYLIST_FILE, else the default under the XDG config
  dir", a `--file` input by its label.
  Commands that do not mention `gh` are not parsed and pass silently.
- **`publish-release.ps1`** runs the same scan on the title and the notes file before anything else
  (also under `-DryRun`) and aborts through its usual error path. A tool hook only sees that script's
  call, never the `gh release create` inside it.
- **Audit mode**, for what is already published (and web-UI edits, which no hook sees):
  `node scripts/denylist-scan.js --audit [--repo OWNER/REPO]` pulls issues, PRs, comments, reviews,
  review comments, releases, milestones and labels through read-only `gh api` and prints
  `HIT <kind> <id> <field> line N`, never the text. Exit 1 on a hit or any fetch error. Run it before
  a release.

**Known gaps.** The hook reads a body file at hook time and gh reads it again at run time, so a file
changed in between is not seen (the audit mode is the backstop). User-defined aliases (`gh alias set`,
stored in gh's own config; `gh alias list` shows them) and gh extensions are **invisible** to the hook:
an alias outside the covered groups (`gh pub ...`) that expands to a publishing command passes
unscanned, as does a shell alias (`!`), and only the audit sees what it published. An alias filed under
a covered group (`gh issue mine`) is an unknown verb and blocks when it carries a text flag. `gh issue artifact create|edit` with a file
named as a positional argument publishes that file's contents unscanned (a `--body` or `--body-file`
on it blocks as an unknown verb). Branch, label and milestone names, release assets and gists are not
scanned either.

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
