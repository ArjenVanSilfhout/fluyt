# `preflight-reviewer` reference: issue and decisions

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 5 - the issue, its decision record and partial completions, long form

- The issue: identify the issue number the work claims (from the commit message(s) / the PR-body
  draft) and confirm it is a real OPEN issue whose scope matches the change (`gh issue view <n>
  --json state,title,labels,comments`) - **read the last five comments** (cap it there to save
  context). `ship-work-item` §0.1 mandates the orchestrator read the full comment thread before
  building the brief, and nothing else re-checks that it happened - this is that re-check: catch a
  claim the diff or CHANGELOG carries (a stale `Files:` set, a superseded design choice) that the
  thread had already corrected. `Closes #<n>` must be present in the commit message **body** - check
  the commit message, the PR-body draft if one was written, **or the open draft PR's body if one
  exists**. Under the background dispatch default a draft PR is often already open while you review
  (`ship-work-item` §4's standing pairing), so do not assume there is no live PR; `gh pr view <n>
  --json body` is available. A pure process/tooling chore with no issue must instead carry an
  explicit "no issue - <why>" note - flag a silent absence. If the item implemented an in-code `//
  TODO:`, that comment is gone from the code.
- **Decided diff content must trace to its decision record, not merely to an issue existing.** When
  the item's issue carries a decision record - a maintainer decision comment, ratified options, an
  accepted proposal set - surfaced by the last-five-comments read above, or named by the spawn
  prompt, every decided value, added entry, or scope element in the diff must trace to that record.
  Cite `fluyt:ship-work-item`'s three-part sourced test (under *Surface mid-scope only for a
  real decision*): the record must be **written**, state **the value actually used**, and record the
  **human's** decision - self-sourcing (the orchestrator writing the entry, then citing it) closes
  nothing. **FAIL**, not an advisory, when diff content traces to no recorded decision: the
  orchestrator is the one author no other role reviews, and this check is the only one positioned
  behind it. No decision record anywhere in what you read → this bullet is a no-op; do not go
  hunting for one. **The cap boundary:** Step 5 already caps comment reading at the last five - when
  those five make a decision record further back plausible (a triage trail, an earlier comment you
  cannot see) and nothing in the spawn prompt points at it, report this check NOT RUN rather than
  silently passing, like Step 0's identity half.
- **Partial/umbrella completions:** a slice that does NOT finish the whole issue must NOT `Closes`
  it - reference it with a plain `#<n>` mention and leave it open; only the final slice closes it. A
  `Closes` on a still-unfinished umbrella issue is a finding.
