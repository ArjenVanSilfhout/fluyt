# §1 Verify, and the adversarial coverage pass

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

- **Tests are authored by the `fluyt:test-writer` agent** (it writes ONLY under the Project Facts
  `test-dir`, and **self-verifies** its drafts by running `test-cmd` - self-clearing its own test
  bugs, escalating product-looking reds). You **re-run the suite once as the integration gate**,
  adjudicate any escalated blocker, and fold its tests into this same PR.
  Its brief **names the suite (existing test file/subject) to extend and a case budget**
  (default: test-writer's *What earns a test*). **When an existing test already discriminates the
  change, spawn no test-writer: cite that test** in the PR body.
- **Build + verify after the change:** run the `build-cmd` and `test-cmd` from Project Facts; if
  there's a `run-cmd`, launch so the change can be seen. Launching is fine; driving or capturing the
  desktop follows the `developer` contract's *Never act on the user's desktop*, and a live-only
  check goes to the user as a step. (If `build-cmd`/`run-cmd` is `none`, skip that step .) Before
  trusting the gate's verdict, read `portability.md` in this skill's directory: the verdict-token
  and CI-over-local rules apply on every OS, and it also covers Windows / PowerShell traps and a
  sandbox that refuses the gate.
- **Visual changes need visual evidence (only if Project Facts declares `visual-verification`).**
  For a GUI / rendering product, build + tests + a launch prove the process ran, not that the
  *rendered output* is right. Your change touches the key's `rendering-paths` → capture the declared
  visual states (via its `capture-cmd`) → review them → record the declared `evidence-marker`
  attestation in this item's CHANGELOG entry / PR body - the `fluyt:preflight-reviewer` FAILs a
  rendering change that lacks it. No `visual-verification` key → nothing to do here.
- **Claim-scoped correction: dispatch by the claim, not by the site list.** When a correction
  targets a **claim** - "this statement is false, fix it wherever it appears" - what you were handed
  is a **lower bound, not a boundary**: find and correct every instance of the claim, treating named
  sites as non-exhaustive examples. This authorises exhausting one named claim, not widening scope
  on any other item. Close the sweep with a grep for the claim's distinguishing phrasing, checking
  its **concepts, not one literal wording**, and report every surviving hit with a one-line
  justification for why it is not an instance - this is what turns "I fixed what I found" into
  "nothing is left." When the claim under correction is a tuned value, triage each survivor into one
  of two buckets: a **current-tense claim built on the old value** ("X never fires", "no Y has ever
  happened") that the new value now falsifies - fix the prose, never the value; a paragraph
  **quoting the old value as the reasoning a later decision corrected** - that quotation IS the
  decision record and must survive verbatim. Blind find-and-replace on the old literal destroys the
  second bucket. **Derive those search terms from the claim, never from the wording you just
  corrected.** Write the claim down as a proposition, enumerate the ways it could be *said*, and
  search for those - including forms sharing no keyword with the text you edited. The tell that you
  have it backwards: **a pattern containing a word you just deleted is searching for your own fix,
  not for the claim.** What routinely survives a keyword sweep is a **definite article** carrying an
  exclusivity word's work ("*the* scan a release boundary triggers" asserts what "the *only*
  trigger" did), a synonym, a passive restatement, and a sentence asserting the claim's
  *consequence* instead of the claim. **The closing grep applies on the inline path too**: it
  attaches to *the correction*, not to *the dispatch*. The next bullet does not point the other way:
  **independent fixes** land **one at a time**; **one claim at many sites** is a single defect,
  corrected as **one sweep** and closed with the grep above - splitting it site-by-site is how a
  corrected claim survives at every site nobody revisited.
- **Multi-fix items: one at a time, easiest-first, verify between each.** When a single work item is
  several *independent* small fixes (e.g. a batch of in-code `// TODO:`s), land them one at a time -
  easiest first unless directed otherwise - running `build-cmd` / `test-cmd` (and `run-cmd` if set;
  skip whichever is `none`) **between each**, not batched into one untested sweep. Then a
  regression is attributable to exactly one change.
- **Adversarial coverage pass (optional - for oracle strength).** After the suite is green and
  before preflight, decide RUN vs SKIP. **RUN** when a wrong answer would be *silent*: not announced
  by a crash, a red test, or visible output, and consumed downstream. Math / geometry / formula /
  resolver logic is one example of a silent-answer slice, not the gate. **RUN** also when the slice
  claims an invariant "by construction" - on **either** reading: the test's shape (a
  symmetry/determinism property test that passes for *any* implementation, so it cannot catch an
  implementation mutation) or the code's own claim (asserted to hold an invariant by construction,
  with no test that would catch a violation); "invariant" means one the consumer's working agreement
  declares. This second RUN disjunct fires even when the wrong answer would be loud - a crashing
  property test still can't tell you which mutant survived. **SKIP** only when both hold: a wrong
  answer would surface loudly (crash / red test / visible output), and the slice makes no
  by-construction invariant claim. When you SKIP, optionally substitute one cheap mutation-floor
  check (flip a guard `>`→`>=`, confirm a test dies). It probes **oracle strength** - would the
  tests actually fail if the implementation were wrong? - which neither the green suite nor
  preflight (it re-runs the same suite) covers. Run it however you review: a careful adversarial
  read of the diff + tests, or a workflow if you have one . When a `test-writer` handback for this
  slice is available - its **Invariant → discriminating test** map, which arrives in report text,
  not a file, so you need it in context or pasted somewhere reachable - start from that map and
  attack its claims instead of re-deriving them from a blank diff: strictly cheaper, and it probes a
  stated claim rather than a self-invented one. A map row without a captured kill is the same
  **prediction** the paragraph below defines, so it is executed, never trusted - run the guard rows'
  named mutations first. Absent that (no `test-writer` was spawned, or `test-dir: none` - the common
  case), re-derive the map from the diff and tests exactly as before; the degradation is
  unconditional, not a dependency on an artifact that often won't exist. **Every verdict cites the
  captured output it rests on, and inference is labeled as inference.** Each verdict names the
  command run and the captured result it rests on; an attribution reasoned from reading rather than
  measured is marked as inferred; and a verdict with no captured evidence is a **prediction**, which
  the report must label as one and the adjudicator must weigh as one. When the pass runs delegated,
  this requirement travels **in the spawn brief**, not only here - a doctrine line binds nobody who
  runs the pass from a condensed brief. **Classify each surviving mutant, and a survivor is not a
  new test by default:** **redundant** (an existing test, golden or digest kills it once named - add
  nothing; the verdict names that test and cites the captured kill), **gap** (extend the nearest
  owning test with a row or an assertion), or **new** (a new test only when nothing owns it; the
  `test-writer` "What earns a test" section decides). The classes travel in the same brief.
- **Project Facts `adversarial-coverage` decides whether the pass above is optional or required -
  read it before you decide RUN vs SKIP.** Absent, or set to `on-demand` (the shipped default, and
  what an absent key reads as): the pass above stays optional, its own RUN/SKIP criteria deciding.
  Set to `default`: for a product-code slice that **touches a declared invariant** - the consumer
  CLAUDE.md's normative invariants section, not bare "product code" - the pass RUNS, and a SKIP
  needs a **stated reason recorded in the PR body and the CHANGELOG entry**. **This is
  self-reported, not a gate - say so plainly when you cite it:** a missing adversarial read leaves
  no signal in the diff, so nothing downstream - not `preflight-reviewer`, not CI - can detect its
  absence.
- **Knowledge capture (optional).** If you hit a durable environment or toolchain trap while
  implementing - a sandbox quirk, a shell gotcha, a build wrinkle that will bite the next person -
  append it to the matching **project-local skill** *in this same PR*, so the knowledge lands where
  it's consumed instead of evaporating. An offer, not a gate; skip it when there's nothing durable
  to record. (This is the durable counterpart to the git-ignored friction breadcrumb in *After the
  merge lands* step 5 .)
