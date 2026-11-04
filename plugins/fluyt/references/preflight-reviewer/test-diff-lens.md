# `preflight-reviewer` reference: test diff lens

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 7 - test diff lens, long form

**Test diff lens - skip when the diff touches no file under Project Facts `test-dir`, or it is
`none`.** Read the diff's test files for these tells:

- three or more facts/cases in one file differing only by a literal;
- more than two rows per branch under test;
- an expected value built by the same expression as the actual;
- a new test matching an existing one's name and assertions;
- a new file for a regression whose subject already has a suite.

Findings go to the **Advisory** list; **FAIL only when Project Facts declares `test-budget:
strict`** (absent or `advisory` = advisory). Never flag what `test-writer`'s *What earns a test*
marks "never thinned".
