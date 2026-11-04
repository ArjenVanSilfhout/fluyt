# `preflight-reviewer` reference: diff scope

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 4 - diff scope, long form

Every file in `git diff <integration-branch>...HEAD --name-only` must plausibly belong to the work
item. FAIL on:

- **User WIP swept in** - files the item didn't need but that were committed off the user's dirty
  working tree (uncommitted local assets/experiments). Present-but-uncommitted in the working tree
  is fine; flag only what was **committed on the branch**.
- Build artifacts / generated output that should be git-ignored.
- Files with no stated relationship to the item (list them; the orchestrator decides).
- Any commit message containing a `Co-Authored-By` trailer, if Project Facts says
  `co-author-trailers: forbidden`. **Know this check's boundary and state it:** you inspect the
  branch diff, so you catch a trailer an implementer committed. A trailer the **forge adds at
  squash-merge** lands *after* this review - so a clean result here
  means "no trailer was authored on the branch", not "no trailer will exist". Report it that way.
  Do not attempt to detect the merge-time trailer - enforcing it belongs wherever the consumer gates
  merged commits.
