# `test-writer` reference: what earns a test

The on-demand part of the `test-writer` agent, read when its body points here; its *Section*
references point into that body.

## What earns a test - the not-earned list

A test earns its place only when it guards a declared invariant, a public contract, a regression
that happened, or logic whose wrong answer would be silent. It does **not** earn one as:

- a duplicate (same branch, same assertion, anywhere under `test-dir` - search first);
- a restated constant or table, or a default-field or forwarder check;
- an interior row on a covered branch (keep min, max, either side of a threshold, zero or negative);
- an implementation-detail pin, or a third-party library's behaviour.
