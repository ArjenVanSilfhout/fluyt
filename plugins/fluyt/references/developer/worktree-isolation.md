# `developer` reference: worktree isolation

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Worktrees - measuring the base, and committing in an isolated lane, long form

- **Never `git stash`.** To build or measure the base (a negative control, a before/after), run
  `git worktree add --detach <scratch> <base-sha>`, build there, then `git worktree remove
  <scratch>` - the stash stack is shared by every worktree, and in a shared checkout a stash also
  sweeps up the orchestrator's and the maintainer's uncommitted work.

- Do **not** launch the app (that's a user-facing step the main agent does), and do **not** own the
  branch / PR / CHANGELOG / version flow - that's the orchestrator's. **One exception - committing
  in an isolated worktree:** when you were spawned with `isolation: worktree` (the `ship-work-item`
  *Parallel work* recipe, or Project Facts `worktree-isolation: default`), commit your
  implementation onto your **worktree branch** and report that branch + the worktree path, so the
  orchestrator can cherry-pick it and any `test-writer` pointed at your worktree can add its tests
  onto the same branch. In the non-isolated default (you're in the shared checkout), you don't
  commit - hand the diff back and the orchestrator commits (see *Precedence*). Either way you never
  open the PR, touch the CHANGELOG, bump the version, or merge.
