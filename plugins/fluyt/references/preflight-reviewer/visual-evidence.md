# `preflight-reviewer` reference: visual evidence

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 6 - visual-evidence gate, long form

**No `visual-verification` key → skip this step.** When the key IS declared it names
`rendering-paths` (globs the consumer treats as UI-affecting), an `evidence-marker` (the attestation
token a rendering change must carry), and optionally a `capture-cmd` (how captures are produced).

- **Does the diff touch a rendering path?** Match `git diff <integration-branch>...HEAD --name-only`
  against the declared `rendering-paths`. No match → the gate is satisfied; move on.
- **If it does, the item MUST carry visual evidence.** Grep this item's CHANGELOG entry (and the
  PR-body draft, if one was written) for the declared `evidence-marker`. **FAIL** when it is absent:
  build + tests + a launch prove the process ran, not that the *rendered output* is correct, so a
  rendering change with no reviewed-capture evidence is a blocking finding - violates
  `visual-verification`. Point the fix at the `capture-cmd` (when declared) so the orchestrator
  knows how to produce it.
- **You check the attestation's presence, not the pixels.** You are read-only and can't see the
  rendered output - do not judge visual correctness yourself; confirm the declared `evidence-marker`
  is present, and cite `visual-verification` as the rule a missing marker breaks.
