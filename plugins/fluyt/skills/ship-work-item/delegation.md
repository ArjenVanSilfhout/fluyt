# §1 delegation, spawn briefs and the shared checkout

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

## Delegating and briefing

- **Delegate the implementation - you orchestrate.** Project Facts `delegation` decides *who*
  implements, and delegation is the default: **an absent key counts as `default`**, so unless the
  consumer opted out you spawn the `fluyt:developer` agent to write the code while you do the recon,
  write the spec, and keep **branch, CHANGELOG, version, PR, and merge** - those stay with the
  orchestrator on every path through this skill, not only in *Parallel work* (which reserves the
  same shared files for the same reason). The commit is yours too, except in an isolated lane: a
  worktree `developer` commits its own branch (*Delegation and worktree isolation*), and a
  `test-writer` pinned to that worktree commits only its `test-dir` files (*Parallel work*). Hand
  the slice only to a role that can run the gate: `developer` and `test-writer` carry Bash and can
  run `build-cmd` / `test-cmd`; `product-owner`, `scrum-master`, and `tech-debt-reviewer` cannot, so
  an implementation slice never goes to them. And **read what comes back** - the returned diff is
  what keeps your §2 version call, the §3 commit-guard, and your preflight adjudication accurate;
  delegating the typing never delegates that judgment. **Challenge what comes back against the spec
  AND the idea behind it**, and keep challenging until it meets both: the letter of an acceptance
  list is satisfiable by work that misses the point it was written for, and a slice that ticks every
  box while defeating the reason the box exists is not done. Patching it yourself destroys the
  signal that your brief was at fault, and puts you back in the implementer seat.
  When what comes back needs a correction or challenge **on the slice it just did**, resume the
  delegate rather than re-briefing a fresh spawn - the `agent-liveness` skill's *When it returned -
  resume rather than re-dispatch* section owns the rule and its bounds, including the fallback when
  the client cannot resume. To run **several file-disjoint items concurrently**, read
  `parallel-work.md` in this skill's directory and follow it.
- **Opting out, and the one inline exception that survives the default.** Delegation is the default
  because **the human has to be able to reach the orchestrator mid-turn**: one that is itself
  editing cannot be steered until it finishes - a concern distinct from co-edit collision safety
  (`worktree-isolation`'s job, below); `agent-liveness`, *Dispatch detached, and never watch*, owns
  the reachability rule. On
  `delegation: on-demand` you implement in the shared checkout and spawn the `developer` only for
  genuine parallelism or a large self-contained chunk. Even on `default`, **a change too small to be
  worth a dispatch may go inline** - the test is concrete. All three must
  hold: **(a) one file**; **(b) no new logic, no more than a handful of changed lines** - a typo, a
  wording fix, a denylist token, a literal value, a single guard; **(c) no new or updated test
  needed.** Any of the three fails → dispatch. When you cannot tell, dispatch: a needless dispatch
  costs one turn, a needless inline sprawl costs the whole reason the default exists.
- **A delegate's report is a secondary source about its own work - verify its load-bearing claims
  against the tree before you act on them.** The diff is a primary output; the report's *claims*
  about it - a measured figure, a green test count, "every site is updated", an assertion about a
  file the diff never touches - come from the one party that is not a neutral witness. Before any of
  them carries weight in your version call, your CHANGELOG entry, or the next brief, re-derive it
  from the primary output: re-run the deterministic probe yourself, read the diff, grep for the
  residue the report calls zero.
- **Delegation is not deference: a reviewer's report gets exactly the same treatment.** Verification
  is delegated too - preflight runs as a subagent, and an adversarial pass often does - so its
  verdict reaches you as a report like any other, and the rule above applies unchanged to a PASS as
  well as to a fix list. Spot-check it: re-verify one finding against the tree, and confirm a rule
  the report cites says what the report says it says.
- **A pre-ruled version class travels with the spawn brief.** When the picked issue pre-rules the
  version class, the spawn brief restates that ruling and names the behaviour axis it rests on -
  cite the `versioning-and-changelog` skill for the axis rather than restate its test. The delegate
  does not silently re-classify: a disagreement goes in its report-back as a note for you to
  adjudicate, never into a changed class - the failure mode this guards against is a delegate
  reading a shipped-skill instruction addition as wording-only PATCH. No ruling on the issue ⇒
  nothing changes: the normal class selection at CHANGELOG time (§2) applies.
- **A specific factual claim copied from the issue into the spec you write, or into any text you
  ship in a component, needs the same verification the `versioning-and-changelog` skill's
  primary-source rule already requires before a CHANGELOG entry - done here instead, because the
  claim is already an instruction, or a shipped fact, by the time it reaches either.** Don't count
  on the delegate to catch it: an obedient delegate won't question a brief, so verify where you
  transcribe the claim, not downstream. A claim that cannot be exercised - no doc, no command, no
  reproducible check - is declined or attributed as unverified, never shipped as fact.
- **A fact that lives in a record is PASTED from a fresh read of that record, never recalled** -
  the paste-the-SHA rule (worktree hygiene, `worktree.md`), generalised to prose. When a spawn brief, a
  CHANGELOG entry, or issue text states a value, a polarity, or an attribution that a record holds -
  an issue body, a spec, a decisions entry, the CHANGELOG - open the record and transcribe from it
  in the same breath; recalled values drift. This is the crossing BEFORE the
  transcribed-claim bullet above, which verifies a copied claim's truth.
- **Shipped text needing a sibling component's specifics cites the component, not its content.**
  When a skill, agent, or doc needs another component's steps, contract, or values - another skill's
  procedure, an agent's contract, a doc's tuned values - name/route to that component and state only
  what THIS text needs from it; restating the sibling's specifics is invisible drift-debt the moment
  the sibling changes and this file doesn't. The tell: text that goes stale when the sibling
  changes restates it; text that still reads true cites it.
- **Every role spawn's brief carries the resolved plugin skills path** - `$CLAUDE_PLUGIN_ROOT` when
  set, else your client's resolved install-cache path - or the sections that role needs pasted in
  directly: in a consumer repo the plugin lives in the install cache, not the working tree, and no
  subagent has a Skill tool. Same family, same rule: hand it the **complete** record, never a
  silently condensed one - a snapshot, a comment thread, a prior report. A condensed record produces
  phantom findings: a delegate analyzing an abridged record reports defects in what the abridgement
  dropped, not in the work. Where condensing is unavoidable, say so in the brief and name what you
  dropped, so the delegate can weight its conclusions accordingly. A read-only role (no `gh`, no
  Bash) gets its records saved to files - **write the file before the dispatch call returns**: a
  write racing the agent's first read leaves the agent reading an absent record as an empty one and
  reporting confidently on nothing.

## *Dispatch in the background*

- **Dispatch in the BACKGROUND - that is the default, and it includes preflight.** Spawn a subagent
  detached rather than blocking on it: a blocking spawn holds you unreachable for its whole run.
  **A backgrounded preflight obliges a draft PR** (§4).
  The full rule - the trade it makes, and what to do on a client that cannot dispatch detached -
  lives in the `agent-liveness` skill, which owns this concern.

## *Do not watch a background agent*

- **Do not WATCH a background agent, workflow, or process - collect its result when it reports.**
  Check a background result when something specific needs it - the next turn that consumes it, or a
  silence out of proportion to the slice - never on a timer. §4's auto-merge and approval-wait
  bullets are applications of it. The full rule, including the *watching* vs *waiting* distinction
  it turns on, lives in the `agent-liveness` skill, which owns this concern.

## *Delegation and worktree isolation*: the four combinations

- **`delegation` and `worktree-isolation` are orthogonal - never read one as the other.**
  `delegation` answers *who implements*; `worktree-isolation` answers *in which working copy* - set
  that one to `default` when the maintainer may co-edit the same working copy you commit into, so a
  `git checkout` under your feet can't land a commit on the wrong branch. The worktree key is
  deliberately not the who-implements switch. The §3 commit-guard is the always-on floor in all four
  combinations, and all four are supported:
  - **`delegation: default` + `worktree-isolation: on-demand`** (both defaults) - spawn the
    `developer` **non-isolated**: it implements in the shared checkout, you commit. The common path -
    and the one that puts **two actors in one working copy**, so see *While a non-isolated agent
    is live* below before you touch git.
  - **`delegation: default` + `worktree-isolation: default`** - spawn the `developer` with
    `isolation: worktree`; it implements and commits on its worktree branch and you integrate from
    there: read steps 5–6 of `parallel-work.md` in this skill's directory, the integration and
    cleanup mechanics, and apply them to the single item.
  - **`delegation: on-demand` + `worktree-isolation: on-demand`** - you implement in the shared
    checkout yourself; no spawn, and the commit-guard is your only protection.
  - **`delegation: on-demand` + `worktree-isolation: default`** - the two pull opposite ways and
    **isolation wins for product-code items**: co-edit safety is structural, an implementer
    preference is not. Product code still goes to a `developer` with `isolation: worktree`;
    `on-demand` then means only that you keep the non-product edits (CHANGELOG, docs, config) in the
    shared checkout - which you were doing anyway.

## *While a non-isolated agent is live*

- **While a non-isolated agent is live, `HEAD` is FROZEN and you stage only paths it cannot touch.**
  Addressed to **you, the orchestrator, as the mover**; the §3 commit-guard protects the
  **committer**.
  - **Freeze `HEAD`.** No `checkout`, `switch`, `reset`, or `stash` from the moment you spawn a
    non-isolated agent until it has reported. Moving `HEAD` under a live agent ⇒ its next commit
    lands on whatever branch you just switched to.
  - **A mid-flight commit is allowed only on paths the agent cannot touch** - and you must *check*
    that, not assume it. The standing safe case is the **`changelog`**, which §1 and *Parallel work*
    both reserve to the orchestrator; a `test-writer` confined to `test-dir` is another. Compare the
    path sets before you stage. "It was fine last time" is not the test.
  - **Recon is not exempt.** Reading files is safe; `git checkout` to *look at* another branch is
    not. Use `git show <ref>:<path>`, `git log`, or a second working copy - none of them move
    `HEAD`.
  - **The time background dispatch frees is not working-tree time** - **take it on GitHub-only or
    read-only work**, as §4's *While waiting, use the time* spells out.
  - **A `test-writer` or reviewer pointed at ANOTHER working copy is exempt** - the test is *which
    working copy it touches*, not how it was spawned (*Parallel work* step 3's "non-isolated"
    `test-writer` is pinned to a worktree, which keeps its own `HEAD`). Read "non-isolated" here as
    **shares your working copy**.
  - **`worktree-isolation: default` closes this class structurally**: the agent gets its own working
    copy, so there is no shared `HEAD` to move. Reasoning about path disjointness often ⇒ the
    signal to flip the key rather than keep applying this rule by hand.
