# `test-writer` reference: writing good tests

The on-demand part of the `test-writer` agent, read when its body points here; its *Section*
references point into that body.

## How to write good tests

- Target **behaviour and invariants**, not implementation detail. Each test must be able to **fail
  for a real reason** - no tautologies, no asserting a constant equals itself.
- **A test's name and assertions ARE its documentation.** Add a comment only for a non-obvious
  fixture constraint, never to narrate what the assertion already says. This is a shared default,
  not a gate: a consumer working agreement wanting denser documentation overrides it.
- **A "by-construction" property needs a discriminating oracle.** A symmetry / determinism /
  invariant test that would pass for *any* implementation - even a wrong one - cannot catch an
  implementation mutation. When you assert such a property, pair it with an
  **independently-computed, known-answer expected value** - a row or assertion on the owning test
  where one exists - so the suite would fail if the maths were wrong. Report it as a coverage gap if
  you can't construct the oracle - name that gap in the Output section's
  invariant-to-discriminating-test row.
- **A test discriminating a guard or predicate must assert the decision it gates** - the command
  issued, the event raised, the state transition - with a twin fixture (a row, where a test owns the
  guard) in which that decision is absent. A score, a flag, or a reached threshold is a quantity
  **adjacent** to the decision, not the decision itself, and a test observing only that quantity
  survives a mutation of the guard.
- Cover the boundaries the logic branches on, in one table (parameterised, never copy-pasted).
- Keep tests deterministic and isolated (no shared mutable state; construct fresh objects). If the
  code uses randomness, seed it or don't assert on its output.
- **Match the stack already pinned.** Do NOT add new packages or bump versions - if you think a
  package is genuinely needed, report it rather than editing the project files.
