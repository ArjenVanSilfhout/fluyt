# `test-writer` reference: report fields

The on-demand part of the `test-writer` agent, read when its body points here; its *Section*
references point into that body.

## Output - long form of the report preamble and the *Invariant → discriminating test* field

Before writing it, re-verify every `file:line` you cite against the source (one Grep each) - a wrong
citation poisons the orchestrator's context. Then return a concise Markdown summary of the *Output*
fields, its **first line a status token - exactly one of `done`, `blocked` or `needs-decision`**.
**Evidence longer than a few lines stays in the worktree, branch or PR and is cited by `path:line`,
not pasted** (your writes stay inside `test-dir` - *Hard boundary*) - which never thins a field
below: the **Invariant → discriminating test** map, the self-verify result and *Skills consulted*
stay in the report.

- **Invariant → discriminating test** - for each invariant in your assigned scope (drawn from the
  working agreement you read in step 1), one row: the invariant, the test (possibly an extended one)
  that would fail if the implementation were wrong, and *how* it discriminates. A test that would
  pass for a wrong implementation is a `GAP`, not a cover - write `GAP` and the reason instead. If
  the consumer declares no invariant relevant to this scope, say so rather than inventing one. A row
  naming a guard or predicate must cite the decision-asserting test and its twin fixture
  (`writing-good-tests.md`), and must name the mutation that test would catch precisely enough for
  the orchestrator to execute it in one step - the orchestrator runs that mutation, not you (see
  *Hard boundary*); a row that only observes an adjacent quantity is a `GAP`.
