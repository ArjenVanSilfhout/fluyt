# Parallel work (several file-disjoint items at once)

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here; its `§N`
and *Section* references point into that `SKILL.md`.

The default ritual is one item at a time. When several independent items have **non-overlapping file
sets**, you can parallelize the *implementation* while keeping *integration* strictly one-PR-at-a-time
(the §4 rule holds unchanged) - parallel implementation saves wall-clock, sequential integration keeps
every CHANGELOG/version bump conflict-free. Don't reach for this unless the items are genuinely
file-disjoint; overlapping files collide and aren't worth the coordination.

1. **Pick FILE-DISJOINT items; the orchestrator owns the shared files.** No two items may edit the
   same file. The `changelog` and its `Current version:` bump are shared by every item, so **you (the
   orchestrator) own them** and no spawned agent touches them - that is what turns N top-of-file
   CHANGELOG edits from guaranteed conflicts into a non-issue.
2. **One `developer` per item, `isolation: worktree`.** Each runs in its own isolated worktree, so
   parallel builds neither share a working tree nor race on build-output directories. Instruct each to:
   implement ONLY its listed files; get `build-cmd` + `test-cmd` green **per Project Facts (skip
   whichever is `none`)**; commit on its worktree branch; and **report its worktree path and branch** -
   the spawn's completion metadata carries the worktree path, with `git worktree list` from the main
   checkout as the fallback. Have it also print `git branch --show-current` and `git log --oneline -1`
   so you can map branch → commit. The §1 worktree-agent hygiene applies to every spawn (commit any
   agent-definition / settings change FIRST; spawn from the freshly-synced integration branch and state
   its captured SHA; give a fail-fast base check for existence and identity).
3. **Run `test-writer` in that dev's *existing* worktree - not a fresh one.** `isolation: worktree`
   always mints a *new* worktree, so to test exactly what the dev built, spawn `test-writer`
   **non-isolated** (it runs in the main checkout) and point it at the dev's worktree path in its
   prompt with hard rules: `git -C <worktree>` (or `cd "<worktree>"`) for **every** command; absolute
   paths under the worktree for Read/Write/Edit (its tests live at `<worktree>/<test-dir>`);
   **verify-first** - assert `git -C <worktree> branch --show-current` equals the dev's branch and
   `git -C <worktree> log --oneline -1` equals the dev's commit *before* writing a test; run `test-cmd`
   from the worktree; then `git -C <worktree> add <test-dir> && commit` so the tests land on the dev's
   branch - the one commit the `test-writer` contract permits (its *Hard boundary* exception), so the
   brief must instruct it explicitly. Skip for un-testable items or where `test-dir` is `none`.
   (Alternatively the `developer` can invoke `test-writer` inside its own worktree - also valid; the
   orchestrator-driven form above is preferred because it keeps the delegation boundary clean: the
   `developer` never authors its own tests.)
4. **Hold the integration branch, CHANGELOG, and PR until each item's tests have landed on its
   branch.** The branch you hand to integration must already carry **product + tests** together.
5. **Integrate SEQUENTIALLY - one PR at a time, onto the CURRENT integration head.** For each item in
   turn: branch a fresh `<type>/i<N>-<slug>` off the *up-to-date* integration head, `git cherry-pick`
   the worktree branch's commits (product + tests) onto it (rebase-onto works too), then **you** add
   that item's CHANGELOG entry + version bump on this branch and run §2 → §4. A worktree branch's base
   goes **stale the moment the first item merges**, so re-applying onto the current head - rather than
   merging the stale worktree branch as-is - is what keeps each CHANGELOG entry conflict-free. This is
   the same one-PR-at-a-time serialization as §4; only the *implementation* ran ahead in parallel.
6. **Clean up the worktrees.** Before removing a worktree or deleting its lane branch, verify the
   lane's content actually landed by the item's **terminal state** - its issue CLOSED, its PR MERGED -
   the same observed-state deletion gate §4 already applies before deleting a PR's head branch, here
   extended to the lane-branch/worktree case, where the lane branch itself never became a PR head
   (step 5 cherry-picks its commits onto a fresh branch, and that fresh branch is what opens the PR).
   **`git cherry` / patch-id comparison is a known false signal for this check:** it reads an
   already-integrated lane branch as unmerged (`+`) because the §4 squash merge lands the lane's
   cherry-picked commits together with the orchestrator's separate CHANGELOG/version commit as ONE
   integration commit - no upstream commit then carries the lane commit's own patch-id, so the
   comparison reads `+` for every integrated lane. A `+` result there is not evidence the content
   failed to land. The dev-agent worktrees are
   harness-**git-locked** - that blocks `worktree prune`, not in-place edit/build/commit - so remove
   each with `git worktree remove --force <path>` once its commits are integrated, then delete its
   lane branch too: `git branch -D <lane-branch>` - the branch the developer reported or
   `git worktree list` showed (keep the harness's `worktree-agent-*` naming as an example of what
   that looks like on one client, never as the rule). Use `-D`, not `-d`: the same patch-id mismatch
   above means git's own merged-ness check reads an already-integrated lane as unmerged and refuses
   `-d`, so the terminal-state gate above governs the deletion, not git's opinion. The harness's own
   auto-removal of an unchanged isolated worktree leaves its branch the same way, so the delete
   applies there too.

**On the Workflow harness:** you can fan out the parallel *implementation* with `parallel()` /
`isolation: 'worktree'`, but integration stays a main-agent git + PR loop. The harness's worktree
isolation also mints a *fresh* worktree per agent (so pointing `test-writer` at an existing worktree is
the same prompt-driven pattern as step 3), and the sequential cherry-pick → CHANGELOG → PR → merge →
sync loop isn't a natural pipeline stage.
