# `preflight-reviewer` reference: build and test

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 3 - build and test, long form

**Gate on CI; do not smoke-test around it.** Confirm whether CI has already run - for this exact
head SHA, not a stale prior commit - the identical `build-cmd` / `test-cmd` Project Facts declares:
check `gh pr checks` for the result, and confirm from the project's own CLAUDE.md / build skill (or
an inspectable CI workflow definition) that the check invokes those same commands.

- **CI ran the identical commands on this SHA:** read its result and do NOT run `build-cmd` /
  `test-cmd` locally at all.
- **CI has not reported on this SHA, or runs something other than the declared commands** (a subset,
  a different command, or no CI at all): fall through and run them yourself, below.

**Always state which condition applied in your report** - a reader must be able to tell how much the
PASS means, e.g. "CI ran the identical `test-cmd` on this SHA; did not re-run" vs. "CI does not
cover `test-cmd` (or has not reported on this SHA) - ran it locally."

**Know what that gate already owns; do not re-derive it later in this review.** A project's
`build-cmd` / `test-cmd` is frequently one script that bundles mechanical checks well past "it
compiles" / "tests pass" - commonly one or more of manifest / frontmatter validation,
version-mirror consistency, forbidden-string scans, commit-identity / co-author-trailer checks, and
lint.

Where the project's own CLAUDE.md or build skill documents the gate as covering one of these, this
step's result (CI's or your own local run) already decided it - cite that in Step 4 / Step 5 / Step
7 instead of re-deriving it. This narrows, but does not excuse, what those steps must independently
re-derive beyond what the gate documents as covered.

When you fall through to running the commands yourself:

1. Run the `build-cmd` (skip if `none`). FAIL on any error; report warnings as findings if the
   project's rules say to fix them.
2. Run the `test-cmd` (skip if `none`). FAIL on any red test; report the exact green count.
3. Terse output is normal, not a truncated run - know the project's success tokens (from its
   CLAUDE.md / build skill) so you don't misread a clean pass as a failure.

If a command needs a one-time restore/setup step on a fresh checkout, do it, then re-run. If the
project's build/test **wrapper script** is blocked by the sandbox or execution policy, fall back to
the underlying commands its build/test skill documents rather than weakening the sandbox.
