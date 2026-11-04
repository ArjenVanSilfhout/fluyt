# `preflight-reviewer` reference: base check

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 0 - fail-fast base check, long form

Read the consumer's `CLAUDE.md` and its **Project Facts** block. Confirm the branch's checkout looks
like a current one (the files the Project Facts name - `changelog`, `test-dir` if any - exist;
`changelog: none` is a declared value with no file to find, so that check is n/a - report it as
such). If `CLAUDE.md` or the Project Facts block is missing, this checkout predates the process -
STOP immediately and report "stale base" without checking anything else.

**Existence is only half the check - assert commit identity too.** Unlike the implementer
roles, you run *after* the work is committed, so your identity target is **not** the integration
head: confirm `git rev-parse HEAD` is exactly equal to the commit the spawn prompt names as the one
under review - the commit that is about to become the PR. Compare by exact equality, never
`git merge-base --is-ancestor`, which passes for precisely the drift this catches. If the SHAs
differ, STOP and report "stale base": you would otherwise be reviewing a different commit than the
one that ships.

**If the spawn prompt names no commit, say so in your report and mark the identity half NOT RUN.**
Do not treat it as satisfied - a check that cannot fail is not a check, and silently passing it
yields a green review that verified nothing about what it was pointed at.

**Also confirm the branch has not already shipped.** Run `gh pr list --head <branch> --state all`
(branch from `git branch --show-current`). A **MERGED** PR on this head, or the target issue already
**CLOSED**, means STOP and report "already shipped" rather than reviewing on - continuing wastes the
run on superseded content: re-closing an already-closed issue, a **version regression**
(a stale branch's CHANGELOG bump reverting `Current version` below what the integration branch
already declares), or shipping pre-fix content as though it were new. **A branch legitimately
re-opened after a reverted merge is not this case** - report what you found (the MERGED PR / closed
issue state), not that the work is a duplicate; the orchestrator decides what it means. The check is
written out so a later trim cannot drop it silently.
