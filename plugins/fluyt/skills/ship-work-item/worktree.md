# §1 worktree-agent hygiene

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

- **Worktree-agent hygiene - now a common path, not an aside; every isolated spawn needs all four,
  and the session needs one precondition before the first of them:**
  - **Before the FIRST isolated spawn of a session, confirm the session root is the repo root.** A
    session rooted one directory above the repo never loads `<repo>/.claude/settings.json`, so
    **whichever `worktree.baseRef` the repo configures is inert** - an isolated agent then silently
    branches from the far-behind release branch, regardless of the configured value. Diagnose
    with the *Project settings resolve from the SESSION ROOT* check in `install-refresh-plugin`.
    Workaround for a mis-rooted session: plain `git worktree add` under the scratchpad, with
    **non-isolated** agents pointed at that path in their prompt.
  - **Commit any agent-definition or settings changes FIRST.** A worktree-isolated agent loads the
    *committed* definition + settings from its base commit - NOT your uncommitted working-tree
    edits. An uncommitted grant ⇒ the agent runs with the OLD capabilities.
  - **Which `baseRef` to configure depends on whether `default-branch` IS the `integration-branch`**
    (Project Facts) - the two topologies need opposite settings.
    - **`default-branch == integration-branch`** (the topology this playbook recommends, because it
      makes `Closes #N` auto-fire): prefer `worktree.baseRef: "fresh"` (leaving the key unset
      behaves identically). A worktree then branches from the remote **default** branch - which on
      this topology IS the integration branch - **but the client resolves "the remote default" via
      the local `origin/HEAD` symref, a clone-time snapshot that never auto-updates.** A repo whose
      GitHub default later moved keeps a symref at the old branch, and `fresh` then provisions off
      that stale target (the fail-fast base check below catches it). So run `git remote set-head
      origin --auto` in the same breath as the pre-spawn `git fetch` - one command that re-syncs the
      symref - and treat `fresh` as prevention **conditional on that symref being current**, with
      the base check as the mandatory backstop. **Caveat that survives regardless:** `fresh`
      branches from the **remote** tip, so an isolated agent spawned this way cannot build on
      unmerged local work or a local feature branch - an orchestrator wanting that must resume an
      agent in its existing worktree or set `head` for that one spawn. Push everything the isolated
      agent needs to `origin` before spawning.
    - **`default-branch != integration-branch`:** `fresh` would land the agent on the default
      branch, which is NOT the integration branch - set `worktree.baseRef: "head"` instead. A
      worktree then branches from your current local HEAD, so be on the freshly-synced integration
      branch (or the right feature branch) when you spawn.
  - **Right before you spawn, capture the expected base and state it in the spawn prompt** - the
    agent has nothing to assert against otherwise. On `fresh`, run `git rev-parse
    origin/<integration-branch>` (after a `git fetch`, if the remote tip might be stale); on `head`,
    run `git rev-parse HEAD` while standing on the freshly-synced branch. **Paste the SHA the
    command printed - never retype it**; a retyped SHA can carry a typo, which turns the
    base check into a check against a wrong expectation rather than the real base.
  - **Give the spawn prompt a fail-fast base check - existence AND identity, run FIRST.** Run it as
    the very first command of the spawned agent's turn, before any edit or commit: "Confirm `<a
    known-recent file/dir>` exists AND `git rev-parse HEAD` equals `<the expected base SHA stated
    above>`; on a mismatch, check whether the expected SHA even exists (`git cat-file -t <sha>`) and
    report which side is wrong - a pasted-in expectation that was never a real commit, or a worktree
    that genuinely branched off something else - then STOP either way." The discrepancy branch adds
    diagnosis; it never licenses proceeding - STOP stays the default action on any mismatch. Timing
    matters: HEAD moves the instant the agent commits, so a later check misreads its own work as
    drift or passes trivially. Existence alone only catches a base branched off the far-behind
    release branch; the identity half also catches a feature-branch base and an integration branch
    that moved after capture - with exact equality, never `git merge-base --is-ancestor <expected>
    HEAD`: a feature branch cut from the integration branch IS a descendant of it, so
    `--is-ancestor` PASSES for precisely the drift this check exists to catch. Compare commits, not
    branch names: the orchestrator is ON the intended base when it spawns, so git mints the new
    worktree a fresh name and `git branch --show-current` has nothing correct to match against.
  - **After an isolated agent hands back, the harness may have moved the session's working directory
    into that lane's worktree** - use absolute paths or `git -C`, and re-check `pwd`, before the
    next git command.
