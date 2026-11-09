---
name: release
description: >-
  Integration-to-release branch promotion ritual (merge-commit, NEVER squash). Use whenever
  promoting to the release branch, cutting or tagging a release, or on "release", "ship to main",
  "tag it".
---

# Release: promote integration branch → release branch

Work items land on the **integration branch** as squash commits; a release carries a *set* of them
onto the **release branch** intact. Read Project Facts for `integration-branch`, `release-branch`,
`build-cmd`, `test-cmd`, `changelog` (inline, then any `facts-file`, per the Project Facts
contract) - if any is missing, STOP and ask.

**When Project Facts `forge` is not `github`**, the `gh`-based promotion, merge, and tagging steps
below translate per that forge's adapter skill (`forge-azure-devops` for Azure DevOps); the
ritual's ordering and its never-squash rule stay authoritative regardless.

A key that merely **gates an optional feature** (e.g. `release-milestones`, `release-publish`) is
different: when it is absent from both places - including because the consumer's Project Facts block
predates the key - treat it as its **documented default** (stated at its step), not a STOP.
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
   commits: **if the project tags releases** (`release-tags: yes`, the default) and a prior tag
   exists, `git log <last-tag>..<integration-branch> --oneline`; **otherwise** - `release-tags: no`,
   or the **first** release with no prior tag - compare against the release branch,
   `git log <release-branch>..<integration-branch> --oneline` (a brand-new release branch means the
   whole integration history is this release). Never let a missing `<last-tag>` STOP the cut.
4. **Confirm with the user** that this set of items is the intended release cut. First read the
   hand-over's *Decisions taken under delegated authority* bullet and, under a hub, the
   decisions-log entries marked *awaiting ratification*: **list in the confirm any unratified call
   that rides in this cut, and do not cut until the user ratifies or reverts it.**

**Milestone completeness is not one of these preconditions.** A promotion carries whatever has landed
on the integration branch; an open **planning** milestone (the `backlog` skill's `milestones` key)
with unfinished items or an unanswered question inside it does not gate the cut, and neither does a
**release** milestone (*The ritual* step 5 creates *and* closes it at the cut). A consumer wanting
a cut gated on more than the four preconditions above states it in its own `CLAUDE.md`.

**Optional - offer a pre-release tech-debt / doc-drift scan.** *Offer* - not gate - a run of
`fluyt:tech-debt-reviewer` (with its doc-drift lens - skills/`CLAUDE.md` that contradict the code)
over the release range before promoting. Take it when the cut is substantial; skip freely for a
small or docs-only one. **If you run it, hand it the open-issue snapshot** in the spawn prompt -
`tech-debt-reviewer` has no `gh` and reviews blind without it.

## The ritual

**Trunk-based repos (`integration-branch == release-branch`):** there is no branch to promote - a
main→main PR is empty and errors. **Skip steps 1–2 entirely** and run the rest (tag if
`release-tags: yes`, restore-branch is moot, milestone, publish if `release-publish` is set,
verify) on the single branch. The numbered steps below assume the two branches **differ**.

**Unversioned repos (`changelog: none`):** a declared value, not a missing key, so the required-key
STOP above does not fire - it means the repo has no version. Skip Pre-flight 2 and the CHANGELOG
half of Pre-flight 3, and title the promotion PR (and any back-sync PR) by UTC date
(`YYYY-MM-DD`) instead of version. Tags, Releases and milestones need a version, so `none`
implies `release-tags: no`, `github-releases: no` and `release-milestones: no`. Every other
step runs as written, **including step 4's re-alignment**; a hotfix skips its CHANGELOG bump.

1. Open a PR **from the integration branch into the release branch**:
   ```
   gh pr create --base <release-branch> --head <integration-branch> --title "Release vX.Y.Z" --fill
   ```
   `--fill` takes the PR body from the commits. For a richer body, write it to a temp file and pass
   `--body-file <file>` - never inline `--body "…"`, which quotes badly across shells.
2. **Merge it with a merge commit** (`gh pr merge <n> --merge`, or the "Create a merge commit"
   button - **NOT** "Squash and merge"). Work-item PRs are squash-merged by convention, so GitHub
   may preselect either method - **always double-check the button**.
3. **Tag on the release branch - only when `release-tags: yes`** (default `yes`). A repo that pins
   consumers to the release branch and treats every push as a release (track-main) sets
   `release-tags: no` and **skips this step entirely** - see the marketplace note below.
   ```
   git checkout <release-branch> && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
   **Publish a GitHub Release - only when `github-releases: yes`** (default `no`; it implies
   `release-tags: yes`, since a Release needs a tag). Write a **summary** of everything since the
   previous release, never CHANGELOG sections pasted: one opening line naming the previous release;
   short bullets grouped by area; one line per change, giving its effect on the reader, not the
   mechanism; a closing pointer to the CHANGELOG version range. Write it to a temp file, then:
   ```sh
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notes-file>
   ```
   The tag and Release are **human-facing markers**; consumers still pin the branch tip.
4. **Restore the integration branch - GitHub may have just auto-deleted it.** If the repo has
   *Automatically delete head branches* enabled and the integration branch is **not** the default
   branch (Project Facts: `default-branch != integration-branch`), the step-2 merge deletes the
   integration branch (it was the PR's head). Recreate it from the release branch:
   ```sh
   git fetch origin                     # the step-2 merge happened server-side; your LOCAL
                                        # <release-branch> ref is stale until you fetch
   git push origin origin/<release-branch>:refs/heads/<integration-branch>
   ```
   **Push the *fetched* tip, never a stale local ref** - local `<release-branch>` still points at
   the *previous* release until `fetch`, and pushing it regresses the integration branch. Push
   `origin/<release-branch>` or the merge commit's SHA. Optionally gate it first: `git merge-base
   --is-ancestor origin/<integration-branch> origin/<release-branch>` must exit 0.

   This non-force push **recreates** the branch if deleted, or **fast-forwards** it if it survived.
   If rejected as non-fast-forward, the integration branch has commits not yet on the release
   branch - merge the release branch into it rather than force-pushing.

   **Better: prevent the deletion** - disable *Automatically delete head branches*
   (`adopt-conventions` §2's *Repo merge settings* step offers it) or protect the integration branch
   (the `branch-protection` skill). Either way, **never leave the integration branch gone** - the
   next work item branches off it.

   **If the integration branch is PR-protected and you are not a bypass actor, that push is
   rejected outright** - a zero-bypass `pull_request` rule binds the maintainer too. Read
   `back-sync-pr.md` in this skill's directory: the back-sync PR, its four preconditions, the arm +
   readback, the bounded wait, and the ancestry / empty-diff verify. Deliberate repeat: **its head
   is the RELEASE branch** - confirm `delete_branch_on_merge` is `false` (or a ruleset carrying
   `deletion` protects it) **before** opening it, or merging it deletes the branch consumers pin;
   and **merge it with a merge commit, never squash** - the auto-merge readback must print `MERGE`.

5. **Record the release milestone** - only if Project Facts `release-milestones: yes` (absent counts
   as `no`, default `no`). Group the items that shipped in this release under a GitHub Milestone
   named for the release version, so the release has a durable "what shipped in vX.Y.Z" record.
   Orthogonal to the `backlog` skill's `milestones` key (see Pre-flight). **Never assign an
   issue already in a live planning milestone to the release milestone too.**

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
   counts as `none`, the default). After the promotion, tag, and milestone, perform the declared
   publish - the documented command or manual step - that pushes the release to wherever consumers
   actually consume it: a package registry, a store, a deploy target. A **git-only** release (a
   marketplace repo whose consumers pin the branch tip) sets `none` and skips this. The release cut
   the user confirmed in Pre-flight 4 covers this publish - but if the publish is **separately
   irreversible** (an immutable registry version that can never be re-pushed or unpublished), name
   that specific step and confirm it before running.

Nothing in the CHANGELOG changes at release time and there is no tracker to sync. Release notes are
step 3's summary.

## Hotfix (out-of-band release)

A critical bug on the **release branch** while the integration branch holds unreleased work: read
`hotfix.md` in this skill's directory. It branches off the release branch, confirms the cut with
the user (Pre-flight 4's unratified-call check applies here too), merges with a merge commit
(never squash), and MUST back-merge into the integration branch - **never leave a hotfix only on
the release branch**.

## Note for marketplace-style repos

If this repo is itself a plugin marketplace whose consumers pin to the release branch tip, every
merge onto that branch is a live update to all of them - treat a release as a publish, with CI green
on the release branch before promoting. Tags aren't required here; the repo MAY set
`release-tags: yes` + `github-releases: yes` for human-facing Releases (a marker, not the pin).
