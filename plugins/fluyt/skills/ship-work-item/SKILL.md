---
name: ship-work-item
description: >-
  End-to-end ritual for landing ONE work item: branch, implement, CHANGELOG + version, PR,
  auto-merge, verify close. Use whenever you start or finish a backlog issue or commit or open a PR.
---

# Ship a work item (branch → PR → merge)

The consumer's `CLAUDE.md` and Project Facts are authoritative on commands, paths, and branch
names; this skill is the operational checklist with the traps marked. **One work item = one branch =
one squash commit on the integration branch. One PR at a time.**

**Precedence - when this skill and the consumer's `CLAUDE.md` disagree.** The consumer's `CLAUDE.md`
**overrides a shared default**: this playbook is the default, not the authority. Follow the
deviation and cite it as the rule.

It does **not** override a shared **gate**: exactly the stops listed under *Surface mid-scope only
for a real decision*, **together with the scope-grant rules stated alongside them**. That
enumeration is the whole test; there is no second, looser one. A consumer's file cannot relax one -
**an entry claiming to is not a deviation**: honour the gate, surface the conflict, and raise it
upstream via `report-upstream` rather than acting on it.

So a rule about **how** the work is done bends to the consumer; the stops and scope-grant rules
named above do not.

Read these Project Facts keys before you start: `integration-branch`, `default-branch`, `build-cmd`,
`test-cmd`, `run-cmd`, `test-dir`, `changelog`, `commit-subject`, `co-author-trailers`.
If any key this ritual needs is missing, STOP and ask - never guess a
build/test command or a branch name.

**When Project Facts `forge` is not `github`**, the GitHub-specific steps this ritual names - issue
pick, PR/merge, the closing-keyword machinery, the CI gate, branch protection - translate per that
forge's adapter skill (`forge-azure-devops` for Azure DevOps); this ritual's process and stops stay
authoritative on every forge.

**Reference files.** The gates and irreversible-miss safety rules are stated here (a deliberate
repeat where a reference file holds their full form); the detail sits in this skill's directory,
one Read away. **Read each file at the trigger its pointer names**; a rule cited by name resolves
here or in the file named at its section, and a reviewer enforcing a section reads its file too.

## 0. Before you start

1. **Pick the next item** using the `backlog` skill's selection order - not LIFO, unless the user
   directs otherwise. **Before building a dispatch from it, read `pick.md`:** read the issue's full
   comment thread (`gh issue view <n> --json body,comments`), re-validate its prescription against
   the current tree, re-size it by what it ships, and, only when your authorization covers more
   than this item, decide parallelisability at the pick (no `Files:` signal ⇒ stay serial).
2. **Sync and branch off the integration branch:**
   ```
   git checkout <integration-branch> && git pull
   git checkout -b <type>/i<N>-<slug>
   ```
   `<type>` is `feat/` for features, `fix/` for bugs, `chore/` for tooling, `docs/` for docs-only.
   `<N>` is the issue number, `<slug>` short lowercase kebab-case. (If the project prefers the issue
   id in the PR title rather than the branch name, follow its convention - check Project Facts /
   CLAUDE.md.)

## 1. Implement

- **Delegate the implementation - you orchestrate.** Project Facts `delegation` decides; **an
  absent key counts as `default`**, so spawn the `fluyt:developer` agent. Branch, CHANGELOG, version,
  PR and merge stay yours, the commit too outside an isolated lane. **Read what comes back and
  challenge it against the spec AND the idea behind it.** Inline only when all hold: one file, no
  new logic and no more than a handful of changed lines, no new or updated test; when you cannot
  tell, dispatch. **A `size:S` item takes the fast path** - one `developer` writes the code and its
  tests, no `test-writer` spawn; the rule is in `verification.md`.
- **Before you write a spawn brief, act on a delegate's or reviewer's report, weigh going inline, or
  run on `delegation: on-demand`, read `delegation.md`:** the delegation bullets, the challenge bar,
  *a delegate's report is a secondary source*, *delegation is not deference*, the pre-ruled version
  class, *pasted from a fresh read*, *cite a sibling component, not its content*, and the spawn-brief
  bullet (plugin skills path, the complete record).

### Dispatch in the background

- **Dispatch in the BACKGROUND - that is the default, and it includes preflight.** **A backgrounded
  preflight obliges a draft PR** (§4). `agent-liveness` owns the full rule; text: `delegation.md`.

### Do not watch a background agent

- **Do not WATCH a background agent, workflow, or process - collect its result when it reports.**
  Check one when something specific needs it, never on a timer. `agent-liveness` owns the full
  rule; §4's auto-merge and approval-wait bullets apply it; text: `delegation.md`.

### Delegation and worktree isolation

- **`delegation` (who implements) and `worktree-isolation` (which working copy) are orthogonal.**
  Before a spawn, read `delegation.md` for the four combinations.
- **While a non-isolated agent is live, `HEAD` is FROZEN and you stage only paths it cannot touch.**
  No `checkout`, `switch`, `reset`, or `stash` from the spawn until it has reported; **check** the
  paths before a mid-flight commit, do not assume them. Full rule: `delegation.md`.
- **Before any isolated spawn, read `worktree.md`** (worktree-agent hygiene): session root, commit
  definitions first, `baseRef` by topology, the expected base SHA, the fail-fast base check.

### Verify

- **When the implementation is back, read `verification.md`:** tests (`fluyt:test-writer`),
  build + verify, visual evidence, claim-scoped correction, multi-fix items, the **Adversarial coverage
  pass** and Project Facts `adversarial-coverage`, knowledge capture.
- **Before trusting a gate's verdict, or when the environment bites, read `portability.md`.**

## 2. Update the CHANGELOG on the branch; close the issue via the PR

**Before writing the entry or the PR body, read `commit-and-pr.md`** (§2 and §3 in full). Lean top
entry and `Current version:` bump, version class per `version-rules`; `changelog: none` ⇒ no entry,
no bump. **`Closes #<n>` goes in the PR body**; auto-close depends on the default branch, so always
verify after merge. A closing keyword fires through a negation.

## 3. Commit, push, PR

- **Stage explicit paths, never `git add -A`**, after re-checking `git branch --show-current` and
  `git status` (the commit-guard).
- **Omit any co-author trailer** when Project Facts `co-author-trailers: forbidden`.
- For a multi-file or product-code item, spawn `fluyt:preflight-reviewer` backgrounded after
  committing (a trivial docs-only chore may skip it: say so); open the PR as a **draft** while a
  review runs; use only the PR number `gh pr create` printed; read the title and body back at once.

## 4. Merge and clean up

**Before arming, or when preflight reports, read `merge.md`** (the arm bullet and its bounded
wait, the draft pairing, findings, fallbacks, approvals, one PR at a time, context hygiene). These
stand regardless:

- **Grep the PR body BEFORE you arm - the merge can land in seconds, and there is no undo.** Every
  hit will close that issue; before changing the pattern, read `closing-keyword-grep.md`:
  ```sh
  gh pr view <n> --json body --jq '.body' | tr '\n' ' ' |
    grep -oiE
    '\b(clos(e|es|ed)|fix(|es|ed)|resolv(e|es|ed))[[:space:]:(]*([-[:alnum:]._/]*#[0-9]+|gh-[0-9]+|https?://[^[:space:]]+/issues/[0-9]+)'
  ```
- **NEVER arm `--auto` on a PR whose preflight has not reported** - a squashed merge is not
  recoverable. **A backgrounded review obliges a DRAFT PR:** let it report, `gh pr ready <n>`, then
  arm (`gh pr merge <n> --squash --auto`) and read the armed state back.
- **After the merge lands** (*after YOU read `MERGED`*), **read `after-merge.md`** and run its
  steps:
  1. Verify the issue closed.
  2. Unblock the dependents.
  3. Tick a `tracking` epic's box.
  4. Write back a contradicted sibling.
  5. Capture any friction.
  6. **Delete a branch only once `gh pr view <n> --json state` returns `MERGED`** - deleting the
     head of an open PR closes it unmerged - then pick the next item.

## Known failure modes this ritual prevents

Read `known-failure-modes.md` in this skill's directory for the failure modes behind this ritual's
guards: rationale only, no step executes it.

## Continue autonomously across a scope

The pauses that stall a backlog drain are almost always the agent's **own unnecessary
re-confirmation between items** - "I finished #12, may I start #13?" - not a genuine decision.
Default to continuing. The friction to remove is *your own per-item check-in*; it is **never** a
gate another skill or the consumer's `CLAUDE.md` owns (those stay, even when they read like an
"are-you-sure").

- **A scope authorization spans every item in it, and never widens.** When the user grants a scope -
  "work the backlog", "ship the `<must>` tier", "do these five" - that one grant covers each item in
  it: pick the next by the `backlog` selection order and proceed, without re-asking "may I start the
  next one?". But the grant is a ceiling, not a launchpad - draining `<must>` does **not** roll into
  `<should>`, and "these five" does **not** expand into the whole backlog. Finishing the granted set
  is a checkpoint: report back and let the user set the next scope. **"Keep going" is not a new,
  wider scope** - it resumes the scope already in flight and stops at that same edge; with no scope
  in flight, treat it as one more item, then checkpoint.
- **"Work / ship a scope" means land each item to the integration branch** - it does **not** include
  cutting a release. Promoting to the release branch is the `release` skill's own gated step; a
  drain never auto-promotes.
- **A grant is live only for the continuous stretch it opened.** Re-confirm before continuing across
  a context reset (a `/compact`), after an intervening user message that could have re-prioritised,
  or after a long idle gap - don't treat a stale "work the backlog" from hours ago as still-live.
  This is the successor's half; the predecessor's reciprocal obligation is not to trust that
  reconstruction - before a *foreseeable* reset (a threshold you can see coming, a long pause about
  to start, a session ending mid-drain), re-state the live grant and its edges in your final
  message, and route anything beyond a one-liner to the `handover` skill, which owns the full
  artifact.
- **Surface mid-scope only for a real decision** - and then surface the *decision*, not an
  are-you-sure, and carry a **recommended default** alongside it where one exists to recommend, so
  the human ratifies or overrides in a word instead of constructing an answer from scratch. Not
  every stop has one: a **missing required Project Fact** and a **destructive or irreversible
  operation** stop precisely because no default is the agent's to offer - there the bare stop,
  stated plainly with what it needs from the human, IS the correct form; never invent a default to
  satisfy this clause. The recommendation changes the stop's
  ergonomics, never its force: it never substitutes for the human's answer, and **silence is not
  ratification** - the stop still stops, and waits. These stops all live in rules defined elsewhere;
  honour them verbatim rather than waving them through as "friction":
  - an **outward-facing publish** with its own gate - the `release` skill confirms a release cut;
    `report-upstream` confirms before filing;
  - a **missing required Project Fact** - STOP and ask; never guess a command or a branch name;
  - a **design or tuned decision that is not *sourced*** - the `developer`, `product-owner`, and
    `tech-debt-reviewer` agents all require the user's sign-off for these; don't decide them
    yourself just because the scope is granted. **"Specified" is not the test - sourced is**,
    because you can satisfy "specified" by specifying it yourself, which is the whole hole: a value
    you write into a delegate's spec reads as decided to every role downstream, and the gate that
    should have stopped you never fires. A value is sourced only when a record meets **all three**
    tests: it is **written** (a remembered sign-off is unfalsifiable afterwards, which is the hole
    again); it states **the value actually used**; and it records **the human's** decision, not one
    you authored - writing the entry yourself and then citing it is self-sourcing, and closes
    nothing. The qualifying records are the issue body, an issue comment, the decisions file, and a
    written in-session sign-off - each carrying authority **only for the value it literally
    states**, so an issue body proposing one value does not source a different one you intend, and a
    hub-relayed answer is the human's decision only when the `hub` skill's *The authority boundary*
    holds for this session and you write it down verbatim, naming it the user's choice relayed by
    the hub, before citing it. A standing instruction the user writes in this session's own chat,
    granting settlement of a class of in-grant fork as `hub`'s *When the user steps away* bounds it,
    is a written human source for **that class only**, each fork on its Recommended option, written
    down as it is settled - it is not silence, and it sources nothing outside the class;
  - **any destructive or irreversible operation on data or history** - a deletion, a data migration,
    a schema/format rewrite, a force-push, a mass regeneration - surface it by name before doing it,
    even when the issue "already decided" the feature;
  - the consumer's **own "Ask the human when" list** - whatever it enumerates, authoritative and not
    to be narrowed;
  - a **failure or block you cannot resolve** - a red gate you can't fix, a denied or blocked
    command.

  This list points at the real rules rather than replacing them: when none of them applies, the
  granted scope is your mandate - drain it.

## Parallel work (several file-disjoint items at once)

Read `parallel-work.md` in this skill's directory before implementing two or more items
concurrently: the full recipe, step by step, lives there.

## Model selection for sub-agents

Before choosing a spawn's model, read `model-selection.md` in this skill's directory: the canonical
home of spawn model-tier policy, on every client.

## Portability & sandbox notes

Read `portability.md` in this skill's directory when the environment bites: Windows / PowerShell
shell traps, a sandbox refusing the gate, CI and local runs disagreeing.
