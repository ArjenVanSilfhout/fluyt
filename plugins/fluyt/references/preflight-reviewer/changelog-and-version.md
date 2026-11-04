# `preflight-reviewer` reference: changelog and version

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 5 - the CHANGELOG entry and the version class, long form

**Under `changelog: none` (an unversioned repo), the CHANGELOG-entry, `Current version:` and
version-class checks below are n/a** - report them as such; never FAIL a missing entry or bump.

- The CHANGELOG has a NEW top entry `## [X.Y.Z] — YYYY-MM-DD` and the `Current version:` line was
  bumped to the same `X.Y.Z`. The version must match the one in the commit/PR title.
- **The CHANGELOG entry's factual claims are verified, not just its structure.** A measured count, a
  quoted prior text, an assertion about what a sibling file or tool does, or a claim about forge/
  GitHub state must each be checked against the tree (`Grep`/`Read` the count or quote back) - or
  explicitly ATTRIBUTED, e.g. "as recorded on issue #N". That attribution form is fine **inside a
  consumer's own CHANGELOG entry text** (an example here): it cites the consumer's own tracker, so
  it carries no dangling reference. A claim about what a **tool** does needs more than a read:
  exercise the tool against a fixture that would fail if the claim were false, and include a
  negative control (a fixture you know the tool rejects) - grepping the docs only proves they agree
  with each other, and a check that can only say yes is not a check. FAIL when a specific factual
  claim is neither checked nor attributed.
- **Version class is correct** - **the consumer's `version-rules` (Project Facts) is
  authoritative**; its canonical shape (see `fluyt:versioning-and-changelog`) is MINOR only for
  product-behaviour changes and PATCH for pure wording plus all tooling/docs/process even when
  multi-file. Judge against the consumer's rule, not a remembered one (for a plugin/library, a
  changed component behaviour is MINOR, not tooling).

  **Before judging the diff, confirm the rule is itself decidable - authoritative is not the same as
  valid.** Two cheap tells that it is not:
  1. MINOR and PATCH are defined on **different axes** (e.g. behaviour vs file count) with no
     precedence rule between them, so at least one change shape satisfies both at once.
  2. A clause makes file count **decide** the class - e.g. *"single-file fixes are PATCH"* or
     *"multi-file changes are MINOR"*. File count is not a versioning axis anywhere in this plugin.
     **The PATCH-broadening phrase *"even when multi-file"* is NOT such a clause** - it widens PATCH
     rather than choosing between MINOR and PATCH, and the shipped Project Facts template uses it
     verbatim, so treating it as a tell would fire on the recommended value on every PR. Two further
     false positives: match against the `version-rules` **value** itself, not a repo-wide grep, and
     `single-file` is also a legitimate auxiliary label name in the `backlog` label scheme.

  When either tell fires, put it in the **Advisory** list (Step 9), never the Fix list -
  **explicitly named as a defect in the Project Facts `version-rules` key, not in the diff** -
  citing the behaviour-axis correction (`fluyt:versioning-and-changelog`), and still judge the
  diff's version class against that corrected reading: the reviewer is read-only, and blocking would
  stall a legitimate change over a wording defect.
