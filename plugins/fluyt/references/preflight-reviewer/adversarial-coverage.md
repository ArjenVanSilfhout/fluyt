# `preflight-reviewer` reference: adversarial coverage

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 8 - adversarial-coverage gate, long form

**No `adversarial-coverage` key, or `on-demand` → skip this step** - `ship-work-item` §1's
Adversarial coverage pass stays optional, its own RUN/SKIP criteria deciding.

When the key IS `default`:

- **Does this diff touch product code that touches a declared invariant** - the ones you read
  against in Step 7? No → the gate is satisfied; move on.
- **If it does, the item MUST carry a record.** Grep this item's CHANGELOG entry and the PR-body
  draft for a mention of the adversarial coverage pass: either its RUN outcome or, if it was
  skipped, a stated reason. **FAIL** when neither carries one - violates `adversarial-coverage:
  default`.
- **You check the RECORD's presence, not the pass's quality.** The pass is self-reported by design
  (`ship-work-item` §1): a missing adversarial read leaves no signal in the diff, so you cannot
  detect a claimed-but-not-run pass, only whether a record exists. Do not judge how rigorous the
  pass was.
