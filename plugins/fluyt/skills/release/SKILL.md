---
name: release
description: >-
  The integration-branch → release-branch promotion ritual - merge-commit (NEVER squash), optional
  version tag, pre-flight checks, restoring the integration branch if GitHub auto-deletes it on
  merge, and recording a release-version milestone when the project uses one. Use whenever promoting
  to the release branch, cutting/tagging a release or version, or when the user says "release",
  "ship to main", or "tag it". GitHub's default merge button is squash, destroying per-item history -
  this skill exists to prevent that.
---

# Release: promote integration branch → release branch

Work items land on the **integration branch** as squash commits; a release carries a *set* of them
onto the **release branch** intact. Read Project Facts for `integration-branch`, `release-branch`,
`build-cmd`, `test-cmd`, `changelog` - if any is missing, STOP and ask.

**When Project Facts `forge` is not `github`**, the `gh`-based promotion, merge, and tagging steps
below translate per that forge's adapter skill (`forge-azure-devops` for Azure DevOps); the
ritual's ordering and its never-squash rule stay authoritative regardless.

A key that merely **gates an optional feature** (e.g. `release-milestones`, `release-publish`) is
different: when it is absent - including because the consumer's Project Facts block predates the key
being added to the template - treat it as its **documented default**, not a STOP. For
`release-milestones` the default is `no` (skip the milestone step); for `release-tags` the default is
`yes` (tag the release); for `release-publish` the default is `none` (skip the publish step).
STOP-and-ask is for the required keys above, not for an unset feature gate.

**The one rule that matters:** the release PR merges with a regular **MERGE COMMIT, never squash** -
squashing collapses the whole release into one commit and loses the per-item history that the
release branch exists to preserve. (Work-item PRs into the integration branch are the opposite:
always squash.)

## Pre-flight

1. `git checkout <integration-branch> && git pull` - confirm no work-item PR is still pending
   auto-merge (`gh pr list --base <integration-branch>`).
2. **The release version = the `Current version:` line in the CHANGELOG** (the single source of
   truth) - do NOT invent a new number at release time. Releases don't bump; they tag what the
   integration branch already is.
3. Sanity: build + test green (run `build-cmd` / `test-cmd` from Project Facts - skip whichever is
   `none`); the CHANGELOG's newest entries match the commits since the last release. To list those
   commits: **if the project tags releases** (`release-tags: yes`, the default) and a prior tag exists,
   `git log <last-tag>..<integration-branch> --oneline`; **otherwise** - `release-tags: no`, or the
   **first** release where no prior tag exists - compare against the release branch instead,
   `git log <release-branch>..<integration-branch> --oneline` (a brand-new release branch means the
   whole integration history is this release). Never let a missing `<last-tag>` STOP the cut.
4. **Confirm with the user** that this set of items is the intended release cut. First read the
   hand-over's *Decisions taken under delegated authority* bullet and, under a hub, the
   decisions-log entries marked *awaiting ratification*: **list in the confirm any unratified call
   that rides in this cut, and do not cut until the user ratifies or reverts it.**

**Milestone completeness is not one of these preconditions.** A promotion carries whatever has landed
on the integration branch; an open **planning** milestone (the `backlog` skill's `milestones` key)
with unfinished items or an unanswered question inside it does not gate the cut, and neither does a
**release** milestone (*The ritual* step 5 creates *and* closes it at the cut). A consumer that
wants a cut gated on something beyond the four preconditions above states it in its own `CLAUDE.md`.

**Optional - offer a pre-release tech-debt / doc-drift scan.** A release is a natural checkpoint for
drift accumulated across the shipped items: *offer* - not gate - a run of `fluyt:tech-debt-reviewer`
(with its doc-drift lens - skills/`CLAUDE.md` that contradict the code) over the release range
before promoting. Take it when the cut is substantial and skip freely for a small or docs-only
one. **If you run it, hand it the open-issue snapshot** in the spawn prompt - `tech-debt-reviewer`
has no `gh` and reviews blind without it.

## The ritual

**Trunk-based repos (`integration-branch == release-branch`):** there is no branch to promote - a
main→main PR is empty and errors. **Skip steps 1–2 entirely** and run the rest (tag if
`release-tags: yes`, restore-branch is moot, milestone, publish if `release-publish` is set, verify)
on the single branch. The "release" is just tagging / publishing what the branch already is. The
numbered steps below assume the two branches **differ**.

**Unversioned repos (`changelog: none`):** a declared value, not a missing key, so the required-key
STOP above does not fire - it means the repo has no version. Skip Pre-flight 2 and the CHANGELOG
half of Pre-flight 3, and title the promotion PR (and any back-sync PR) by UTC date
(`YYYY-MM-DD`) instead of version. Tags, GitHub Releases and release milestones need a version, so
`none` implies `release-tags: no`, `github-releases: no` and `release-milestones: no`. Every other
step runs as written, **including step 4's re-alignment**; a hotfix skips its CHANGELOG bump.

1. Open a PR **from the integration branch into the release branch**:
   ```
   gh pr create --base <release-branch> --head <integration-branch> --title "Release vX.Y.Z" --fill
   ```
   `--fill` takes the PR body from the commits. For a richer release-notes body, write it to a temp
   file and pass `--body-file <file>` - never inline `--body "…"`, which quotes badly across shells
   (PowerShell vs POSIX).
2. **Merge it with a merge commit** (`gh pr merge <n> --merge`, or the "Create a merge commit"
   button - **NOT** "Squash and merge"). Work-item PRs are squash-merged by convention, so GitHub
   may preselect either method depending on repo settings - **always double-check the button**.
3. **Tag on the release branch - only when `release-tags: yes`** (the documented default). A repo that
   pins consumers to the release branch and treats every push as a release (track-main) sets
   `release-tags: no` and **skips this step entirely** - see the marketplace note below.
   ```
   git checkout <release-branch> && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   **Publish a GitHub Release - only when `github-releases: yes`** (default `no`; it implies
   `release-tags: yes`, since a Release needs a tag). Write a **summary** of everything since the
   previous release, never CHANGELOG sections pasted: one opening line naming the previous release;
   short bullets grouped by area (whatever areas this release touched); one line per change, giving
   its effect on the reader, not the mechanism; a closing pointer to the CHANGELOG version range for
   full detail. Write it to a temp file, then:
   ```sh
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notes-file>
   ```
   The tag and Release are **human-facing markers**; consumers still pin the branch tip.
4. **Restore the integration branch - GitHub may have just auto-deleted it.** If the repo has
   *Automatically delete head branches* enabled and the integration branch is **not** the default
   branch (Project Facts: `default-branch != integration-branch`), the step-2 merge deletes the
   integration branch - it was the PR's head, and GitHub auto-deletes a merged head that isn't the
   default. Recreate it from the release branch:
   ```sh
   git fetch origin                     # the step-2 merge happened server-side; your LOCAL
                                        # <release-branch> ref is stale until you fetch
   git push origin origin/<release-branch>:refs/heads/<integration-branch>
   ```
   **Push the *fetched* tip, never a stale local ref** - local `<release-branch>` still points at the
   *previous* release until `fetch`, and pushing it regresses the integration branch. Push
   `origin/<release-branch>` or the merge commit's SHA. Optionally gate it first:
   `git merge-base --is-ancestor origin/<integration-branch> origin/<release-branch>` must exit 0 -
   that is the fast-forward guarantee.

   This non-force push **recreates** the branch if it was deleted, or **fast-forwards** it if it
   survived. If it is rejected as non-fast-forward, the integration branch has commits not yet on the
   release branch - merge the release branch into it rather than force-pushing.

   **Better: prevent the deletion** - disable *Automatically delete head branches* (`adopt-conventions`
   §2's *Repo merge settings* step offers it; per-PR cleanup still works via
   `gh pr merge --delete-branch`) or protect the integration branch (GitHub never auto-deletes a
   protected branch; the `branch-protection` skill). Either way, **never leave the integration branch gone** - the next
   work item branches off it.

   **If the integration branch is PR-protected and you are not a bypass actor, that push is rejected
   outright** - a zero-bypass `pull_request` rule binds the maintainer too, which is the point of it.
   Do the same job as a PR instead. Four preconditions first, each of which fails destructively or
   permanently if skipped:

   - **The back-sync PR's head is the RELEASE branch.** With *Automatically delete head branches*
     enabled, merging this PR **deletes the branch your consumers pin**. Confirm
     `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge` is `false`, or give the release branch
     its own ruleset carrying `deletion` (the `branch-protection` skill's `release` role),
     **before** opening it.
   - **A required status check will not have reported yet**, and with zero bypass actors there is no
     way to force the merge - so arm auto-merge rather than merging immediately.
   - **The required check must actually run on this PR.** The back-sync is empty by construction, and
     a `paths:` / `paths-ignore:`-filtered workflow is *skipped* on it, leaving a required check
     **Pending forever** (`branch-protection` explains). The context named in the integration
     branch's `required_status_checks` must report unconditionally.
   - **A consumer's own automation or workflow may auto-arm this PR with its own method**, winning
     the race against the arm command below - the PR can read back armed-SQUASH though the command asked for
     `--merge`. Before opening the PR, check for any workflow or automation that auto-arms merge on PRs into the
     integration branch, and either exclude the release branch's head from it or expect to override
     the arm (readback below).

   Write the body to a temp file per the promotion step's `--body-file` note above: this delta is a
   single merge commit and `--fill` reads only non-merge commits, so it fails with `could not compute
   title or body defaults: could not find any commits between …` - not a sign the promotion failed.
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
   (`gh pr merge <n> --disable-auto`), then run the same bounded check as below (`gh pr checks <n>`, no
   `--watch` - `agent-liveness` owns that rule), and once it reports green, merge directly with
   `gh pr merge <n> --merge`. A workflow triggered on `synchronize` re-arms on every later push while
   the PR stays open, so one disarm is not durable - the readback must follow the *last* arm-affecting
   event, not just this one.

   **If the armed back-sync is all that is left of your turn, no next turn is coming.** Steps 5–6
   below do not wait on this merge - run them first - then start the one bounded wait
   `agent-liveness` distinguishes from watching, with the `MERGED|CLOSED` poll loop from
   `ship-work-item` §4's arm bullet, and end the turn. It only wakes you: the ancestry and
   empty-diff check below still starts from your own read of the PR's state.

   (If the repo has not enabled auto-merge: never watch the check run - `agent-liveness` owns that
   rule. Run a **bounded check** - `gh pr checks <n>`, no `--watch` - at the top of the next turn that
   needs the result, and once it reports green, `gh pr merge <n> --merge`. If no next turn is coming,
   report "back-sync checks pending; merge to do" to whoever coordinates the lane instead.
   `adopt-conventions` §2's *Repo merge settings* step offers `allow_auto_merge`.)

   **Squashing a back-sync is the one thing that breaks this**: the integration branch *diverges*
   from the release branch, and the next promotion conflicts or silently reverts. The **integration**
   branch's ruleset must therefore allow the merge method as well as squash
   (`branch-protection` gives it `["squash", "merge"]`; the release branch is merge only).

   **Expect the PR to read "1 commit, 0 files changed"** - the promotion merge commit already carries
   the integration branch's exact tree. That is proof it worked; don't abandon it.

   After a PR back-sync the two branches are **content-identical but not SHA-identical**: the
   integration branch carries one extra merge commit. That is correct and expected - verify with
   ancestry plus an empty diff rather than equal SHAs:
   ```sh
   git fetch origin
   git merge-base --is-ancestor origin/<release-branch> origin/<integration-branch>   # exit 0
   git diff --quiet origin/<release-branch> origin/<integration-branch>               # exit 0
   ```
5. **Record the release milestone** - only if Project Facts `release-milestones: yes` (absent counts
   as `no`, per the default rule above). Group the items that shipped in this release under a GitHub
   Milestone named for the release version, so the release has a durable "what shipped in vX.Y.Z"
   record. This key is **orthogonal** to the `backlog`
   skill's `milestones` key (*planning* milestones, open, used to select work); `release-milestones`
   governs *release-version* milestones (created and closed at release). **Never assign an issue
   already in a live planning milestone to the release milestone too.**

   **First derive the shipped-issue set, and guard on it.** List the `#N` this release closed - from
   this release's CHANGELOG section(s) (their `Closes #N` lines) or from
   `git log <previous-release>..<release-branch> --oneline` subjects. **If that set is empty, skip
   this step entirely - create no milestone.** Only when it is **non-empty**, create → populate →
   close in one pass:
   ```sh
   # 1. Ensure the milestone exists (ignore "already_exists"):
   gh api "repos/<owner>/<repo>/milestones" -f title="vX.Y.Z" -f description="Release vX.Y.Z" \
     --jq '.number' 2>/dev/null || \
     gh api "repos/<owner>/<repo>/milestones?state=all" --jq '.[]|select(.title=="vX.Y.Z").number'
   # 2. Assign every issue shipped in this release, then close the milestone:
   gh issue edit <N> --milestone "vX.Y.Z"          # repeat per shipped issue
   gh api -X PATCH "repos/<owner>/<repo>/milestones/<milestone-number>" -f state=closed
   ```

6. **Run the publish step - only if Project Facts `release-publish` is set** (not `none`; absent
   counts as `none`, per the default rule above). After the promotion,
   tag, and milestone, perform the declared publish - the documented command or manual step - that
   pushes the release to wherever consumers actually consume it: a package registry, a store, a
   deploy target. A **git-only** release (a marketplace repo whose consumers pin the branch tip)
   sets `none` and skips this. The release cut the user confirmed in Pre-flight 4 covers this
   publish - but if the publish is **separately irreversible**
   (an immutable registry version that can never be re-pushed or unpublished), name that specific step
   and confirm it before running.

## Afterwards

Nothing in the CHANGELOG changes at release time, and there is no tracker to sync - the backlog
issues were closed per work item as they merged (and, if `release-milestones: yes`, grouped under the
release-version milestone in step 5). Release notes are step 3's summary.

## Hotfix (out-of-band release)

A critical bug on the **release branch** while the integration branch holds unreleased work needs a
path that does not drag that unreleased work along - so don't cut a normal promotion. Hotfix instead:

**Split topology only (`integration-branch != release-branch`).** A trunk-based repo has no
unreleased-work problem to route around and no branch to back-merge into - fix it as a normal work
item, squash-merged onto the single branch, then tag/publish if the release keys say so. Every step
below assumes the two branches differ.

1. Branch off the **release branch**, not integration:
   `git checkout <release-branch> && git pull && git checkout -b fix/<slug>`.
2. Fix and verify (build / test per Project Facts); bump the CHANGELOG (a PATCH - see `version-rules`).
3. Open a PR **into the release branch**, **confirm the cut with the user** (for a marketplace repo
   this is a live publish to consumers; Pre-flight 4's unratified-call check applies here too), and
   **merge it with a merge commit** - `gh pr merge <n> --merge`, never squash, as *The ritual*
   step 2. The never-squash rule belongs to the split topology's **release branch**, not to the
   promotion PR alone: every PR landing on it merges the same way, and the default button is still
   squash. The `branch-protection` skill's `release` role ruleset rejects a squash at the button.
4. If `release-tags: yes` / `github-releases: yes`, tag + publish the Release as in *The ritual* step 3.
5. **Merge the release branch back down into the integration branch** so the next promotion doesn't
   revert the fix:
   `git checkout <integration-branch> && git pull && git merge <release-branch> && git push` -
   the push is the step that makes it real; a local-only back-merge leaves the fix exactly where the
   rule says it must not stay. **Never leave a hotfix only on the release branch.** If the integration
   branch is PR-protected with no bypass, open a back-sync PR instead and **merge it with a merge
   commit**, observing *The ritual* step 4's four preconditions (the required check must report even though
   this PR is not empty). Nothing follows this arm, so the
   bounded wait in that step's "all that is left of your turn" paragraph applies. A squashed
   back-merge loses the merge base, so the next promotion conflicts or reverts the fix.

## Note for marketplace-style repos

If this repo is itself a plugin marketplace whose consumers pin to the release branch tip, every
merge onto that branch is a live update to all of them - treat a release as a publish, with CI green
on the release branch before promoting. Tags aren't required here; the repo MAY set
`release-tags: yes` + `github-releases: yes` for human-facing GitHub Releases (a marker, not the
pin).
