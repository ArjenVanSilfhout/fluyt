# §2 and §3: CHANGELOG, the issue, commit, push, PR

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

## 2. Update the CHANGELOG on the branch; close the issue via the PR

**CHANGELOG** (single source of truth - see the `versioning-and-changelog` skill for the full
anatomy): add a lean new top entry `## [X.Y.Z] — YYYY-MM-DD` (summary plus why, no file
inventory), and bump the `Current version:` line. **Version rule:** Project Facts `version-rules` is
authoritative; the canonical MINOR/PATCH shape and its tie-breaker are `versioning-and-changelog`'s
*The bump rule*. **File count is not an axis** - a one-file change that alters product behaviour is
MINOR. **`changelog: none` (an unversioned repo) means no entry, no bump, and no version in the
commit subject.**

**Point-of-use reminder (deliberate - the rules live in §1):** every number, count, and identifier
in this entry - and in the PR body and issue comments below - follows §1's *pasted from a fresh
read, never recalled* bullet, and any figure a delegate reported follows §1's *report is a secondary
source* bullet (re-measure before citing). This line points; it does not restate.

**The issue** (no tracker file to edit):

- Put **`Closes #<n>` in the PR body**. Whether it auto-closes depends on the default branch:
  - `integration-branch == default-branch` (Project Facts) ⇒ the merge auto-closes the issue.
  - `integration-branch != default-branch` ⇒ GitHub will NOT auto-close → you MUST close it
    manually after the merge (§4, *After the merge lands* step 1).
  - Auto-close can silently no-op even when correctly wired, so **always verify after merge**
    regardless.
- **A closing keyword fires on the TOKEN PATTERN, regardless of the surrounding words - a negation
  does not disarm it.** GitHub matches `close`/`closes`/`closed`/`fixes`/`resolves` adjacent to an
  issue reference; it does not read English. A PR body reading *"this does **NOT** close #N"*
  **would close the issue anyway.** To mention an issue without closing it, phrase it **noun-first**
  so no keyword touches the number - *"#N is not resolved here"*, *"related to #N"*, *"follow-up:
  #N"*.
- No issue (a pure process/tooling chore) → the PR carries an explicit "no issue - <why>" note.
- Any per-item decision → record it as an issue comment; durable → also in the decisions file
  (Project Facts `decisions`). **An in-session ratification is citable only once that durable
  record exists** - a dialog answer is not an artifact, so write the comment / decisions entry
  FIRST, then cite what the forge returned (the artifact-citation rule below, applied forward).
- **When you claim to have recorded something externally, cite the ARTIFACT the forge returned -
  never the act.** The comment URL `gh issue comment` prints, the number/URL `gh issue create` /
  `gh pr create` prints - not a paraphrase like "I noted it on the issue." A recording claim with no
  returned artifact is unverified, and must be written as such.
- Remove any in-code `// TODO:` comment the item implemented.

## 3. Commit, push, PR

- **Stage specific paths - never `git add -A` blindly, and confirm the branch first.** The user's
  local working tree often carries unrelated WIP (uncommitted assets, local experiments), and when
  the maintainer co-edits the same checkout a `git checkout` can move HEAD under you - a staged
  commit then lands on the wrong branch. So **before every `git add` / `git commit`, re-check that
  `git branch --show-current` is the branch you intend and that `git status` shows only this item's
  files** - abort or redirect if HEAD moved; stage explicit paths, never `git add -A`. It does not
  stop whoever moved `HEAD` - §1's *While a non-isolated agent is live* does; both are needed.
- **Commit identity:** the maintainer's git identity only - **omit any co-author trailer** if
  Project Facts `co-author-trailers: forbidden`.
- **Pre-flight gate (multi-file / product-code items):** after committing, spawn the read-only
  `fluyt:preflight-reviewer` agent on the branch - it re-runs build + tests and checks diff scope,
  trackers, and invariants, returning PASS or a numbered fix list. **That spawn is backgrounded like
  any other (§1), so do not wait on it here** - continue to the push step below, which opens the PR
  as a draft while the review runs. §4 owns what happens when the findings arrive. Trivial docs-only
  chores may skip the gate (say so in your summary). **Hand the reviewer the plugin rules it must
  cite** - the plugin path, per §1's spawn-brief rule.
- **Push and open the PR into the integration branch - as a draft whenever a review is still
  running** (§4's standing pairing; that is the ordinary path for any item that ran the gate):
  ```
  git push -u origin <branch>
  gh pr create --fill --base <integration-branch> --draft
  ```
  Drop `--draft` only when no review is outstanding - the gate was skipped, or it already reported.
- **Capture the PR number from `gh pr create`'s own output - never derive or guess it.** PRs share
  the issue number sequence, so a guessed number targets a wrong-or-missing object (a guessed
  number can even resolve to some *other* PR).
  Every later step (checks-watch, merge, ready) uses only the number/URL that `create` printed.
- **PR title = the squash commit subject** in the Project Facts `commit-subject` format (canonical:
  `<type-or-id>: <summary> (vX.Y.Z)`); the length cap is in `versioning-and-changelog`,
  *Version-stamped commit subjects*. **Put `Closes #<issue>` (or the "no issue - <why>" note) in the
  commit MESSAGE BODY** - a line below the subject - so `gh pr create --fill` carries it into the PR
  body and the merge auto-closes the issue. The subject's bare `#<issue>` only *links*; it does
  **not** close. (An explicit PR body must carry it too.) **The commit body is only a non-obvious
  why plus that closing line (or the no-issue note)** - never restate the CHANGELOG entry or the
  diff; when the subject says it all, it is just that line. **The PR body is that commit body plus
  the CHANGELOG version and the gate result** (the `test-cmd` verdict, and whether preflight ran),
  plus anything another rule requires there; the read-back below can add the version and gate lines
  with `gh pr edit --body-file`. The CHANGELOG stays the one place the change is described.
- **`--fill`'s title/body split depends on commit count - read the created PR back before trusting
  it.** On a single-commit branch, `--fill` takes the title from the commit subject and the body
  from its message body - the `Closes #<issue>` line included, as above. With two or more commits
  - this ritual's most common shape - it titles the PR with the **raw branch name** and fills the
  body with **bulleted commit subjects only**, so `Closes #<issue>` never lands and, under
  `squash_merge_commit_title: COMMIT_OR_PR_TITLE` (§4), the branch name becomes the squash subject.
  `--fill-first` takes both from the FIRST commit, so a bodyless first commit leaves the PR body
  empty. So **immediately after `gh pr create`, read the created PR's actual title
  and body back (`gh pr view <n> --json title,body`) and correct them with `gh pr edit <n> --title …
  --body-file …` before doing anything else.** Run it on every PR this ritual opens, single-commit
  or not.
- **Multi-paragraph `gh` bodies go in a temp file - never inline `--body "…"`.** Whenever you pass
  an explicit body to `gh pr create` / `gh issue create` / `gh issue comment` / `gh pr comment`,
  write it to a temp file and use `--body-file <file>`. Inline `--body` quotes badly and breaks
  differently across shells (PowerShell vs POSIX).
