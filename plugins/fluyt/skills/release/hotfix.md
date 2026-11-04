# Hotfix (out-of-band release)

The on-demand part of the `release` skill, read when its `SKILL.md` points here; its *The ritual*
step and *Pre-flight* references point into that `SKILL.md`.

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
   commit**, observing the four preconditions in `back-sync-pr.md` (the required check must report
   even though this PR is not empty). Nothing follows this arm, so the bounded wait in that file's
   "all that is left of your turn" paragraph applies. A squashed back-merge loses the merge base, so
   the next promotion conflicts or reverts the fix.
