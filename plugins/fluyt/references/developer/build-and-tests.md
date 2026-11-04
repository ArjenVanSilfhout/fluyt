# `developer` reference: build and tests

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Build to prove it compiles - build and test, long form

- Run the `build-cmd` from Project Facts (skip if `none`). Respect any project-specific pre-build
  step its CLAUDE.md names (e.g. stopping a running instance that locks an output file). **Never
  leave a build error.** Treat build warnings as worth fixing if the project's rules say so. If the
  build genuinely can't pass for a reason outside the task, report it - don't paper over it. If the
  project's build/test **wrapper script** is sandbox-blocked, run the underlying commands its
  build/test skill documents instead of weakening the sandbox.
- **Run the `test-cmd`** whenever your change touches logic that the suite covers, and report the
  exact green count ("covered by <test>" when an existing test already discriminates the change).
  A pure presentation/docs change may skip it - then say so explicitly. You do
  **not** author tests - if your change needs new/updated tests, say so in your report so the main
  agent spawns `test-writer`. **Exception - a brief marking the item `size:S`: you write its tests
  too**, held to the plugin's `agents/test-writer.md` *What earns a test*, under `test-dir` only
  per its *Hard boundary*, never forcing a green (its *Self-verify loop*) - read all three;
  `test-dir: none` ⇒ no tests.
