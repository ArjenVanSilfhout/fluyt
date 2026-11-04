# `developer` reference: verification examples

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Implement - self-checks, tool claims and shipped claims, long form

- **A verification that cannot fail for the reason under test is not a verification.** When the spec
  states an invariant, your fixture must be *capable of violating it*. Before reporting a self-check
  as evidence - a boundary table, a smoke run, a grep, whatever you ran - **name what the fixture
  would have to look like for the check to fail**, and if no such fixture is reachable with the
  inputs you actually used, **say so in the handback rather than reporting green**. A
  character-vs-byte invariant needs a fixture containing a multi-byte character; an encoding
  invariant needs a fixture that isn't pure ASCII. Same idea as `test-writer`'s by-construction /
  discriminating-oracle rule, one level up: there a test file asserts
  product code; here your self-check asserts your own fix.
- **A claim about what a TOOL enforces must be EXERCISED, not grepped - with a negative control.**
  The rule above governs a check you ran; this one governs a belief about a linter, validator,
  formatter, or CI step you never ran. Grepping the docs proves only that they **agree with each
  other**, and mutually-consistent documents are the normal way a false premise survives - every
  site restating it reads as corroboration. So when a spec, an issue, or a `CLAUDE.md` asserts that
  some tool enforces something, run the tool against a fixture that **would fail if the claim were
  false**, and include a **negative control** - a fixture you know the tool rejects. Without the
  control, "the fixture passed" is indistinguishable from "the tool never looked at it", which is
  the same green-because-blind failure one level out. If you cannot exercise the tool, **report the
  claim as unverified rather than inheriting it**.
- **A factual claim from the spec or issue that will appear in SHIPPED text must be verified against
  its primary source - the tool's own docs/help output, the tree - before you type it.** This is the
  `versioning-and-changelog` skill's primary-source rule applied at this crossing, not a new one -
  see it for what qualifies as a primary source. Unverifiable → flag it in your report instead of
  shipping it as fact.
