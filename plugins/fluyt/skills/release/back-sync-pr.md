# Back-sync PR for a PR-protected integration branch

The on-demand part of the `release` skill, read when its `SKILL.md` points here; its *The ritual*
step and *Pre-flight* references point into that `SKILL.md`.

If the integration branch is PR-protected and you are not a bypass actor, the step 4 push is
rejected outright - a zero-bypass `pull_request` rule binds the maintainer too. Do the same job as
a PR instead. Four preconditions first, each of which fails destructively
or permanently if skipped:

- **The back-sync PR's head is the RELEASE branch.** With *Automatically delete head branches*
  enabled, merging this PR **deletes the branch your consumers pin**. Confirm
  `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge` is `false`, or give the release branch
  its own ruleset carrying `deletion` (the `branch-protection` skill's `release` role),
  **before** opening it.
- **A required status check will not have reported yet**, and with zero bypass actors there is no
  way to force the merge - so arm auto-merge rather than merging immediately.
- **The required check must actually run on this PR.** The back-sync is empty by construction,
  and a `paths:` / `paths-ignore:`-filtered workflow is *skipped* on it, leaving a required check
  **Pending forever** (`branch-protection` explains). The context named in the integration
  branch's `required_status_checks` must report unconditionally.
- **A consumer's own automation or workflow may auto-arm this PR with its own method**, winning
  the race against the arm command below - the PR can read back armed-SQUASH though the command
  asked for `--merge`. Before opening the PR, check for any workflow or automation that auto-arms
  merge on PRs into the integration branch, and either exclude the release branch's head from it
  or expect to override the arm (readback below).

Write the body to a temp file and pass `--body-file`: this delta is a single merge commit and
`--fill` reads only non-merge commits, so it fails with `could not compute title or body defaults:
could not find any commits between …` - not a sign the promotion failed.
```sh
gh pr create --base <integration-branch> --head <release-branch> --title "Back-sync vX.Y.Z" \
  --body-file <file>
gh pr merge <n> --merge --auto   # a MERGE COMMIT — never squash; --auto waits for the check
```
**Read the armed method back immediately - a workflow can win the race silently.**
```sh
gh pr view <n> --json autoMergeRequest --jq .autoMergeRequest.mergeMethod   # must print MERGE
```
Empty means auto-merge isn't armed at all - re-arm, don't proceed assuming it already merged.
`SQUASH` means a consumer workflow's own arm won the race: disarm it
(`gh pr merge <n> --disable-auto`), then run the bounded check described below, and once it
reports green, merge directly with `gh pr merge <n> --merge`. A workflow triggered on `synchronize`
re-arms on every later push while the PR stays open, so one disarm is not durable - the readback
must follow the *last* arm-affecting event, not just this one.

**If the armed back-sync is all that is left of your turn, no next turn is coming.** *The ritual*
steps 5-6 do not wait on this merge - run them first - then start the one bounded wait
`agent-liveness` distinguishes from watching, with the `MERGED|CLOSED` poll loop from
`ship-work-item` §4's arm bullet, and end the turn. It only wakes you: the ancestry and
empty-diff check below still starts from your own read of the PR's state.

The **bounded check** is `gh pr checks <n>`, no `--watch` - `agent-liveness` owns that rule; never
watch the check run. If the repo has not enabled auto-merge, run it at the top of the next turn
that needs the result, and once it reports green, `gh pr merge <n> --merge`. If no next turn is
coming, report "back-sync checks pending; merge to do" to whoever coordinates the lane instead.
`adopt-conventions` §2's *Repo merge settings* step offers `allow_auto_merge`.

**Squashing a back-sync is the one thing that breaks this**: the integration branch *diverges*
from the release branch, and the next promotion conflicts or silently reverts. The
**integration** branch's ruleset must therefore allow the merge method as well as squash
(`branch-protection` gives it `["squash", "merge"]`; the release branch is merge only).

**Expect the PR to read "1 commit, 0 files changed"** - the promotion merge commit already
carries the integration branch's exact tree. That is proof it worked; don't abandon it.

After a PR back-sync the two branches are **content-identical but not SHA-identical**: the
integration branch carries one extra merge commit. That is correct and expected - verify with
ancestry plus an empty diff rather than equal SHAs:
```sh
git fetch origin
git merge-base --is-ancestor origin/<release-branch> origin/<integration-branch>   # exit 0
git diff --quiet origin/<release-branch> origin/<integration-branch>               # exit 0
```
