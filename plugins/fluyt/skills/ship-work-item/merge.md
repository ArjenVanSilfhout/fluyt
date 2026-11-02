# §4 merge mechanics

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

- **Grep the PR body BEFORE you arm - the merge can land in seconds, and there is no undo.** One
  command, right before `gh pr merge`:
  ```sh
  gh pr view <n> --json body --jq '.body' | tr '\n' ' ' |
    grep -oiE
    '\b(clos(e|es|ed)|fix(|es|ed)|resolv(e|es|ed))[[:space:]:(]*([-[:alnum:]._/]*#[0-9]+|gh-[0-9]+|https?://[^[:space:]]+/issues/[0-9]+)'
  ```
  Read every hit: each one **will** close that issue, and each one should be an issue you intend to
  close. This is a **bounded check, not a wait** - it does not contradict *Do not watch a background
  agent* (§1); you run one command and move on. **Every piece of that pattern is load-bearing -
  never simplify it; before changing or tightening it, read `closing-keyword-grep.md` in this
  skill's directory and re-run its full fixture list.** **Why before:** the post-merge verify only
  backstops a close that did not happen; it cannot undo one that should not have, and a PR that
  skips build+test on a `paths-filter` can merge in **~30 seconds**. **A draft PR already covers the
  reviewed path** (fire-and-forget cannot squash a draft), so this guards the PR with no review: a
  trivial docs-only PR opened non-draft and armed immediately. **Do NOT use
  `closingIssuesReferences` for this.** It populates **asynchronously** and reads empty for up to a
  minute after `gh pr create` even when the body plainly carries `Closes #N` - and the close
  fires off the squash commit message, a different signal. The body grep is synchronous and
  authoritative.
- **Arm auto-merge (squash), fire-and-forget - then read the armed state back:** `gh pr merge <n>
  --squash --auto` → `gh pr view <n> --json autoMergeRequest`; `null` ⇒ the arm did not take → arm
  again explicitly or fall back to a plain squash merge once CI is green. An already-`MERGED` state
  read is also a valid answer - an armed PR whose checks were green can land within seconds.
  **"Green" means a completed, non-skipped, successful run on the head SHA, whatever the check
  summary shows** - a skipped job reads as passing - **and a cancelled run is never green: re-run
  it.** **An armed PR is not stuck just because it has not merged yet.** The merge after the
  last required check goes green takes seconds, up to ~2 minutes. **Do not hand-merge an ARMED PR
  until at least 3 minutes after its last required check went green**, and then only if `gh pr view
  <n> --json state,mergeStateStatus,autoMergeRequest` still reads `OPEN`, `CLEAN` and a non-null
  `autoMergeRequest`. Repeated multi-minute stalls on one repo are a GitHub Support case, not a
  settings change. Read it back once, then **do not watch it** (*Do not watch a
  background agent*, §1). Check `gh pr view <n> --json state` at the top of the next turn that needs
  it - and **if arming is the last act of your turn with nothing else queued, no such turn is
  coming**: before ending it, start the one bounded wait `agent-liveness` distinguishes from
  watching, whose exit is the **trigger** for *After the merge lands* (POSIX `sh`; size both
  placeholders to your CI, with `<max-polls>` × `<poll-seconds>` covering at least the CI run plus
  that ~2-minute window):
  ```sh
  i=0; until gh pr view <n> --json state --jq .state | grep -qxE 'MERGED|CLOSED' ||
    [ "$i" -ge <max-polls> ]; do i=$((i+1)); sleep <poll-seconds>; done
  ```
  It only wakes you - that section's step 1 still opens on your own `MERGED` read.
  **NEVER arm `--auto` on a PR whose preflight has not reported.** This is the one failure the
  background default carries: arming a non-draft PR before findings land lets fire-and-forget squash
  the item while the review is still running, and a squashed merge is not recoverable by fixing the
  branch. Stated here as well as in the *backgrounded review obliges a DRAFT PR* bullet next
  (deliberate: **this** is the gate).
  **The pending window is not a deletion window, for either ref** - until the PR reports `MERGED`
  it is still OPEN, so leave both the remote head branch and the local branch alone; *After the
  merge lands* step 6's observed-`MERGED` gate already applies.
- **A backgrounded review obliges a DRAFT PR - this is the standing pairing, not an escape hatch.**
  Under the background default (§1) preflight is still running when you open the PR, so: open it as
  a **draft** (`gh pr create --draft`), let the review report, then mark it ready
  (`gh pr ready <n>`) and only then arm auto-merge. **A background preflight is race-free because
  the PR is a draft - not because the review finished first:** a draft is structurally
  non-mergeable. The same applies to any other review that lands after `gh pr create`: a
  backgrounded *Adversarial coverage pass* (§1), or a substituted `general-purpose` review where
  `preflight-reviewer` isn't dispatchable on the client.
- **When preflight comes back with findings on an already-open draft:** fix them → commit again on
  the same branch (the squash merge makes extra commits free). **When the fix edits prose** - a
  CHANGELOG entry, a doc claim, an issue body - **rather than code, re-verify the corrected text
  against the tree before pushing, not just re-read it**: a correction is written under the same
  conditions that produced the error. **Exercise the claim**, don't re-read it - re-measure a count,
  re-run a quoted command, exercise a tool-behaviour claim against a case that would fail if it were
  false. This is the
  committer's own bounded check before push, not a second review or a re-spawn. Then re-read the PR
  title and body against the branch's **final** state and edit them (`gh pr edit <n> --title …
  --body-file …`) if either has gone stale, and only then `gh pr ready` and arm auto-merge. Do not
  close and reopen the PR, and do not mark it ready intending to fix afterwards - a ready PR with
  auto-merge armed can land between those two acts. **Why this matters most here:** under
  `squash_merge_commit_title: COMMIT_OR_PR_TITLE`, a corrected branch (two or more commits) takes
  the squash subject from the PR title written before the findings existed. §3's `--fill` read-back
  catches a title born wrong; this re-read catches one gone stale - run both. **Read the setting,
  don't assume it:** `gh api repos/{owner}/{repo} --jq .squash_merge_commit_title` - a consumer may
  run `PR_TITLE` instead, which changes the exposure. Check the body too: a stale body is where a
  wrong closing keyword would persist, and it must still reach the PR body.
- **Auto-merge has prerequisites - know the fallback.** `--auto` only works if the repo has
  **auto-merge enabled** (`gh api repos/{owner}/{repo} -X PATCH -f allow_auto_merge=true` - a
  one-time repo setting); without it, `gh pr merge --auto` errors ("Auto merge is not allowed for
  this repository") - which a **just-created repo always starts with** (`gh repo create` defaults
  `allow_auto_merge: false`). Separately, a
  self-merge classifier in the harness may refuse to arm auto-merge on an unprotected branch.
  **Fallback:** don't fight either - once CI is green, do a plain squash merge (`gh pr merge <n>
  --squash`). This is for when **nothing is armed**; an armed PR follows the 3-minute rule in the
  arm bullet above. Enabling auto-merge and any branch-protection posture is a per-repo choice the
  `adopt-conventions` onboarding *offers* to set up; this ritual works either way.
- **If the repo requires approvals** (Project Facts `pr-approvals: N`, or branch protection enforces
  reviews), `--auto` is still the right call - it **waits** for the required approvals, then merges,
  rather than erroring. Don't block on it: request the review → hand the PR off → check `gh pr view
  <n> --json state,reviewDecision` at the top of a later turn (*Do not watch a background agent*,
  §1, again - an approval wait is a wait, not something to watch). A solo repo
  (`pr-approvals: none`, the default) never hits the wait.
- **While waiting, use the time - but NOT in the working tree if a non-isolated agent is live in
  it.** This bullet never licenses moving `HEAD` (§1's *While a non-isolated agent is live*). When
  one is live, keep the wait to **GitHub-only or read-only** work - triage, issue comments, reading
  code. When none is, the tree is yours. Good uses either way: shape a pending idea into a spec via
  `fluyt:product-owner`, or prep the next item's questions. (The PO relays its spec in its report
  and writes only research/design reports under `docs/`, so it can't collide with the in-flight PR.)
  Pass the PO the open-issue snapshot in its spawn prompt - it has no `gh` and shapes blind without
  it.
- **One PR at a time** while you are the sole agent - wait for the merge before branching again.
  That wait is *technical serialization* (so a new branch doesn't fork off pre-merge code and
  collide), **not** a prompt to check in with the user. The merge lands and the issue is verified
  closed → continue to the next authorized item - see *Continue autonomously across a scope* in `SKILL.md`.
  *Implementation* can still run ahead in parallel across file-disjoint items (see *Parallel work*);
  only the integration serializes here.
- **Context hygiene between *unrelated* items.** Draining a scope accrues context. At a boundary
  between **unrelated** items (a different subsystem, a fresh scope), consider a manual `/compact`
  to keep the working context lean - but **not** after every item, and **never mid-scope** while a
  run is carrying context across a few *related* items (compaction is lossy summarization). It's a
  human habit, not an automatable step: the client's threshold auto-compaction (on by default) is
  the safety net, and no hook can invoke `/compact` for you . That safety net covers CONTENT only:
  on a repo with a `handover` location configured (Project Facts `handover`), a foreseeable reset
  deserves a written hand-over FIRST - route to the `handover` skill by name, since compaction alone
  silently drops exactly the orchestration state that skill exists to keep.
