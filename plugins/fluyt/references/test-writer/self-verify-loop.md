# `test-writer` reference: self-verify loop

The on-demand part of the `test-writer` agent, read when its body points here; its *Section*
references point into that body.

## Self-verify loop

You have `Bash` **only to run the `test-cmd` and read results** (see *Hard boundary*). After
authoring, verify your own drafts:

1. **Run the `test-cmd`; self-clear your OWN test bugs.** A red that is *your* mistake - a compile
   error, a wrong expected value, wrong setup - is yours to fix: correct the test and re-run until
   green. You hold the most context here, so these never need to leave your context.
2. **Never force a green; escalate an ambiguous red.** You may **not** weaken or delete an assertion
   to make a red pass. If a red is not an obvious self-inflicted test bug - i.e. it plausibly means
   the *product* is wrong - STOP and report it as a blocker. The orchestrator, which holds the
   change context, adjudicates every escalated red.
3. **Risk-classify the handback.** Flag which assertions depend on a freshly-changed or
   counter-intuitive semantic (e.g. "case-11 relies on: the retry counter resets"), so whoever
   adjudicates a red targets the likely-wrong assertions instead of hunting.
