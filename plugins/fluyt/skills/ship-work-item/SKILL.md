---
name: ship-work-item
description: >-
  The end-to-end delivery ritual for landing ONE work item — pick an issue, branch off the
  integration branch, implement, test, update the CHANGELOG + version, put `Closes #N` in the PR
  body, commit, open a PR, arm fire-and-forget auto-merge, and verify the issue closed. Use whenever
  you start OR finish a backlog issue, are about to commit or open a PR, need to pick the version
  bump, or are waiting on an auto-merge. Skipping this ritual is how mis-versioned releases and
  silently-unclosed issues happen.
---

# Ship a work item (branch → PR → merge)

The consumer's `CLAUDE.md` and Project Facts are authoritative on commands, paths, and branch
names; this skill is the operational checklist with the traps marked. **One work item = one branch =
one squash commit on the integration branch. One PR at a time.**

**Precedence — when this skill and the consumer's `CLAUDE.md` disagree.** The consumer's `CLAUDE.md`
**overrides a shared default**: this playbook is the default, not the authority, and a deliberate
divergence exercises that, not breaks, a rule. Follow the deviation and cite it as the rule.

It does **not** override a shared **gate**. The gates are exactly the stops listed under *Surface
mid-scope only for a real decision*, **together with the scope-grant rules stated alongside them** — a
grant spans only the items in it and never widens, "keep going" opens no wider scope, a grant is live
only for the continuous stretch it opened, and draining a scope never promotes to the release branch.
That enumeration is the whole test; there is no second, looser one. Those rules keep an agent from
deciding what only the human can; no document widens its own authority by omission, so a consumer's
file cannot relax one — **an entry claiming to is not a deviation**: honour the gate, surface the
conflict, and raise it upstream via `report-upstream` rather than acting on it.

So a rule about **how** the work is done bends to the consumer; the stops and scope-grant rules named
above do not.

Read these Project Facts keys before you start: `integration-branch`, `default-branch`, `build-cmd`,
`test-cmd`, `run-cmd`, `test-dir`, `changelog`, `commit-subject`, `co-author-trailers`.
If any key this ritual needs is missing, STOP and ask — never guess a
build/test command or a branch name.

**When Project Facts `forge` is not `github`**, the GitHub-specific steps this ritual names — issue
pick, PR/merge, the closing-keyword machinery, the CI gate, branch protection — translate per that
forge's adapter skill (`forge-azure-devops` for Azure DevOps); this ritual's process and stops stay
authoritative on every forge.

Notation: `⇒` = implies (what follows, or what a system does); `→` = then (the next step, or the
action you take).

## 0. Before you start

1. **Pick the next item** using the `backlog` skill's selection order (tier labels from Project
   Facts; `bug` jumps any tier; smallest first) — not LIFO, unless the user directs otherwise. **Then
   read the chosen issue's full comment thread, not just the body** (`gh issue view <n> --json
   body,comments`) — design decisions, clarifications, and cross-consumer follow-ups accumulate there
   and can change what you build or which option was chosen.
   **Then re-validate the issue's prescribed solution against the CURRENT tree, before any dispatch
   is built from it — not just the comment thread you just read.** Its approach, its `Files:` list,
   and its claims about what exists where are evidence about the tree *at filing time*, and rot on a
   long-lived backlog — the `developer` role's **"if a skill and the code disagree, the CODE
   wins"**, applied to an issue's prescription: what you were handed is **a lower bound, not a
   boundary**, never an instruction the current tree must still satisfy. Check the approach still
   holds, that the `Files:` list still names what it claims (existing vs. "(new)"), and that any
   factual assertion about current state is still true. When it no longer holds — unsatisfiable,
   self-contradictory, already done, or the named file/state has moved — surface it through the
   existing **a design or tuned decision that is not *sourced*** stop under *Surface mid-scope only
   for a real decision*, rather than deciding it yourself or inventing a parallel stop. This
   precedes the §1 transcribed-claim rule: that one verifies a CLAIM at brief-writing time; this one
   validates the PRESCRIPTION at pick time.
   **Then re-size the item against what it SHIPS, not just its diff.** An item that ships an
   executable artifact — a command, a regex, a script — into a repo with no harness to execute it is
   never `size:S`, whatever the label reads: bump the expected cost a tier and forecast an
   execute-before-ship loop, because a shipped command must be EXECUTED, in its final form, before it
   ships — reading it, or grepping for it, never substitutes.
   **Then decide parallelisability HERE, at the pick — not after the merge, where it is too late to
   act on.** Only when the authorization you already hold covers **more than this one item** (a
   granted tier, a named set, "work the backlog" — see *Continue autonomously across a scope*) do
   you compare the next one or two items' `Files:` sets in that scope against this one's; disjoint →
   consider *Parallel work* now. It is **not** licence to widen a scope — under a single-item
   authorization, stay serial and do not go looking for a second item. **And when the signal is
   absent — no `Files:` line on the issue, no file list in a triage comment — stay serial.** That is
   the normal branch, not an exceptional one. Never substitute a guess: titles and labels do not
   establish disjointness, and two items that turn out to share a file cost more than the
   serialization saved.
2. **Sync and branch off the integration branch:**
   ```
   git checkout <integration-branch> && git pull
   git checkout -b <type>/i<N>-<slug>
   ```
   `<type>` is `feat/` for features, `fix/` for bugs, `chore/` for tooling, `docs/` for docs-only.
   `<N>` is the issue number, `<slug>` short lowercase kebab-case. (If the project prefers the issue
   id in the PR title rather than the branch name, follow its convention — check Project Facts /
   CLAUDE.md.)

## 1. Implement

- **Delegate the implementation — you orchestrate.** Project Facts `delegation` decides *who*
  implements, and delegation is the default: **an absent key counts as `default`**, so unless the
  consumer opted out you spawn the `fluyt:developer` agent to write the code while you do the
  recon, write the spec, and keep **branch, CHANGELOG, version, PR, and merge** — those stay with
  the orchestrator on every path through this skill, not only in *Parallel work* (which reserves the
  same shared files for the same reason). The commit is yours too, except in an isolated lane: a
  worktree `developer` commits its own branch (*Delegation and worktree isolation*), and a
  `test-writer` pinned to that worktree commits only its `test-dir` files (*Parallel work*). Hand the slice only to a role that can run the gate:
  `developer` and `test-writer` carry Bash and can run `build-cmd` / `test-cmd`; `product-owner`,
  `scrum-master`, and `tech-debt-reviewer` cannot, so an implementation slice never goes to them. And
  **read what comes back** — the returned diff is what keeps your §2 version call, the §3 commit-guard,
  and your preflight adjudication accurate; delegating the typing never delegates that judgment.
  **Challenge what comes back against the spec AND the idea behind it**, and keep challenging until it
  meets both: the letter of an acceptance list is satisfiable by work that misses the point it was
  written for, and a slice that ticks every box while defeating the reason the box exists is not done.
  Patching it yourself instead is the tempting shortcut and the expensive one — it destroys the signal
  that your brief was the thing at fault, and puts you back in the implementer seat the `delegation`
  default just moved you out of. When what comes back needs a correction or challenge **on the slice
  it just did**, resume the delegate rather than re-briefing a fresh spawn — the `agent-liveness`
  skill's *When it returned — resume rather than re-dispatch* section owns the rule and its bounds,
  including the fallback when the client cannot resume. To run **several file-disjoint items
  concurrently**, read `parallel-work.md` in this skill's directory and follow it.
- **Opting out, and the one inline exception that survives the default.** Delegation is the
  default because **the human has to be able to reach the orchestrator mid-turn**: one that is itself
  editing cannot be steered until it finishes — a concern distinct from co-edit collision safety
  (`worktree-isolation`'s job, below); `agent-liveness`, *Dispatch detached, and never watch*, owns
  the reachability rule. It is a Project Facts key because **a recommendation the consumer never reads
  is not reachable.** Project Facts is read at the top of every ritual, so a value there is seen and
  can be overridden deliberately — anything meant to set an agent's default behaviour belongs in a
  key. A repo onboarded before the key existed therefore delegates on its next item
  (no key reads as `default`); write `delegation: on-demand` to keep the previous inline behaviour.
  On `delegation: on-demand` you implement in the shared checkout and spawn the `developer` only for
  genuine parallelism or a large self-contained chunk. Even on `default`, **a change too small to be
  worth a dispatch may go inline** — and the test is concrete, not "use judgment". All three must
  hold: **(a) one file**; **(b) no new logic, no more than a handful of changed lines** — a typo, a
  wording fix, a denylist token, a literal value, a single guard; **(c) no new or updated test
  needed.** Any of the three fails → dispatch. When you cannot tell, dispatch: a needless dispatch
  costs one turn, a needless inline sprawl costs the whole reason the default exists.
- **A delegate's report is a secondary source about its own work — verify its load-bearing claims
  against the tree before you act on them.** Reading the returned diff (above) is not this check: the
  diff is a primary output, while the report's *claims* about it — a measured figure, a green test
  count, "every site is updated", an assertion about a file the diff never touches — are a summary
  written by the one party that is not a neutral witness to the work. Before any of them carries
  weight in your version call, your CHANGELOG entry, or the next brief, re-derive it from the primary
  output: re-run the deterministic probe yourself, read the diff, grep for the residue the report
  calls zero.
- **Delegation is not deference: a reviewer's report gets exactly the same treatment.** Verification is
  delegated too — preflight runs as a subagent, and an adversarial pass often does — so its verdict
  reaches you as a report like any other, and the rule above applies unchanged to a PASS as well as to
  a fix list. Spot-check it: re-verify one finding against the tree, and confirm a rule the report
  cites says what the report says it says. A PASS that skipped a check it claims to run and a FAIL that
  misread the diff fail you in opposite directions, and both read identically on the page.
- **A pre-ruled version class travels with the spawn brief.** When the picked issue pre-rules the
  version class, the spawn brief restates that ruling and names the behaviour axis it rests on —
  cite the `versioning-and-changelog` skill for the axis rather than restate its test (this skill's
  own *cites the component, not its content* rule, below). The delegate does not silently
  re-classify: a disagreement goes in its report-back as a note for you to adjudicate, never into a
  changed class —
  the failure mode this guards against is a delegate reading a shipped-skill instruction addition as
  wording-only PATCH. No ruling on the issue ⇒ nothing changes: the normal class selection at
  CHANGELOG time (§2) applies.
- **A specific factual claim copied from the issue into the spec you write, or into any text you ship
  in a component, needs the same verification the `versioning-and-changelog` skill's primary-source
  rule already requires before a CHANGELOG entry — done here instead, because both are earlier
  crossings and the claim is already an instruction, or a shipped fact, by the time it reaches
  either.** Don't count on the delegate to catch it: a brief is an instruction, and an obedient
  delegate is exactly the one that won't question it, so the verification has to happen where you
  transcribe the claim, not downstream. A claim that cannot be exercised — no doc, no command, no
  reproducible check — is declined or attributed as unverified, never shipped as fact.
- **A fact that lives in a record is PASTED from a fresh read of that record, never recalled** —
  the paste-the-SHA rule (worktree hygiene, below), generalised to prose. When a spawn brief, a
  CHANGELOG entry, or issue text states a value, a polarity, or an attribution that a record holds —
  an issue body, a spec, a decisions entry, the CHANGELOG — open the record and transcribe from it
  in the same breath; recalled values drift. This is the crossing BEFORE the
  transcribed-claim bullet above: that one verifies a copied claim's truth; this one stops the
  transcription itself from being invented.
- **Shipped text needing a sibling component's specifics cites the component, not its content.**
  When a skill, agent, or doc needs another component's steps, contract, or values — another
  skill's procedure, an agent's contract, a doc's tuned values — name/route to that component and
  state only what THIS text needs from it; restating the sibling's specifics is invisible
  drift-debt the moment the sibling changes and this file doesn't. The discriminating tell: if your
  text goes stale when the sibling changes but your file doesn't, you restated it; if it still reads
  true, you cited it. The `handover` skill's "Cite, don't copy" is this same rule's pre-existing, artifact-specific
  instance.
- **Every role spawn's brief carries the resolved plugin skills path** — `$CLAUDE_PLUGIN_ROOT` when set,
  else your client's resolved install-cache path — or the sections that role needs pasted in directly:
  in a consumer repo the plugin lives in the install cache, not the working tree, and no subagent has a
  Skill tool. You know that path at spawn time, and its absence is what sends an agent hunting for it.
  Same family, same rule: hand it the **complete** record, never a silently condensed one — a
  snapshot, a comment thread, a prior report. A condensed record produces phantom findings: a
  delegate analyzing an abridged record reports defects in what the abridgement dropped, not in the
  work. Where condensing is unavoidable, say so in the brief and name what you dropped, so the
  delegate can weight its conclusions accordingly. A read-only role (no `gh`, no Bash) gets its
  records saved to files — **write the file before the dispatch call returns**: a write racing the
  agent's first read leaves the agent reading an absent record as an empty
  one and reporting confidently on nothing.

### Dispatch in the background

- **Dispatch in the BACKGROUND — that is the default, and it includes preflight.** Spawn a subagent
  detached rather than blocking on it: a blocking spawn holds you unreachable for its whole run, which
  is the reason already stated above. **A backgrounded preflight obliges a draft PR** (§4). The full
  rule — the trade it makes, and what to do on a client that cannot dispatch detached — lives in the
  `agent-liveness` skill, which owns this concern.

### Do not watch a background agent

- **Do not WATCH a background agent, workflow, or process — collect its result when it reports.** Check
  a background result when something specific needs it — the next turn that consumes it, or a silence
  out of proportion to the slice — never on a timer. §4's auto-merge and approval-wait bullets are
  applications of it. The full rule, including the *watching* vs *waiting* distinction it turns on,
  lives in the `agent-liveness` skill, which owns this concern.

### Delegation and worktree isolation

- **`delegation` and `worktree-isolation` are orthogonal — never read one as the other.** `delegation`
  answers *who implements*; `worktree-isolation` answers *in which working copy* — set that one to
  `default` when the maintainer may co-edit the same working copy you commit into, so a `git checkout`
  under your feet can't land a commit on the wrong branch. The worktree key is deliberately not the
  who-implements switch: a co-edit-safety setting must not silently
  reverse the implementer model. So read each key for its own question. The §3 commit-guard is the
  always-on floor in all four combinations, and all four are supported:
  - **`delegation: default` + `worktree-isolation: on-demand`** (both defaults) — spawn the `developer`
    **non-isolated**: it implements in the shared checkout, you commit. The common path — and the one
    that puts **two actors in one working copy**, so see *While a non-isolated agent is live* below
    before you touch git.
  - **`delegation: default` + `worktree-isolation: default`** — spawn the `developer` with
    `isolation: worktree`; it implements and commits on its worktree branch and you integrate from
    there: read steps 5–6 of `parallel-work.md` in this skill's directory, the integration and cleanup
    mechanics, and apply them to the single item.
  - **`delegation: on-demand` + `worktree-isolation: on-demand`** — you implement in the shared checkout
    yourself; no spawn, and the commit-guard is your only protection.
  - **`delegation: on-demand` + `worktree-isolation: default`** — the two pull opposite ways and
    **isolation wins for product-code items**: co-edit safety is structural, an implementer preference
    is not. Product code still goes to a `developer` with `isolation: worktree`; `on-demand` then means
    only that you keep the non-product edits (CHANGELOG, docs, config) in the shared checkout — which
    you were doing anyway.
- **While a non-isolated agent is live, `HEAD` is FROZEN and you stage only paths it cannot touch.**
  This is addressed to **you, the orchestrator, as the mover**: the §3 commit-guard protects the
  **committer** from a `HEAD` that already moved, while this rule stops you moving it.
  - **Freeze `HEAD`.** No `checkout`, `switch`, `reset`, or `stash` from the moment you spawn a
    non-isolated agent until it has reported. Moving `HEAD` under a live agent ⇒ its next commit
    lands on whatever branch you just switched to.
  - **A mid-flight commit is allowed only on paths the agent cannot touch** — and you must *check*
    that, not assume it. The standing safe case is the **`changelog`**, which §1 and *Parallel work*
    both reserve to the orchestrator; a `test-writer` confined to `test-dir` is another. Compare the
    path sets before you stage. "It was fine last time" is not the test.
  - **Recon is not exempt.** Reading files is safe; `git checkout` to *look at* another branch is not.
    Use `git show <ref>:<path>`, `git log`, or a second working copy — none of them move `HEAD`.
  - **The time background dispatch frees is not working-tree time** — **take it on GitHub-only or
    read-only work**, as §4's *While waiting, use the time* spells out.
  - **A `test-writer` or reviewer pointed at ANOTHER working copy is exempt** — the test is *which
    working copy it touches*, not how it was spawned. *Parallel work* step 3 spawns a `test-writer`
    "non-isolated" yet pins it to `git -C <worktree>` and absolute paths under that worktree; a
    worktree keeps its own `HEAD` ref, so nothing you do to the shared checkout's `HEAD` can reach it.
    Read "non-isolated" here as **shares your working copy**, which is the only sense that creates the
    hazard.
  - **`worktree-isolation: default` closes this class structurally**: the agent gets its own working
    copy, so there is no shared `HEAD` to move. Reasoning about path disjointness often ⇒ the
    signal to flip the key rather than keep applying this rule by hand.
- **Worktree-agent hygiene — now a common path, not an aside; every isolated spawn needs all four,
  and the session needs one precondition before the first of them:**
  - **Before the FIRST isolated spawn of a session, confirm the session root is the repo root.** A
    session rooted one directory above the repo never loads `<repo>/.claude/settings.json`, so
    **whichever `worktree.baseRef` the repo configures is inert** — an
    isolated agent then silently branches from the far-behind release branch, regardless of the
    configured value. The session-root check matters on every topology below, not only the one that
    sets `head`. Diagnose with the *Project settings resolve from the SESSION ROOT* check in
    `install-refresh-plugin`. Workaround for a mis-rooted session: plain `git worktree add` under the
    scratchpad, with **non-isolated** agents pointed at that path in their prompt.
  - **Commit any agent-definition or settings changes FIRST.** A worktree-isolated agent loads the
    *committed* definition + settings from its base commit — NOT your uncommitted working-tree edits.
    An uncommitted grant ⇒ the agent runs with the OLD capabilities.
  - **Which `baseRef` to configure depends on whether `default-branch` IS the `integration-branch`**
    (Project Facts) — the two topologies need opposite settings.
    - **`default-branch == integration-branch`** (the topology this playbook recommends, because it
      makes `Closes #N` auto-fire): prefer `worktree.baseRef: "fresh"` (leaving the key unset
      behaves identically). A worktree then branches from the remote **default** branch — which on
      this topology IS the integration branch — **but the client resolves "the remote default" via
      the local `origin/HEAD` symref, a clone-time snapshot that never auto-updates.** A repo whose
      GitHub default later moved still has the symref pointing at the old branch, and `fresh` then
      provisions off that stale target (e.g. a worktree based on a far-behind release branch; the
      fail-fast base check below catches it). So run
      `git remote set-head origin --auto` in the same breath as the pre-spawn `git fetch` — one
      command that re-syncs the symref — and treat `fresh` as prevention **conditional on that
      symref being current**, with the base check as the mandatory backstop, not as an
      unconditional by-construction guarantee. **Caveat that survives regardless:** `fresh` branches from the
      **remote** tip, so an isolated agent spawned this way cannot build on unmerged local work or a
      local feature branch — an orchestrator wanting that must resume an agent in its existing
      worktree, or set `head` deliberately for that one spawn, rather than spawn a fresh isolated
      one. Push everything the isolated agent needs to `origin` before spawning.
    - **`default-branch != integration-branch`:** `fresh` would land the agent on the default
      branch, which is NOT the integration branch — set `worktree.baseRef: "head"` instead. A
      worktree then branches from your current local HEAD, so be on the freshly-synced integration
      branch (or the right feature branch) when you spawn.
  - **Right before you spawn, capture the expected base and state it in the spawn prompt** — the
    agent has nothing to assert against otherwise. On `fresh`, run `git rev-parse
    origin/<integration-branch>` (after a `git fetch`, if the remote tip might be stale); on `head`,
    run `git rev-parse HEAD` while standing on the freshly-synced branch. **Paste the SHA the
    command printed — never retype it**; a retyped SHA can carry a typo, which turns the
    base check into a check against a wrong expectation rather than the real base.
  - **Give the spawn prompt a fail-fast base check — existence AND identity, run FIRST.** Run it
    as the very first command of the spawned agent's turn, before any edit or commit: "Confirm `<a
    known-recent file/dir>` exists AND `git rev-parse HEAD` equals `<the expected base SHA stated
    above>`; on a mismatch, check whether the expected SHA even exists (`git cat-file -t <sha>`) and
    report which side is wrong — a pasted-in expectation that was never a real commit, or a worktree
    that genuinely branched off something else — then STOP either way." The discrepancy branch adds
    diagnosis; it never licenses proceeding — STOP stays the default action on any mismatch. Timing
    matters: HEAD moves the instant the agent commits, so a
    check run after a first commit either misreads its own work as drift or, run even later, passes
    trivially and proves nothing — the equality only means what this rule claims before the agent has
    touched anything. Existence alone only catches a base branched off the far-behind release branch:
    a feature branch cut from the synced integration branch contains every file an existence check
    could name, so it can't tell "based on the integration branch" from "based on a feature branch
    that happens to include it," nor catch the integration branch moving on after the SHA was
    captured. The identity half closes that gap — with exact equality, not
    `git merge-base --is-ancestor <expected> HEAD`. That looks like the more robust refactor but is
    actively wrong here: a feature branch cut from the integration branch IS a descendant of it, so
    `--is-ancestor` PASSES for precisely the drift case this check exists to catch — a check that
    would pass for a wrong base is a GAP, not a cover. And it compares commits, not branch names,
    because of where the ritual already puts you, not because git blanket-forbids the name: this
    ritual's own opening `git checkout <integration-branch>` and this bullet's re-sync put the
    orchestrator ON the intended base when it spawns, so git can't check that same branch out again
    for the new worktree and mints it a fresh name instead — `git branch --show-current` has nothing
    correct to match against.
  - **After an isolated agent hands back, the harness may have moved the session's working directory
    into that lane's worktree** — use absolute paths or `git -C`, and re-check `pwd`, before the
    next git command.

### Verify

- **Tests are authored by the `fluyt:test-writer` agent** (it writes ONLY under the Project
  Facts `test-dir`, and **self-verifies** its drafts by running `test-cmd` — self-clearing its own test
  bugs, escalating product-looking reds). You **re-run the suite once as the integration gate**,
  adjudicate any escalated blocker, and fold its tests into this same PR.
- **Build + verify after the change:** run the `build-cmd` and `test-cmd` from Project Facts; if
  there's a `run-cmd`, launch so the change can be seen. Launching is fine; driving or capturing the
  desktop follows the `developer` contract's *Never act on the user's desktop*, and a live-only
  check goes to the user as a step. (If `build-cmd`/`run-cmd` is `none`, skip that step — some
  projects have no build.) Before trusting the gate's verdict, read `portability.md` in this skill's
  directory: the verdict-token and CI-over-local rules apply on every OS, and it also covers Windows /
  PowerShell traps and a sandbox that refuses the gate.
- **Visual changes need visual evidence (only if Project Facts declares `visual-verification`).** For a
  GUI / rendering product, build + tests + a launch prove the process ran, not that the *rendered
  output* is right. Your change touches the key's `rendering-paths` → capture the declared visual
  states (via its `capture-cmd`) → review them → record the declared `evidence-marker` attestation in
  this item's CHANGELOG entry / PR body — the `fluyt:preflight-reviewer` FAILs a rendering change
  that lacks it. No `visual-verification` key → nothing to do here.
- **Claim-scoped correction: dispatch by the claim, not by the site list.** When a correction
  targets a **claim** — "this statement is false, fix it wherever it appears" — what you were
  handed is a **lower bound, not a boundary**: find and correct every instance of the claim,
  treating named sites as non-exhaustive examples. This authorises exhausting one named claim and
  nothing else — not licence to widen scope on any other kind of item. Close the sweep with a grep
  for the claim's distinguishing phrasing, checking its **concepts, not one literal wording**, and
  report every surviving hit with a one-line justification for why it is not an instance — this is
  what turns "I fixed what I found" into "nothing is left." When the claim under correction is a
  tuned value, triage each survivor into one of two buckets: a **current-tense claim built on the
  old value** ("X never fires", "no Y has ever happened") that the new value now
  falsifies — fix the prose, never the value; a paragraph **quoting the old value as the reasoning a
  later decision corrected** — that quotation IS the decision record and must survive verbatim.
  Find-and-replace on the old literal is the wrong tool here: applied blind, it destroys the second
  bucket, overwriting the very record of what changed and why. **Derive those search terms from the
  claim, never from the wording you just corrected.** Write the claim down as a
  proposition, enumerate the ways it could be *said*, and search for those — including forms sharing
  no keyword with the text you edited. The tell that you have it backwards: **a pattern containing a
  word you just deleted is searching for your own fix, not for the claim.** What routinely survives a
  keyword sweep is a **definite article** carrying an exclusivity word's work ("*the* scan a release
  boundary triggers" asserts what "the *only* trigger" did), a synonym, a passive restatement, and a
  sentence asserting the claim's *consequence* instead of the claim. **The closing grep
  applies on the inline path too**: it attaches to *the correction*, not to *the dispatch*. Nor does
  the next bullet point the opposite way: **several genuinely independent fixes** still land **one
  at a time**; **one claim appearing at many sites** is a single defect, corrected as **one sweep**
  and closed with the grep above — splitting it site-by-site is how a corrected claim survives at
  every site nobody revisited.
- **Multi-fix items: one at a time, easiest-first, verify between each.** When a single work item is
  several *independent* small fixes (e.g. a batch of in-code `// TODO:`s), land them one at a time —
  easiest first unless directed otherwise — running `build-cmd` / `test-cmd` (and `run-cmd` if set;
  skip whichever is `none`) **between each**, not batched into one untested sweep. Then a regression
  is attributable to exactly one change instead of a five-in-one guessing game. This is the in-branch
  counterpart to the `backlog` skill's smallest-first *issue* selection.
- **Adversarial coverage pass (optional — for oracle strength).** After the suite is green and
  before preflight, decide RUN vs SKIP. **RUN** when a wrong answer would be *silent*: not announced
  by a crash, a red test, or visible output, and consumed downstream. Math / geometry / formula /
  resolver logic is one example of a silent-answer slice, not the gate. **RUN** also when the slice
  claims an invariant "by construction" — on **either** reading: the test's shape (a
  symmetry/determinism property test that passes for *any* implementation, so it cannot catch an
  implementation mutation) or the code's own claim (asserted to hold an invariant by construction,
  with no test that would catch a violation); "invariant" means one the consumer's working agreement
  declares. This second RUN disjunct fires even when the wrong answer would be loud — a crashing
  property test still can't tell you which mutant survived. **SKIP** only when both hold: a wrong
  answer would surface loudly (crash / red test / visible output), and the slice makes no
  by-construction invariant claim — so either RUN disjunct true routes RUN, both false SKIP. When
  you SKIP, optionally substitute one cheap mutation-floor check (flip a guard `>`→`>=`, confirm a
  test dies). This differs from `preflight-reviewer`'s Step 7: Step 7 reads the diff against the declared
  invariants; this pass reads the tests' oracle. That is what it probes — **oracle strength**: would
  the tests actually fail if the implementation were wrong? — which neither the green suite nor
  preflight (it re-runs the same suite) covers. Run it however you review: a careful adversarial read
  of the diff + tests, or a workflow if you have one — the mechanism is yours. When a `test-writer`
  handback for this slice is available — its **Invariant → discriminating test** map, which arrives in
  report text, not a file, so you need it in context or pasted somewhere reachable — start from that
  map and attack its claims instead of re-deriving them from a blank diff: strictly cheaper, and it
  probes a stated claim rather than a self-invented one. A map row without a captured kill is the same
  **prediction** the paragraph below defines, so it is executed, never trusted — run the guard rows'
  named mutations first. Absent that (no `test-writer` was spawned, or
  `test-dir: none` — the common case), re-derive the map from the diff and tests exactly as before;
  the degradation is unconditional, not a dependency on an artifact that often won't exist. Pair it
  with the doctrine that a "by-construction" property test needs a companion **discriminating oracle**
  test (an independently-computed, known-answer expected value).
  **Every verdict cites the captured output it rests on, and inference is labeled as inference.** A
  verification report is where the claims-vs-primary-source rules bite hardest, so each verdict
  names the command run and the captured result it rests on; an attribution reasoned from
  reading rather than measured is marked as inferred; and a verdict with no captured evidence is a
  **prediction**, which the report must label as one and the adjudicator must weigh as one. When the
  pass runs delegated, this requirement travels **in the spawn brief**, not only here — a doctrine
  line binds nobody who runs the pass from a condensed brief.
- **Project Facts `adversarial-coverage` decides whether the pass above is optional or required —
  read it before you decide RUN vs SKIP.** Absent, or set to `on-demand` (the shipped default, and
  what an absent key reads as): the pass above stays optional, its own RUN/SKIP criteria deciding.
  Set to `default`: for a product-code slice that **touches a declared invariant** — the consumer
  CLAUDE.md's normative invariants section, not bare "product code" — the pass RUNS, and a SKIP
  needs a **stated reason recorded in the PR body and the CHANGELOG entry** (a checkable marker, not
  "the handback", which is no defined artifact in this ritual). **This is self-reported,
  not a gate — say so plainly when you cite it:** a missing adversarial read leaves no signal in
  the diff, so nothing downstream — not `preflight-reviewer`, not CI — can detect its absence; call it
  "enforced" and you'd be misdescribing what can actually be checked.
- **Knowledge capture (optional).** If you hit a durable environment or toolchain trap while implementing
  — a sandbox quirk, a shell gotcha, a build wrinkle that will bite the next person — append it to the
  matching **project-local skill** *in this same PR*, so the knowledge lands where it's consumed
  instead of evaporating. An offer, not a gate; skip it when there's nothing durable to record. (This
  is the durable counterpart to the git-ignored friction breadcrumb in *After the merge lands* step
  5 — that one feeds the next retro; this one updates the consumed playbook.)

## 2. Update the CHANGELOG on the branch; close the issue via the PR

**CHANGELOG** (single source of truth — see the `versioning-and-changelog` skill for the full
anatomy): add a lean new top entry `## [X.Y.Z] — YYYY-MM-DD` (summary plus why, no file
inventory), and bump the `Current version:` line. **Version rule:** Project Facts `version-rules` is
authoritative; the canonical MINOR/PATCH shape and its tie-breaker are `versioning-and-changelog`'s
*The bump rule*. **File count is not an axis** — a one-file change that alters product behaviour is
MINOR. **`changelog: none` (an unversioned repo) means no entry, no bump, and no version in the
commit subject.**

**Point-of-use reminder (deliberate — the rules live in §1):** every number, count, and identifier in
this entry — and in the PR body and issue comments below — follows §1's *pasted from a fresh read,
never recalled* bullet, and any figure a delegate reported follows §1's *report is a secondary
source* bullet (re-measure before citing). This line points; it does not restate.

**The issue** (no tracker file to edit):

- Put **`Closes #<n>` in the PR body**. Whether it auto-closes depends on the default branch:
  - `integration-branch == default-branch` (Project Facts) ⇒ the merge auto-closes the issue.
  - `integration-branch != default-branch` ⇒ GitHub will NOT auto-close → you MUST close it
    manually after the merge (§4, *After the merge lands* step 1).
  - Auto-close can silently no-op even when correctly wired, so **always verify after merge** regardless.
- **A closing keyword fires on the TOKEN PATTERN, regardless of the surrounding words — a negation does
  not disarm it.** GitHub matches `close`/`closes`/`closed`/`fixes`/`resolves` adjacent to an issue
  reference; it does not read English. A PR body reading
  *"this does **NOT** close #N"* **would close the issue anyway.** To mention an issue without closing it,
  phrase it **noun-first** so no keyword touches the number — *"#N is not resolved here"*,
  *"related to #N"*, *"follow-up: #N"*. This trap is easiest
  to hit precisely *because* this ritual is careful about closing keywords: an author explaining why a
  PR does not close something reaches for the keyword to deny it.
- No issue (a pure process/tooling chore) → the PR carries an explicit "no issue — <why>" note.
- Any per-item decision → record it as an issue comment; durable → also in the decisions file
  (Project Facts `decisions`). **An in-session ratification is citable only once that durable
  record exists** — a dialog answer is not an artifact, so write the comment / decisions entry
  FIRST, then cite what the forge returned (the artifact-citation rule below, applied forward).
- **When you claim to have recorded something externally, cite the ARTIFACT the forge returned —
  never the act.** The comment URL `gh issue comment` prints, the number/URL `gh issue create` /
  `gh pr create` prints — not a paraphrase like "I noted it on the issue." A recording claim with no
  returned artifact is unverified, and must be written as such.
- Remove any in-code `// TODO:` comment the item implemented.

## 3. Commit, push, PR

- **Stage specific paths — never `git add -A` blindly, and confirm the branch first.** The user's
  local working tree often carries unrelated WIP (uncommitted assets, local experiments), and when the
  maintainer co-edits the same checkout a `git checkout` can move HEAD under you — a staged commit then
  lands on the wrong branch. So **before every `git add` / `git commit`, re-check that
  `git branch --show-current` is the branch you intend and that `git status` shows only this item's
  files** — abort or redirect if HEAD moved; stage explicit paths, never `git add -A`. (Worktree
  isolation — Project Facts `worktree-isolation: default`, §1 — prevents the collision structurally;
  this guard is the always-on floor for the shared-checkout case.)
  **This guard protects the committer from a `HEAD` that already moved; it does not stop whoever
  moved it** — that is §1's *While a non-isolated agent is live*. Both are needed.
- **Commit identity:** the maintainer's git identity only — **omit any co-author trailer** if
  Project Facts `co-author-trailers: forbidden`.
- **Pre-flight gate (multi-file / product-code items):** after committing, spawn the read-only
  `fluyt:preflight-reviewer` agent on the branch — it re-runs build + tests and checks diff
  scope, trackers, and invariants, returning PASS or a numbered fix list. **That spawn is backgrounded
  like any other (§1), so do not wait on it here** — continue to the push step below, which opens the
  PR as a draft while the review runs. §4 owns what happens when the findings arrive. Trivial
  docs-only chores may skip the gate (say so in your summary). **Hand the reviewer the plugin rules
  it must cite** — the plugin path, per §1's spawn-brief rule.
- **Push and open the PR into the integration branch — as a draft whenever a review is still
  running** (§4's standing pairing; that is the ordinary path for any item that ran the gate):
  ```
  git push -u origin <branch>
  gh pr create --fill --base <integration-branch> --draft
  ```
  Drop `--draft` only when no review is outstanding — the gate was skipped, or it already reported.
- **Capture the PR number from `gh pr create`'s own output — never derive or guess it.** PRs share
  the issue number sequence, so on a repo with N issues the first PR is number N+1, not 1 — a guessed
  number targets a wrong-or-missing object (`gh pr merge <guess>` fails with "Could not resolve to a
  PullRequest", or worse, resolves to some *other* PR). Every later step (checks-watch, merge, ready)
  uses only the number/URL that `create` printed.
- **PR title = the squash commit subject** in the Project Facts `commit-subject` format (canonical:
  `<type-or-id>: <summary> (vX.Y.Z)`); the length cap is in `versioning-and-changelog`, *Version-stamped
  commit subjects*. **Put `Closes #<issue>` (or the "no issue — <why>" note) in the
  commit MESSAGE BODY** — a line below the subject — so `gh pr create --fill` carries it into the PR
  body and the merge auto-closes the issue. The subject's bare `#<issue>` only *links*; it does **not**
  close. (Explicit PR body instead of `--fill` → put `Closes #<issue>` there; either way the closing
  keyword must reach the PR body.) **The commit body is only a non-obvious why plus
  that closing line (or the no-issue note)** — never restate the CHANGELOG entry or the diff; when
  the subject says it all, it is just that line. **The PR body is that commit body plus the CHANGELOG
  version and the gate result** (the `test-cmd` verdict, and whether preflight ran), plus anything
  another rule requires there; the read-back below can add the version and gate lines with `gh pr
  edit --body-file`. The CHANGELOG stays the one place the change is described.
- **`--fill`'s title/body split depends on commit count — read the created PR back before trusting
  it.** On a single-commit branch, `--fill` takes the PR title from that commit's subject and the
  body from its message body — the `Closes #<issue>` line included, exactly as the bullet above
  assumes. With two or more commits — this ritual's most common shape, implementation + CHANGELOG +
  preflight-fix commits — `gh pr create --fill` instead titles the PR with the **raw branch name**
  and fills the body with **commit subjects only, bulleted**: no bodies reach it, so `Closes
  #<issue>` never lands in the PR body, and under `squash_merge_commit_title: COMMIT_OR_PR_TITLE`
  (§4) that branch-name title becomes the squash commit subject. `--fill-first` fails on a different
  axis: it takes title and body from the FIRST commit specifically (its documented contract,
  regardless of how many commits the branch has), so a first commit with no message body leaves the
  PR body empty. So don't bet the workflow on which `gh` flag or commit
  count you happen to have — **immediately after `gh pr create`, read the created PR's actual title
  and body back (`gh pr view <n> --json title,body`) and correct them with `gh pr edit <n> --title
  … --body-file …` before doing anything else.** This is an instruction, not a nice-to-have: run it
  on every PR this ritual opens, single-commit or not.
- **Multi-paragraph `gh` bodies go in a temp file — never inline `--body "…"`.** `--fill` (above)
  takes the PR body from the commit and is fine for that; but any time you pass an explicit body to
  `gh pr create` / `gh issue create` / `gh issue comment` / `gh pr comment`, write it to a temp file
  and use `--body-file <file>`. Inline `--body` quotes badly and breaks differently across shells
  (PowerShell vs POSIX).

## 4. Merge and clean up

- **Grep the PR body BEFORE you arm — the merge can land in seconds, and there is no undo.** One
  command, right before `gh pr merge`:
  ```sh
  gh pr view <n> --json body --jq '.body' | tr '\n' ' ' |
    grep -oiE '\b(clos(e|es|ed)|fix(|es|ed)|resolv(e|es|ed))[[:space:]:(]*([-[:alnum:]._/]*#[0-9]+|gh-[0-9]+|https?://[^[:space:]]+/issues/[0-9]+)'
  ```
  Read every hit: each one **will** close that issue, and each one should be an issue you intend to
  close. This is a **bounded check, not a wait** — it does not contradict *Do not watch a background
  agent* (§1); you run one command and move on.
  **Every piece of that pattern is load-bearing — never simplify it; before changing or tightening
  it, read `closing-keyword-grep.md` in this skill's directory and re-run its full fixture list.**
  **Why before rather than after:** the post-merge verify in *After the merge lands* is a **backstop
  for a close that did not happen**, and it cannot undo a close that should not have. A PR that skips
  build+test on a `paths-filter` can merge in **~30 seconds** — no time to correct a body. **A draft
  PR already covers the reviewed path** (fire-and-forget cannot squash a draft), so this guards the
  PR with no review: a trivial docs-only PR opened non-draft and armed immediately.
  **Do NOT use `closingIssuesReferences` for this.** It populates **asynchronously** and reads empty for
  up to a minute after `gh pr create` even when the body plainly carries `Closes #N` — and the close
  actually fires off the squash commit message, a different signal. The body grep is synchronous and
  authoritative.
- **Arm auto-merge (squash), fire-and-forget — then read the armed state back:** `gh pr merge <n>
  --squash --auto` → `gh pr view <n> --json autoMergeRequest`; `null` ⇒ the arm did not take (a
  consumer-side workflow can silently override or absorb it) → arm again explicitly or fall back to
  a plain squash merge once CI is green. An already-`MERGED` state read is also a
  valid answer — an armed PR whose checks were green can land within seconds.
  **"Green" means a completed, non-skipped, successful run on the head SHA, whatever the check
  summary shows** — a skipped job reads as passing — **and a cancelled run is never green:
  re-run it.**
  **An armed PR is not stuck just because it has not merged yet.** GitHub fires the merge
  server-side after the last required check goes green — normally within seconds, but it can
  take up to ~2 minutes. **Do not hand-merge an ARMED PR until at least 3
  minutes after its last required check went green**, and then only if `gh pr view <n> --json
  state,mergeStateStatus,autoMergeRequest` still reads `OPEN`, `CLEAN` and a non-null
  `autoMergeRequest`. Repeated multi-minute stalls on one repo are a GitHub Support case, not a
  settings change.
  The readback is a bounded check, not a watch: one command, then **do not watch it** — *Do not
  watch a background agent* (§1) applied here. Check `gh pr view <n> --json state` at the top of the
  next turn that needs it — and **if arming is the last act of your turn with nothing else queued,
  no such turn is coming**: before ending it, start the one bounded wait `agent-liveness`
  distinguishes from watching, whose exit is the **trigger** for *After the merge lands* (POSIX
  `sh`; size both placeholders to your CI, with `<max-polls>` × `<poll-seconds>` covering at least
  the CI run plus that ~2-minute window):
  ```sh
  i=0; until gh pr view <n> --json state --jq .state | grep -qxE 'MERGED|CLOSED' ||
    [ "$i" -ge <max-polls> ]; do i=$((i+1)); sleep <poll-seconds>; done
  ```
  It only wakes you — that section's step 1 still opens on your own `MERGED` read.
  **NEVER arm `--auto` on a PR whose preflight has not reported.** This is the one failure the
  background default carries: arming a non-draft PR before findings land lets fire-and-forget squash
  the item while the review is still running, and a squashed merge is not recoverable by fixing the
  branch. Stated here as well as in the *backgrounded review obliges a DRAFT PR* bullet next
  (deliberate: **this** is the gate).
  **The pending window is not a deletion window, for either ref** — until the PR reports `MERGED`
  it is still OPEN, so leave both the remote head branch and the local branch alone; *After the
  merge lands* step 6's observed-`MERGED` gate already applies.
- **A backgrounded review obliges a DRAFT PR — this is the standing pairing, not an escape hatch.**
  Under the background default (§1) preflight is still running when you open the PR, so: open it as
  a **draft** (`gh pr create --draft`), let the review report, then mark it ready
  (`gh pr ready <n>`) and only then arm auto-merge. **A background preflight is race-free because
  the PR is a draft — not because the review finished first:** a draft is structurally
  non-mergeable. The same applies to any other review that lands after `gh pr create`: a
  backgrounded *Adversarial coverage pass* (§1), or a substituted `general-purpose` review where
  `preflight-reviewer` isn't dispatchable on the client.
- **When preflight comes back with findings on an already-open draft:** fix them → commit again on the
  same branch (the squash merge makes extra commits free). **When the fix edits prose** — a CHANGELOG
  entry, a doc claim, an issue body — **rather than code, re-verify the corrected text against the
  tree before pushing, not just re-read it**: a correction is written under the same conditions that
  produced the error. **Exercise the claim**, don't re-read it — re-measure a count, re-run a quoted
  command, exercise a tool-behaviour claim against a case that would fail if it were false (code
  gets this from the build and the suite; prose has no such gate). This is the committer's own
  bounded check before push, not a second review or a re-spawn. Then re-read the PR title and body
  against the branch's **final** state and edit them (`gh pr edit <n> --title … --body-file …`) if
  either has gone stale, and only then `gh pr ready` and arm auto-merge. Do not close and reopen the
  PR, and do not mark it ready intending to fix afterwards — a ready PR with auto-merge armed can
  land between those two acts. **Why this matters most here:** under
  `squash_merge_commit_title: COMMIT_OR_PR_TITLE`, a single-commit branch takes its commit's subject
  as the squash title, but a corrected branch — two or more commits — takes it from the PR title
  written before the findings existed. **This is not the only
  exposure — see §3's `--fill` read-back:** that catches a title born wrong at `gh pr create` time;
  this re-read catches one gone stale after the findings commit. Run both, not either.
  **Read the setting, don't assume it:** `gh api repos/{owner}/{repo} --jq .squash_merge_commit_title`
  — a consumer may run `PR_TITLE` instead, which changes the exposure; don't assert any particular
  repo's value. Check the body too — `--fill` seeds it from the commit message (§3), so a stale body
  is where a wrong closing keyword would persist; either way, the closing keyword must still reach
  the PR body.
- **Auto-merge has prerequisites — know the fallback.** `--auto` only works if the repo has
  **auto-merge enabled** (`gh api repos/{owner}/{repo} -X PATCH -f allow_auto_merge=true` — a one-time
  repo setting); without it, `gh pr merge --auto` errors ("Auto merge is not allowed for this
  repository") — and a **just-created repo always starts there** (`gh repo create` defaults
  `allow_auto_merge: false`), so expect exactly this on a new repo's first armed PR. Separately, a self-merge classifier in the
  harness may refuse to arm auto-merge on an unprotected branch. **Fallback:** don't fight either —
  once CI is green, do a plain squash merge (`gh pr merge <n> --squash`). This is for when
  **nothing is armed**; an armed PR follows the 3-minute rule in the arm bullet above. Enabling
  auto-merge and any branch-protection posture is a per-repo choice the `adopt-conventions`
  onboarding *offers* to set up; this ritual works either way.
- **If the repo requires approvals** (Project Facts `pr-approvals: N`, or branch protection enforces
  reviews), `--auto` is still the right call — it **waits** for the required approvals, then merges,
  rather than erroring. Don't block on it: request the review → hand the PR off → check `gh pr view
  <n> --json state,reviewDecision` at the top of a later turn (*Do not watch a background agent*, §1,
  again — an approval wait is a wait, not something to watch). This is the two-person-team shape; a
  solo repo (`pr-approvals: none`, the default) never hits the wait and merges as soon as CI is green.
- **While waiting, use the time — but NOT in the working tree if a non-isolated agent is live in it.**
  This bullet is licence to do *other work*, never licence to move `HEAD`; §1's *While a non-isolated
  agent is live* rule holds for the whole time an agent is running, and this is exactly the window in
  which it is easiest to forget. When one is live, keep the wait to **GitHub-only or read-only** work —
  triage, issue comments, reading code. When none is, the tree is yours.
  Good uses either way: shape a pending idea into a spec via `fluyt:product-owner`, or prep the
  next item's questions. (The PO relays its spec in its report and writes only research/design reports
  under `docs/`, so it can't collide with the in-flight PR.) Pass the PO the open-issue snapshot
  in its spawn prompt — it has no `gh` and shapes blind without it.
- **After the merge lands:**
  1. **Verify the issue closed** (`gh issue view <n> --json state`). If it's still open ~1 min later
     — which is expected when `integration-branch != default-branch`, and possible even when they
     match — **close it manually:** `gh issue close <n> --comment "merged in #<pr>"`. **"After the
     merge lands" means after YOU read `MERGED` off `gh pr view <n> --json state`** — the same
     observed-state gate the branch deletion in step 6 already applies. A watcher's or the post-arm
     wait's clean exit, a timeout, or a green CI run is not that observation, and a manual close
     issued on one of those closes an unmerged item.
  2. **Unblock the dependents.** The `backlog` selection order skips a `blocked` issue
     unconditionally, and that same skill has you add the label alongside the native blocked-by
     relation — so a blocker closing leaves its dependents carrying a label nothing removes, and
     **permanently unpickable**. Clear it here, on the same bounded-walk terms the
     contradicted-sibling write-back below states: the walk is
     `gh issue list --state open --label blocked` — bounded to the label, **never a full-backlog
     sweep**. For each hit, read its blockers off the relation with
     `gh issue view <m> --json blockedBy,url`: each node carries that blocker's `number`, `state`
     and `url`, so three counts decide it —
     `--jq '.blockedBy.nodes | length'` (total),
     `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'` (still open) and
     `--jq '.url as $u | ($u | sub("[0-9]+$"; "")) as $r |
     [.blockedBy.nodes[] | select(.url | startswith($r) | not)] | length'`
     (foreign — a blocker in another repo; the node has no repository field, only its `url`).
     **Remove the label only when the relation list is NON-EMPTY and every blocker is closed**
     (`total > 0` and `open == 0`) —
     `gh issue edit <m> --remove-label blocked` — since an item with two blockers, one of them
     still open, must stay skipped. **A foreign blocker closing means the fix merged upstream, not
     that your pin carries it:** it counts as satisfied only when `foreign < total` (a same-repo
     blocker — the pin-bump issue — is also on the list and closed); otherwise surface "#<m>'s
     blocker <repo>#<n> closed upstream — record the pin-bump issue as a relation, or clear the
     label once your pin carries it" and move on. The total-count half is load-bearing and
     invisible in the jq: an issue with **zero** relations produces an empty list whose open-count
     is 0, which passes an all-closed test **vacuously** — and label-without-relations is a real
     state (an item blocked on external evidence, a decision, an upstream release), so without the
     gate this step silently frees exactly the items whose blocker cannot close. On
     `total == 0`, don't silently hold either — that is the permanently-unpickable disease this
     step exists to cure, relocated — **surface it**: report "#<m> carries `blocked` with no
     blocked-by relations — record the blocker as a relation, or clear the label by hand", and
     move on. (Doctrinally a non-issue block belongs in `not-ready-labels`, not bare `blocked` —
     see the `backlog` skill — but this step must stay correct for the state as found, not the
     state as prescribed.) **Leave the native relation alone:** it is the record of why the item
     was ever blocked, and only the label is the operational signal — a relation still reading
     "blocked by (closed)" is correct history, not staleness.
  3. **If the item was a slice of a `tracking` epic, tick its box now that the issue is
     closed** — fetch the epic body (`gh issue view <epic> --json body`) → flip its `- [ ] #<n>`
     line to `- [x] #<n>` → write it back (`gh issue edit <epic> --body-file <file>`). This
     is roadmap upkeep, not a tracker edit — see the `backlog` skill.
  4. **When this item's landed decision contradicts a sibling issue's stated approach, write it
     back — don't leave the rot for that sibling's own next pick to re-derive.** That sibling's
     prescription rotted the instant this decision landed, and §0.1's pick-time re-validation
     catches it only when the sibling is next picked. This step does not replace that inbound
     backstop, and the two must not drift — one fires at pick time on the issue being *read*, this
     one at merge time on the issue being *written back to*. **Bound the walk to the relation graph
     already on record — never a full-backlog sweep:** (a) if this item was a slice of a `tracking`
     epic, its sibling boxes (step 3, above); (b) any issue this item's `Lineage:` / `Depends on:`
     records name, wherever they were written — the issue body, a triage comment, a decision
     comment (the `backlog` skill's lineage relations). For each sibling this item's decision actually contradicts,
     `gh issue comment <sibling> --body-file <file>` naming the landed decision and what it
     contradicts — the returned comment URL is the record, per §2's artifact-citation rule, not
     the act of commenting. **No epic and no lineage records ⇒ nothing to walk, and the step is a
     no-op** — say so rather than falling back to a scan; the moment this step starts searching
     for siblings on its own, it has stopped being bounded.
  5. **Capture any friction before moving on — before checkout/pull/delete-branch/pick-next
     below, not after.** If this item snagged — a CI catch that passed the local gate, rework, a
     denied or blocked command, a transient platform error, or something instructive in a
     delegate's **report** that you never acted on — append a one-line note (what snagged + where)
     to `docs/process/retro-log.local.md` so the next retrospective has real evidence. **The
     report half matters because a report is read once and leaves the context**: anything
     instructive in it that is neither implemented nor written down here is gone by the next item.
     The file holds friction notes only (the `SubagentStop` hook's dispatch cadence goes to
     `docs/process/dispatch.local.md`). Create the file and its `docs/process/` directory first if
     absent (`mkdir -p docs/process`) — nothing else creates it. It's git-ignored; it costs nothing.
  6. `git checkout <integration-branch> && git pull`, then **delete the branch only once
     `gh pr view <n> --json state` returns `MERGED`** — the observed state, read now, not "after the
     merge step" and not "once CI was green"; that check **gates** the deletion. Fire-and-forget auto-merge (above) opens a window where the PR is
     armed but still open, and **deleting the head branch of an open PR closes that PR unmerged** —
     the issue stays open and the version never lands. This applies to the local *and* remote ref.
     **Read `MERGED` in one tool call and delete in the next:** a `PreToolUse` guard (the shipped
     open-PR branch-delete guard among them) judges the WHOLE command before any of it runs, so a
     combined wait-then-delete call is refused while the PR is still open.
     Recovery, since the commit outlives the ref: `git cat-file -t <sha>` to confirm the object
     survives → re-create the branch at that SHA → push → `gh pr reopen <n>` — the closing keyword
     in the PR body survives intact. For a solo isolated item (`worktree-isolation: default`, one
     spawn), the lane branch the developer committed on is a *different* branch from the PR head
     above — `parallel-work.md` step 5's cherry-pick lands its commits onto a fresh branch that becomes
     the PR head — so delete that lane branch too, at this same observed-`MERGED` gate. Then pick
     the next item.
- **One PR at a time** while you are the sole agent — wait for the merge before branching again.
  That wait is *technical serialization* (so a new branch doesn't fork off pre-merge code and
  collide), **not** a prompt to check in with the user. The merge lands and the issue is verified
  closed → continue to the next authorized item — see *Continue autonomously across a scope* below.
  *Implementation* can still run ahead in parallel across file-disjoint items (see *Parallel work*);
  only the integration serializes here.
- **Context hygiene between *unrelated* items.** Draining a scope accrues context. At a boundary
  between **unrelated** items (a different subsystem, a fresh scope), consider a manual `/compact` to
  keep the working context lean — but **not** after every item, and **never mid-scope** while a run is
  carrying context across a few *related* items (compaction is lossy summarization). It's a human
  habit, not an automatable step: the client's threshold auto-compaction (on by default) is the safety
  net, and no hook can invoke `/compact` for you — so time it yourself at the natural seams. That
  safety net covers CONTENT only: on a repo with a `handover` location configured (Project Facts
  `handover`), a foreseeable reset deserves a written hand-over FIRST — route to the `handover` skill
  by name, since compaction alone silently drops exactly the orchestration state that skill exists to
  keep.

## Known failure modes this ritual prevents

Read `known-failure-modes.md` in this skill's directory for the failure modes behind this ritual's
guards: rationale only, no step executes it.

## Continue autonomously across a scope

The pauses that stall a backlog drain are almost always the agent's **own unnecessary
re-confirmation between items** — "I finished #12, may I start #13?" — not a genuine decision.
Default to continuing. The friction to remove is *your own per-item check-in*; it is **never** a gate
another skill or the consumer's `CLAUDE.md` owns (those stay, even when they read like an
"are-you-sure").

- **A scope authorization spans every item in it, and never widens.** When the user grants a scope —
  "work the backlog", "ship the `<must>` tier", "do these five" — that one grant covers each item in
  it: pick the next by the `backlog` selection order and proceed, without re-asking "may I start the
  next one?". But the grant is a ceiling, not a launchpad — draining `<must>` does **not** roll into
  `<should>`, and "these five" does **not** expand into the whole backlog. Finishing the granted set
  is a checkpoint: report back and let the user set the next scope. **"Keep going" is not a new,
  wider scope** — it resumes the scope already in flight and stops at that same edge; with no scope in
  flight, treat it as one more item, then checkpoint.
- **"Work / ship a scope" means land each item to the integration branch** — it does **not** include
  cutting a release. Promoting to the release branch is the `release` skill's own gated step; a drain
  never auto-promotes.
- **A grant is live only for the continuous stretch it opened.** Re-confirm before continuing across a
  context reset (a `/compact`), after an intervening user message that could have re-prioritised, or
  after a long idle gap — don't treat a stale "work the backlog" from hours ago as still-live. This is
  the successor's half; the predecessor's reciprocal obligation is not to trust that reconstruction —
  before a *foreseeable* reset (a threshold you can see coming, a long pause about to start, a session
  ending mid-drain), re-state the live grant and its edges in your final message, and route anything
  beyond a one-liner to the `handover` skill, which owns the full artifact.
- **Surface mid-scope only for a real decision** — and then surface the *decision*, not an
  are-you-sure, and carry a **recommended default** alongside it where one exists to recommend, so
  the human ratifies or overrides in a word instead of constructing an answer from scratch. Not
  every stop has one: a **missing required Project Fact** and a **destructive or irreversible
  operation** stop precisely because no default is the agent's to offer — there the bare stop,
  stated plainly with what it needs from the human, IS the correct form; never invent a default to
  satisfy this clause. The recommendation changes the stop's
  ergonomics, never its force: it never substitutes for the human's answer, and **silence is not
  ratification** — the stop still stops, and waits. These stops all live in rules defined elsewhere;
  honour them verbatim rather than waving them through as "friction":
  - an **outward-facing publish** with its own gate — the `release` skill confirms a release cut;
    `report-upstream` confirms before filing;
  - a **missing required Project Fact** — STOP and ask; never guess a command or a branch name;
  - a **design or tuned decision that is not *sourced*** — the `developer`, `product-owner`,
    and `tech-debt-reviewer` agents all require the user's sign-off for these; don't decide them
    yourself just because the scope is granted. **"Specified" is not the test — sourced is**, because
    you can satisfy "specified" by specifying it yourself, which is the whole hole: a value you write
    into a delegate's spec reads as decided to every role downstream, and the gate that should have
    stopped you never fires. A value is sourced only when a record meets **all three** tests: it is
    **written** (a remembered sign-off is unfalsifiable afterwards, which is the hole again); it
    states **the value actually used**; and it records **the human's** decision, not one you authored
    — writing the entry yourself and then citing it is self-sourcing, and closes nothing. The
    qualifying records are the issue body, an issue comment, the decisions file, and a written
    in-session sign-off — each carrying authority **only for the value it literally states**, so an
    issue body proposing one value does not source a different one you intend, and a hub-relayed
    answer is the human's decision only when the `hub` skill's *The authority boundary* holds for
    this session and you write it down verbatim, naming it the user's choice relayed by the hub,
    before citing it. A standing instruction the user writes in this session's own chat, granting
    settlement of a class of in-grant fork as `hub`'s *When the user steps away* bounds it, is a
    written human source for **that class only**, each fork on its Recommended option, written down
    as it is settled — it is not silence, and it sources nothing outside the class;
  - **any destructive or irreversible operation on data or history** — a deletion, a data
    migration, a schema/format rewrite, a force-push, a mass regeneration — surface it by name before
    doing it, even when the issue "already decided" the feature;
  - the consumer's **own "Ask the human when" list** — whatever it enumerates, authoritative and not
    to be narrowed;
  - a **failure or block you cannot resolve** — a red gate you can't fix, a denied or blocked command.

  This list points at the real rules rather than replacing them: when none of them applies, the
  granted scope is your mandate — drain it.

## Parallel work (several file-disjoint items at once)

Read `parallel-work.md` in this skill's directory before implementing two or more items
concurrently: the full recipe, step by step, lives there.

## Model selection for sub-agents

**This section is the CANONICAL home for spawn model-tier policy, on every client** — a client adapter
(Codex's `dispatch-role`) projects these tiers onto its own model selectors and cites this section
rather than standing as a second home for the policy itself.

Match the model to the **weight of the sub-task**, not to a blanket heavy default — a spawn that only
greps and locates code shouldn't run the same model as one doing deep design analysis.

- **The team agents carry a default `model:` in their frontmatter**, so most spawns are already
  right: **`sonnet`** for make-and-verify (`developer`, `test-writer`, `preflight-reviewer`),
  **`opus`** for deep analysis / design / review judgment (`product-owner`, `scrum-master`,
  `tech-debt-reviewer`). The orchestrator keeps its own session model — this governs what it
  *spawns*.
- **A frontmatter default is a floor, not a ceiling — override per spawn for an off-norm instance.**
  Pass the Agent tool's `model` option (or `agent(…, {model})` in a Workflow) when one spawn is heavier
  or lighter than the agent's norm: escalate a `developer` handed a genuinely intricate algorithm to
  `opus`; a trivial one is already fine on `sonnet`. Override at the call site — don't edit the shared
  frontmatter for a one-off.
- **Per-issue routing labels (only when Project Facts `agent-routing: labels`).** When the project
  records routing on the issue, read its `model:<tier>` label (e.g. `model:opus`) and spawn the
  implementer at that tier — it **overrides** the frontmatter default above; no `model:*` label ⇒ the
  default stands. This is the recorded, reviewable form of the per-spawn override, not a new mechanism.
  The companion `agent:<type>` label is **advisory only** — a routing/filter marker, not a dispatcher;
  you still decide which agent implements (a `developer` for product code, `test-writer` for tests, per
  the ritual). Absent the key (`agent-routing: none`, the default) → ignore both families.
- **Ad-hoc search / recon spawns take a fast tier explicitly.** An `Explore` or `general-purpose` agent
  spawned just to grep-and-locate, map naming conventions, or read a few files is **not** a team agent
  and carries no default — pass `haiku` (or `sonnet` for a broad sweep). Searching code is never a
  heavy-model task; spending `opus`/`fable` on a locate-and-read pass is waste.
- **Heavy tier: `opus` is the portable default; `fable` is the upgrade where a project provisions it.**
  These defaults name `opus` because every consumer has it. A project with Fable access can send its
  heaviest analysis/design spawns to `fable` — the tier built for complex reasoning — with the same
  per-spawn `model` override.

## Portability & sandbox notes

Read `portability.md` in this skill's directory when the environment bites: Windows / PowerShell
shell traps, a sandbox refusing the gate, CI and local runs disagreeing.
