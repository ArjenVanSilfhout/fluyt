# Known failure modes this ritual prevents

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here; its `§N`
and *Section* references point into that `SKILL.md`.

- **Silently-unclosed issues** - `Closes #N` can fail to auto-close (it depends on the default
  branch, and can no-op even when wired right); hence the mandatory post-merge verify +
  manual-close fallback.
- **Version drift** - "multi-file ⇒ MINOR" applied naively makes the version wobble; hence the
  tooling-is-PATCH tie-breaker (see `versioning-and-changelog`).
- **Orphaned polls** - background auto-merge watch loops die on session teardown ("no completion
  record"); hence fire-and-forget.
- **A PR closed unmerged by its own cleanup** - deleting a work branch while its PR is still open
  closes that PR instead of merging it and takes both refs with it; hence the observed-`MERGED`
  gate on §4's cleanup step.
- **Stale or drifted worktree agents** - an isolated agent can load ancient code (its base was the
  release branch, far behind) or a pre-change agent definition (the change was committed too late),
  and a base check that only confirms file existence cannot tell "based on the integration branch"
  from "based on a feature branch that happens to contain the same files", so a worktree can sit on
  the right commit of the *wrong* branch undetected. Hence commit-first +
  spawn-from-synced-integration-branch + a fail-fast base check that asserts commit identity, not
  just file existence.
- **A shared checkout with only one of its two actors guarded** - §3's commit-guard protects the
  *committer* from a `HEAD` that has already moved, and nothing addresses the *mover*. Running
  `git checkout` to inspect a file while a non-isolated `developer` is live can collide with it
  (harmless only if the agent has not written yet), and so can committing mid-flight on paths that
  merely happen to be disjoint. Hence §1's *While a non-isolated agent is live* - `HEAD` frozen,
  disjoint paths **checked** rather than assumed.
