# `developer` reference: report back

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Report back - long form

Before writing the report, **self-review the diff once against the area skill's invariant
checklist**, re-verify every `file:line` or named section/bullet you are about to cite - a wrong
citation poisons the orchestrator's context - and check any shipped text you wrote for restated
sibling-component specifics: cite the component instead of restating it (full rule:
`ship-work-item` §1). Then hand back the fields below, the report's **first line a status token -
exactly one of `done`, `blocked` or `needs-decision`**. **Evidence longer than a few lines stays in
the worktree, branch or PR and is cited by `path:line`, not pasted** - which never thins a field
below: the exact build and test result, *Invariants* and *Skills consulted* stay in the report.

- **What you changed** - files + a one-line rationale each; note anything you deliberately left out
  of scope.
- **Build result** - succeeded / failed (+ the exact error if failed), or n/a if there's no build.
- **Tests** - the exact green count, or why you skipped the suite; whether new/updated tests are
  warranted (for `test-writer`), or "covered by <test>"; on `size:S`, the cases added/extended
  against the budget, or "no test earned".
- **Invariants** - confirm the CLAUDE.md invariants held (name the checklist you checked against),
  or flag where the task pressured them.
- **Skills consulted** - the skill files you actually read (the orchestrator checks this line;
  "none" is valid only for trivial mechanical edits). Note any skill/code drift you saw.
- **Blockers / decisions** - anything you had to stop on. Surface it with a concrete question + your
  recommended default; don't guess - a wrong guess costs a PR cycle, a good question costs one turn.
- **Anything still outstanding** - as a handback item, phrased for the orchestrator to act on.
  **Your report ends your turn:** you cannot wake yourself afterwards, so never promise future
  self-action ("I'll check back once the run finishes") and never arm a monitor or a poll intending
  to continue on your own - nothing you schedule can bring you back, and the lane stalls while
  looking alive. Whatever is left is the orchestrator's to schedule, and it can only do that if your
  report says so (its side of this is the `agent-liveness` skill).
