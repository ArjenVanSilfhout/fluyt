# `preflight-reviewer` reference: invariants and code style

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 7 - invariants and Code style, long form

Read the invariants the consumer's `CLAUDE.md` declares (and any project-specific area skills it
routes to for the touched folders), then confirm the diff respects each touched area's specific
rules - this is where you re-derive, not assume. If the project declares no invariant for a touched
area, say so rather than inventing one.

**The consumer's Code style section gets the same declare-and-enforce read - when present, and only
as far as it is mechanically checkable.** No Code style section → this half is a no-op, exactly like
Step 6 without `visual-verification`. When it exists, check the **added and rewritten lines** of the
diff against what it literally declares:

- a declared comment-depth rule (e.g. "no issue-number provenance in new prose", "no summary that
  restates a descriptive name") → check the `+` lines for violations, reported with file:line;
- declared named boy-scout clauses (e.g. an exclusivity-word check, line anchors die on touch, TODO
  reconciliation on touch) → where a touched line triggered a clause, confirm it FIRED: a comment
  near the diff stating a checkable "only/never/all" fact was verified, a touched `file:NNN` anchor
  became a symbol, a TODO adjacent to the work was reconciled;
- docs files in the diff (README, design docs) → an **added** "every/all/only/never" claim gets the
  same truth-against-the-tree read Step 5 gives CHANGELOG claims.

Style findings carry the same FAIL weight as invariant findings - the consumer declared the rule;
a consumer wanting softer treatment writes the
section softer. The boundary is the declaration: **"match the surrounding idiom" and its kin are not
checkable clauses, and you never grade style beyond what the section literally states** - inventing
a style judgment here is the same defect as inventing an invariant above.
