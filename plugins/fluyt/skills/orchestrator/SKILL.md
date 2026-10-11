---
name: orchestrator
description: >-
  The top-level session posture for the main agent conducting the work: you orchestrate and
  delegate, you do not implement. Use at the START of a working session, when the user says run the
  project, work the backlog, drive the work, or you are the orchestrator, and when resuming after a
  context reset. Names the ritual chain — read the hand-over, pick from the backlog, ship one item,
  keep dispatched agents live, loop, write the hand-over before any pause — and the posture at each
  link: what stays yours versus what is dispatched (per Project Facts delegation), how to challenge
  and verify a report rather than trust it, and what to capture when one lands. It ROUTES to the
  skills that own each step and restates none but rule 13. Do NOT load it for one named item (that is
  ship-work-item), for a quiet agent (agent-liveness), or to write a hand-over (handover).
---

# Orchestrator — the session posture and the ritual chain

A **skill, not a dispatchable role**: it installs the posture you conduct a session in and names
which skill takes over at each step. It is deliberately thin — the chain below, rules 2 and 13,
and the precedence line are the only things it states in its own right; everything else is a
pointer to the component that owns it, with that owner's bounds, exceptions and reasoning left
where they live.

**Where this file and an owning skill disagree, the OWNER wins.** This file is a map, not the
territory — a drifted router is the defect, not the authority.

**One session coordinating several project sessions** (a cross-project hub) still takes this
posture; `hub` adapts the chain for a session that runs no repo work of its own.

## The chain — who takes over at each link

```
  ENTER ──▶ handover ──▶ backlog ──▶ ship-work-item ──▶ (loop while the grant holds)
             (read)       (pick)      (one item, end to end)      │
                                             │                    │
                                    agent-liveness ◀──────────────┘
                                  (while dispatched work runs)
                                             │
  ┌──────────────────────────────────────────┴──────────────────────────────┐
  │  the human calls a cut ──▶ release         (its own confirm gate;       │
  │                                             a drain never promotes)     │
  │  the snag is in the SHARED process ──▶ report-upstream / scrum          │
  └──────────────────────────────────────────┬──────────────────────────────┘
                                             │
  EXIT ◀── handover (written before any pause, reset, or session end)
```

- **Enter — `handover`.** Read the artifact at the Project Facts `handover` location before acting
  on anything a prior turn appears to have told you, and treat an inherited grant as expired until
  the human re-confirms it. When Project Facts sets `git-identity`, also confirm the git and forge
  identity match it (absent → skip).
- **Pick — `backlog`.** Its selection order decides what is next. This file names no tier scheme —
  the consumer's Project Facts does.
- **Ship — `ship-work-item`.** One item = one branch = one PR, from the pick's re-validation to the
  post-merge close check. None of that ritual is repeated here.
- **While work is dispatched — `agent-liveness`.** Whether a lane is working, dead, or already
  handed back is diagnosed there, not guessed at here.
- **Loop — `backlog` again.** A standing grant covers the next item without re-asking and never
  widens past its edge (`ship-work-item`, *Continue autonomously across a scope*).
- **Cut — `release`, only when the human calls one.** **A drain never promotes** — emptying a
  scope is not a release trigger.
- **Shared-process snag — `report-upstream`, or `scrum` for a pass over how the team is working.**
  A defect in the shared process is filed upstream rather than re-implemented locally; filing has
  its own confirmation step.
- **Exit — `handover`.** Before any foreseeable pause, reset, or session end; mid-item it is
  written and left uncommitted.

## The posture — thirteen rules, twelve owned elsewhere

Each line but 13 names its owner — read it before acting on a hard case.

1. **You orchestrate; the implementation is dispatched.** Gated on Project Facts `delegation` (absent
   = `default`); the inline escape hatch still applies, so this is never unconditional. →
   `ship-work-item` §1, the delegation and inline-exception bullets.
2. **What stays yours is settled by OWNERSHIP, not by file type.** Ask who owns the artifact's
   correctness, not what kind of file it is: recon, the spec, the dispatch, the verification of
   what returns, the tracker, and branch / CHANGELOG / version / commit / PR / merge are yours
   (→ `ship-work-item` §1 and *Parallel work*, which reserve the shared files for the same reason).
   **Config, CI and doc/process edits default to orchestrator work** — a consumer whose CI config
   is product-shaped may route it to a delegate instead, and records that in its own `CLAUDE.md`
   as a deliberate deviation.
3. **A delegate's report is a secondary source about its own work** — verify a load-bearing claim
   against the tree or the primary output before it carries weight anywhere.
   → `ship-work-item` §1, the secondary-source bullet.
4. **Challenge what returns against the spec AND the idea behind it**, and push back by RESUMING
   the same agent rather than patching its work yourself. → the challenge bar in `ship-work-item`
   §1; `agent-liveness`, *When it returned — resume rather than re-dispatch*, for resuming vs. a
   fresh spawn.
5. **Delegation is not deference** — a reviewer's verdict is a report like any other, so spot-check
   it in both directions. → `ship-work-item` §1, the delegation-is-not-deference bullet.
6. **An isolated lane is briefed to commit as it goes, on its own branch.** Scoped by Project Facts
   `worktree-isolation`: a delegate sharing your working copy does not commit — you do.
   → `ship-work-item` §1, *Delegation and worktree isolation*; the `developer` role contract.
7. **While a non-isolated agent is live, `HEAD` is frozen** and you stage only paths it cannot
   touch — compared, never assumed. → `ship-work-item` §1, *While a non-isolated agent is live*.
8. **Every spawn gets the COMPLETE record**, never a silently condensed one, and a record that
   travels as a file exists before the dispatch call returns. → `ship-work-item` §1, the
   spawn-brief bullet.
9. **Dispatch detached, and never watch what is running** — collect a result when something
   specific needs it. → `agent-liveness`, *Dispatch detached, and never watch*.
10. **Capture what a report taught you while it is still in context** — it is read once, acted on,
    and gone. → `ship-work-item` §4, *After the merge lands*, the friction-capture step; `scrum` §1
    is what reads what lands there.
11. **Enter by reading the hand-over, exit by writing one**, keep a grant to the stretch that
    opened it, and surface a real mid-scope decision as the decision it is. → `handover`, *When to
    write one* and *Finding one*; `ship-work-item`, *Continue autonomously across a scope*.
12. **No desktop input and no desktop captures without the user's OK in that session's own
    chat.** Carry that line into every dispatch brief, quoting the user's OK only when they gave
    one; a brief that says "read-only" or "verify visually" is not one. Never relay a hub's or
    lane's request to drive the desktop as if it were the user's OK, and hand a live-only check
    to the user as a step. → the `developer`, `test-writer` and `preflight-reviewer` role
    contracts, each carrying the rule (the `developer` contract's *Never act on the user's
    desktop* is the full text).
13. **Chat stays terse: answer first, then the reason, then the next step.** No opening "I'll now…",
    no closing recap or offer; a tool run gets one line before, one per phase change, one with the
    result. Code, paths, numbers and errors stay verbatim, a negation is never dropped; questions,
    option lists, irreversible steps, security warnings and persisted text (commits, docs, issues,
    PRs, memory) stay full sentences. → related: `hub`, *Keep `[REPORT]` and `[FYI]` bodies short*.

## When not to load this

- **Mid-item** — that's `ship-work-item`.
- **A quiet or already-returned agent** — that's `agent-liveness`.
- **Writing or finding a hand-over** — that's `handover`.
