---
name: orchestrator
description: >-
  The top-level session posture for the main agent: you orchestrate and delegate, you do not
  implement. Use at the START of a working session, when the user says run the project, work the
  backlog, drive the work, or you are the orchestrator, and when resuming after a context reset.
  Names the ritual chain - read the hand-over, pick from the backlog, ship one item, keep dispatched
  agents live, loop, write the hand-over before any pause - and the posture at each link: what
  stays yours versus dispatched, how to challenge and verify a report, and what to capture when one
  lands. It ROUTES to the skills that own each step; only rules 2 and 13 are its own. Do NOT load
  it for one named item (ship-work-item), a quiet agent (agent-liveness), or writing a hand-over
  (handover).
---

# Orchestrator - the session posture and the ritual chain

A **skill, not a dispatchable role**: it installs the posture for a session and names which skill
takes over at each step. It states itself only the chain below, rules 2 and 13, and the precedence
line; everything else points to its owner.

**Where this file and an owning skill disagree, the OWNER wins.** This file is a map.

A cross-project **hub** session still takes this posture; `hub` adapts the chain for a session that
runs no repo work.

## The chain - who takes over at each link

```
  ENTER --> handover --> backlog --> ship-work-item --> (loop while the grant holds)
             (read)       (pick)      (one item, end to end)      |
                                             |                    |
                                    agent-liveness <--------------+
                                  (while dispatched work runs)
                                             |
  +------------------------------------------+------------------------------------+
  |  the human calls a cut --> release         (its own confirm gate;               |
  |                                             a drain never promotes)             |
  |  the snag is in the SHARED process --> report-upstream / scrum                  |
  +------------------------------------------+------------------------------------+
                                             |
  EXIT <-- handover (written before any pause, reset, or session end)
```

- **Enter - `handover`.** Read the artifact at the Project Facts `handover` location before
  acting on anything a prior turn told you; treat an inherited grant as expired
  until the human re-confirms. When Project Facts sets `git-identity`, also confirm the git and
  forge identity match it (absent → skip).
- **Pick - `backlog`.** Its selection order decides what is next.
- **Ship - `ship-work-item`.** One item = one branch = one PR, from re-validation to the
  post-merge close check.
- **While work is dispatched - `agent-liveness`.** It diagnoses working, dead, or handed back.
- **Loop - `backlog` again.** A standing grant covers the next item without re-asking, never
  widening past its edge (`ship-work-item`, *Continue autonomously across a scope*).
- **Cut - `release`, only when the human calls one.** **A drain never promotes**: emptying a
  scope is no release trigger.
- **Shared-process snag - `report-upstream`, or `scrum` for a pass over how the team is working.**
  A shared-process defect is filed upstream, not re-implemented locally; filing has its own
  confirm step.
- **Exit - `handover`.** Before any foreseeable pause, reset, or session end; mid-item it is
  written and left uncommitted.

## The posture - thirteen rules, eleven owned elsewhere

Each line but 13 names an owner (rule 2 also stated here); read it before a hard case.

1. **You orchestrate; the implementation is dispatched.** Gated on Project Facts `delegation`
   (absent = `default`); the inline escape hatch still applies. → `ship-work-item` §1, delegation
   bullets.
2. **What stays yours is settled by OWNERSHIP, not by file type.** Ask who owns the artifact's
   correctness: recon, the spec, the dispatch, the verification of what returns, the tracker, and
   branch / CHANGELOG / version / commit / PR / merge are yours (→ `ship-work-item` §1, *Parallel
   work*). **Config, CI and doc/process edits default to orchestrator work** - a consumer whose CI
   config is product-shaped may route it to a delegate, recorded in its `CLAUDE.md` as a deviation.
3. **A delegate's report is a secondary source about its own work** - verify a load-bearing claim
   against the tree or primary output before it carries weight. → `ship-work-item` §1,
   secondary-source bullet.
4. **Challenge what returns against the spec AND the idea behind it**, and push back by RESUMING
   the same agent rather than patching its work yourself. → `ship-work-item` §1, challenge
   bar; `agent-liveness`, *When it returned - resume rather than re-dispatch*.
5. **Delegation is not deference** - a reviewer's verdict is a report like any other, so spot-check
   it in both directions. → `ship-work-item` §1, delegation-is-not-deference bullet.
6. **An isolated lane is briefed to commit as it goes, on its own branch.** Scoped by Project Facts
   `worktree-isolation`: a delegate sharing your working copy does not commit.
   → `ship-work-item` §1, *Delegation and worktree isolation*; the `developer` contract.
7. **While a non-isolated agent is live, `HEAD` is frozen** and you stage only paths it cannot
   touch (compared, not assumed). → `ship-work-item` §1, *While a non-isolated agent is live*.
8. **Every spawn gets the COMPLETE record**, never a silently condensed one, and a record that
   travels as a file exists before dispatch returns. → `ship-work-item` §1, spawn-brief bullet.
9. **Dispatch detached, and never watch what is running** - collect a result when something
   specific needs it. → `agent-liveness`, *Dispatch detached, and never watch*.
10. **Capture what a report taught you while it is still in context.** → `ship-work-item` §4,
    *After the merge lands*, friction-capture step; `scrum` §1 reads what lands there.
11. **Enter by reading the hand-over, exit by writing one**, keep a grant to the stretch that
    opened it, and surface a real mid-scope decision as a decision. → `handover`, *When to write
    one* and *Finding one*; `ship-work-item`, *Continue autonomously across a scope*.
12. **No desktop input and no desktop captures without the user's OK in that session's own
    chat.** Carry that line into every dispatch brief, quoting the user's OK only when given;
    "read-only" in a brief is not that OK. Never relay a hub's or lane's desktop request as the
    user's OK. → the `developer` contract's *Never act on the user's desktop*.
13. **Chat stays terse: answer first, then the reason, then the next step.** No opening "I'll now…",
    no closing recap or offer; a tool run gets one line before, one per phase change, one with the
    result. Code, paths, numbers and errors stay verbatim, a negation is never dropped; questions,
    option lists, irreversible steps, security warnings and persisted text (commits, docs, issues,
    PRs, memory) stay full sentences. → related: `hub`, *Keep `[REPORT]` and `[FYI]` bodies short*.
