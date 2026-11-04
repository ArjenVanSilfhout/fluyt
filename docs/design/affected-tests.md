# Design: run only the tests a change affects

Status: **proposed** - for the maintainer's ratification. Tracks issue #42. Docs only: nothing here
changes a shipped file. Implementation is filed separately once the forks in
[Decisions needed](#decisions-needed) are settled.

## Problem

Compute is limited, and running full suites on every push is slow. A consumer wants local and CI
runs to test only what a change can affect, and **never to pass falsely**. Without a shared recipe,
each consumer builds its own selection, usually with one of the traps below: a skipped required job
that reads as Success, an extension-based "docs-only" rule that turns off validation of the
product, a filter that matches nothing and passes green, or a selector failure treated as "nothing
to run".

## Goals and non-goals

Goals:

- An **opt-in**, **stack-neutral** recipe: guidance plus a Project Facts sub-block, **default
  off**. An absent key changes nothing for an existing consumer.
- **Fail closed** everywhere: when the recipe cannot prove that a test is unaffected, that test
  runs.
- The same decision procedure locally and in CI, on every forge fluyt supports, with and without
  required checks.

Non-goals:

- Fluyt ships **no parser, no selector, and no CI workflow**. The consumer declares every command,
  and the recipe defines only how their results combine. A reusable workflow is an open fork
  ([D1](#d1-a-reusable-workflow)) that this design does not adopt.
- No test-impact analysis of its own. Selection quality is whatever the consumer's declared selector
  gives, and the recipe's job is to stop that selector from producing a false pass.

## Invariants check

- **Zero project facts in `plugins/`:** held. Every stack-specific value (selector commands, path
  globs, classifier, data map) lives in the consumer's Project Facts. Shipped text names keys and
  roles, never a tool, language or path. Examples in shipped text use the generic shape
  (`<selector-cmd>`), and illustrative names follow the repo's naming theme.
- **No shipped CI workflow:** held. The recipe is guidance that a consumer applies to the workflow
  it already has, using the `branch-protection` §6 posture: show the diff, apply on an explicit yes,
  and one yes covers one file. Changing this invariant is fork D1.

## The Project Facts sub-block

A new optional key, `affected-tests`. Absent or `off` (the default) leaves every step exactly as
today. Shape, by role (final key spelling is settled at implementation):

```text
- `affected-tests`: <off | a sub-block>
  - `protected-paths`: globs whose change can break what the consumer ships (reuses the §6 Rule 2
    notion; a change outside them takes the docs-only fast path)
  - `selectors`: one entry per stack - <path globs> -> <selector-cmd>, which prints the affected
    test targets for the changed files it is given, one per line, and exits non-zero on error
  - `classifier`: optional <classifier-cmd> that, given one changed file and its base revision,
    exits 0 only when it proves the change comment-only or whitespace-only
  - `data-map`: optional <path globs> -> <test targets>, for data and fixture files no graph sees
  - `full-run-triggers`: globs that force a full run (build config, dependency manifests, the CI
    config itself)
  - `safety-net`: <on-merge | scheduled> - how the full suite still runs (see Safety net)
```

**A sub-block with a missing required part is treated as `off`, and the run is a full run.** It is
never treated as "select nothing". The gate warns, so the misconfiguration is visible.

## The decision procedure

One procedure, run identically by a local script and by CI. Each step either decides the run or
passes to the next step. **Any step that cannot complete decides FULL.**

1. **Determine the diff** against the merge base of the target branch. An undetermined diff decides
   **FULL**: a force-push whose old head is gone, a first push with no base, a shallow clone missing
   the base, or a forge API error.
2. **Full-run triggers.** Any changed file matching `full-run-triggers` decides **FULL**.
3. **Docs-only fast path.** No changed file under `protected-paths` decides **BUILD-ONLY / no
   tests**, with the expensive steps gated off (§6 Rule 1: gate the steps, never the job).
4. **Comment-only and whitespace-only changes.** A changed file is dropped from selection only when
   a declared `classifier` exits 0 for it. The file still **builds**: this step skips tests, never
   the build. Directives, pragma-like comments, doc comments a tool consumes, and every file in a
   whitespace-significant language count as **code**, and the classifier must refuse them (the
   implementation's guidance says so and gives refusal as the default). With no classifier
   declared, every change is code. A classifier error counts as "not proven" for that file.
5. **Cover every file.** Each remaining changed file must be claimed by at least one `selectors`
   glob or `data-map` entry. **A file nothing understands decides FULL.**
6. **Select.** Run each matching selector with its files, and add the `data-map` targets. A selector
   that exits non-zero, times out, or prints unparseable output decides **FULL**.
7. **Run the selection.** The union of targets runs through the consumer's `test-cmd` filter
   mechanism. **A filter that matches zero tests fails the run.** It never passes it, because an
   empty match is how a renamed test or a broken filter turns red into green. An empty selection
   that step 4 legitimately produced is not a filter: it runs no test step and records why.
8. **Record the decision** in the run log: which rule decided, the files behind it, and the
   selected targets. A reviewer can then see why a test did not run without re-deriving it.

## Safety net

Selection can miss a test (a dependency the graph misses, or a stale data map), so a full suite must
still run on a known cadence. A red full run is **reported, never skipped** or retried into green.

- **`on-merge`** (recommended default): a full run on every merge to `integration-branch`. It is the
  simplest option, and it attributes a red to one merge.
- **`scheduled`**: a scheduled full run that **runs only when `integration-branch` moved since the
  last green full run**, so an idle repo spends nothing. It suits repos whose merges are too frequent
  for a full run each time. A red result names the range of merges since the last green run.

The release promotion (the `release` skill) keeps its own full validation, and this recipe never
narrows it.

## Required checks and forges

- **GitHub:** the selection lives **inside** the required job. Expensive steps are gated with
  step-level conditions, so the job always runs and reports a real result. No `paths:` filter goes
  on a workflow that backs a required check: it leaves the check Pending forever (`branch-protection`
  §5/§6). Without required checks the same layout still works. It just has no Pending trap to avoid.
- **Azure DevOps:** the same posture, through `forge-azure-devops`'s CI-gate section. Gate the steps,
  and put no `paths` trigger filter on a pipeline that backs a blocking build-validation policy.
- **Local runs:** the consumer's local gate runs the same procedure against the merge base of its
  integration branch. A local run that cannot find the base decides FULL, as in step 1.

## Measure before keeping

A selection map is kept only if it pays. The implementation guidance makes this a required phase
before the recipe is relied on, not an afterthought:

1. **Shadow period.** For a stated number of runs, compute the selection but still run the full
   suite. Record each run's selected targets, the full run's failures, and both durations.
2. **Miss rate.** If any full-run failure falls outside the selection, the selector or data map has
   a hole. Fix it, or drop selection for that stack.
3. **Savings.** Compare median selected duration against median full duration over the shadow
   period. If the saving does not cover the recipe's upkeep (the data map, selector maintenance),
   leave `affected-tests` off. The numbers and the verdict go in the consumer's decisions log.

## Where it ships (implementation, after ratification)

- The **Project Facts template** gains the `affected-tests` entry, default `off`, so an
  `adopt-conventions` re-sync offers it.
- The **guidance** sits next to `branch-protection` §6, which already owns the step-gating and
  path-scoping rules it builds on, as a reference file that §6 points to (fork D2).
- `ship-work-item` and `preflight-reviewer` change only in what they read. When a consumer sets the
  key, the local gate's verdict line names the rule that decided, and preflight checks that a
  BUILD-ONLY or selected run carries that line.
- Versioning: the implementation is **MINOR** (a shipped component gains a step a consumer follows).
  This design PR is PATCH (docs only).

## Decisions needed

### D1. A reusable workflow

Today fluyt deliberately ships no CI workflow (`branch-protection` §6: a workflow is stack- and
provider-shaped).

- **(a) Guidance only, no workflow - recommended.** This keeps both invariants and works on every
  forge. The cost is that each consumer wires the procedure into its own CI.
- **(b) Ship a reusable workflow for one forge's CI**, with selectors still declared by the
  consumer. It would be less wiring for that forge, but it reverses a standing decision, adds a
  provider-shaped asset that the zero-project-facts gate must police, and leaves other forges
  unserved.

### D2. Home for the guidance

- **(a) A reference file under `branch-protection` - recommended.** It sits next to the §6 rules it
  extends, and it costs a skill load only when the recipe is in use.
- **(b) A new skill.** It is more discoverable, but it duplicates §6's rules or points back to them.

### D3. Safety-net default when the key is set

- **(a) `on-merge` - recommended.** It is simplest, and a red result points at one merge.
- **(b) `scheduled`.** It is cheaper on busy repos, but a red result spans several merges.
