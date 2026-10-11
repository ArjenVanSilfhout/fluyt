# The closing-keyword grep - pattern anatomy and fixtures

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here - before
changing or tightening the §4 PR-body grep pattern; its `§N` and *Section* references point into
that `SKILL.md`.

**Every piece of that pattern is load-bearing; a simpler version is a false-negative machine.**

- **`tr '\n' ' '` before the grep** - PR bodies and commit messages are hard-wrapped prose, so the
  keyword and its reference routinely land on **opposite sides of a line break**
  (`…finally fixes⏎#301 for good`). `grep` matches within a line and cannot see across one, so an
  unflattened version is blind to the entire wrapped class. Flattening costs line numbers, hence
  `-o`. **The asymmetry is the point** - a false positive costs a glance, a false negative costs a
  wrongly-closed issue.
- **`-i`** - bodies are written `Closes #N` with a capital, so a case-sensitive version returns
  nothing on a PR that closes an issue perfectly well.
- **`[-[:alnum:]._/]*` before `#`** - GitHub honours **cross-repo** references (`Closes
  owner/repo#42`), which a bare `#[0-9]+` pattern misses entirely.
- **`gh-[0-9]+`** - `GH-123` is a documented closing form and carries no `#` at all, so every
  `#`-anchored pattern is blind to it.
- **the `https?://…/issues/N` alternative** - a full issue URL closes just as well as the short form.
- **`\b`** before the keyword - without it, `disclosed #123` and `prefix #123` both fire. A check
  that cries wolf stops being read.
- **`[[:space:]:(]*`** as the separator - absorbs `Closes: #N`, `Fixes:#N` with no space at all, and
  `Fixes(#N)`. A `[[:space:]]+` that demands whitespace misses the last two.

Verify in this exact form against real PR bodies and against `NOT close #1` / `Fixes #2` /
`CLOSED #3` / `Resolves: #4` / `Closes owner/repo#5` / `Closes https://github.com/o/r/issues/6` /
`Closes GH-7` / a wrapped `fixes⏎#8` / `Fixes:#9` / `Fixes(#10)` (all fire) plus `related to #11` /
`#12 is not resolved here` / `disclosed #13` / `prefix #14` / `the gh-pages branch` /
`closing notes for #15` / `unresolved: #16` (all correctly silent). **If you tighten this pattern,
re-run every one of those** - the whole point is a check that cannot quietly say "clean".
