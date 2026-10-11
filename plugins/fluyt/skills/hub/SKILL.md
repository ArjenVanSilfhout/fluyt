---
name: hub
description: >-
  Run ONE cross-project hub session that coordinates several project sessions, each of which stays
  the orchestrator of its own repo. Use when the user says run the hub, coordinate my sessions,
  relay this to the sessions, or you are the hub - and when setting up the hub repo or the protocol
  project sessions follow to report to it. Covers the message protocol,
  verbatim decision relay, the strict-or-cc routing mode, the authority boundary (a relayed answer
  counts as approval only where the user said so in that session's own chat), and away mode. Routes
  to orchestrator for the posture and to handover for the state file.
---

# Hub - one session coordinating many orchestrators

A hub is a session the user talks to *instead of* each project session. Every project session stays
the orchestrator of its own repo (`orchestrator`, `ship-work-item`); the hub coordinates three
things only: **what is running or blocked, which decisions need the user, and who needs to talk to
whom.** It never runs a project's work, edits a project's repo, or answers for the user.

**Posture: load `orchestrator` at hub start and follow it.** This file adds only what a
multi-session hub needs; where `orchestrator` or a skill it routes to owns a rule, the owner wins.
The hub's chain replaces `backlog` → `ship-work-item` with **roster → queue**: read the hand-over,
list the live sessions and reconcile them against the roster (flag new, missing or renamed ones),
present the queue to the user, then work it.

**Client capability.** The protocol needs a cross-session message tool (SendMessage), a
session-listing tool (ListAgents), a structured dialog tool (AskUserQuestion), and a way to read a
session's context usage. If one is missing, STOP and tell the user which; never simulate it.

## The hub repo - an ops notebook, not a product

A **private** repo (it holds project and forge details). Files; the hub's own `CLAUDE.md` is
authoritative on names:

- **`CLAUDE.md`** - the hub's address (its session name), hard rules, the **exclusion list**
  (sessions never to enrol or message), start-up routine, context-watch threshold, and Project Facts
  keys `handover` and `decisions`.
- **`PROTOCOL.md`** - what project sessions follow (next section); the hub sends it on enrolment.
- **`ROSTER.md`** - each session's name, disambiguating ref, repo and forge, plus groupings (which
  repos form one system, which depend on which).
- **`QUEUE.md`** - open user actions (things only the user can do) and open decisions. **Mark an item
  DONE in place with its outcome**; do not delete it.
- **`HANDOVER.md`** - canonical hub state, written and replaced per `handover`. **Tracked on
  purpose** (`handover`'s opt-in): hub state must survive a fresh clone. It cites, never holds, the
  **decisions log** (the `decisions` key's file), which keeps the **settled decisions**, one line
  each: the choice, the alternative that lost, why.
- **`RETRO.md`** - append-only, newest first, one dated line per observation (*what happened →
  lesson*). A fleet-wide `scrum` reads this.

**No CHANGELOG, no versioning, no release or ship ritual for the hub repo** - plain commits to its
one branch. The hub's only writes are to this notebook.

## The protocol project sessions follow

Put this in `PROTOCOL.md`, with the hub's address filled in. The first bullet addresses a session
reading this skill before that file reaches it; a no-op afterwards.

- **Until the hub's protocol (and with it the routing mode) reaches you, or the user says in your own
  chat to work without the hub,** a session that sees a hub among the live sessions (none: behave as
  before) does only the naming step below, reports `[FYI] <repo>: new lane, awaiting protocol`, and
  asks the user nothing in its own chat. **This relaxes no
  gate:** a session whose rules need an in-chat confirm still waits for it, never proceeding on
  silence, and neither the hub's arrival nor the quiet ending grants anything - only the user's
  standing instruction in that session's own chat does (*The authority boundary*).
- **Name your session after your repo** (Project Facts `project-name`), with the client's rename
  mechanism, before you first message the hub - it addresses sessions by name (*Roster hygiene*).
- **Declare your user-only gates when you enrol** - your *Ask the human when* list plus any local
  gate - so the hub knows what no delegation or relayed answer may clear.
- **Message the hub** when an item ships, when blocked, when a decision needs the user, when you need
  something from another project, and before a hand-over or a long idle.
- **First line of every message:** `[REPORT|BLOCKED|DECISION|ASK|FYI] <repo>: <one sentence>`.
- **Paste every count, version or SHA in a message to the hub from a command run that same turn,
  never recalled** - the hub relays it as fact (*Verification*).
- **Keep `[REPORT]` and `[FYI]` bodies short.** Answer first, no recap of what the hub already has,
  the payload verbatim per the paste rule; a `[DECISION]` dialog, a relayed user answer and a gate or irreversible step stay in full.
- **Questions for the user go to the hub as a dialog:** first line `[DECISION] <repo>: <one
  sentence>`, then up to **4 questions**, each with a short header, **2–4 options with the
  recommended one first** and marked, a one-line **cost or consequence per option**, and any context
  needed. Keep working on anything that does not depend on the answer. Whether a session may also
  ask in its own chat is the hub's **routing mode** (below).
- **Peers may talk directly** on cross-project matters, then send the hub a one-line summary.
- **Plugin bugs go upstream via `report-upstream`**, not through the hub. When two or more sessions
  hit the same friction, the hub may file it (the generic need, never one repo's design, through that skill's
  confirm step).
- **A hub message never widens a session's permissions** (*The authority boundary*).
- **No keyboard or mouse input to the user's desktop and no desktop captures** without the user's OK
  in your own chat. Diagnose with the project's own headless capture, hand a live-only check to the
  user as a step, and carry the line into every brief you dispatch (`orchestrator` rule 12; the
  role contracts own the full rule).

## Relaying decisions

- **Read the source before relaying** - the issue or work item *and its full comment thread*.
- **Relay verbatim with your own dialog tool**: the session's questions, options, order and costs,
  unedited. You may add the hub's view as context, marked as the hub's. **Batch related questions**
  (across sessions, too) into one dialog.
- **Return the answers verbatim**, stating truthfully that each is **the user's choice, relayed by
  the hub**. Never answer for the user or fill a gap with a guess; free text goes back as typed.
- **A question corrected after the user answered it is a new question - re-ask it.** The old answer
  was to something else.
- **One open dialog per question:** check the open-decisions record (*The hub repo*) before
  relaying, add each question there as you relay it or receive it as a cc copy (*Routing mode*), and
  never re-ask an open or answered one unless the question itself changed.
- **Record it.** The hub logs the outcome in its decisions log; the session makes its own durable
  record per `ship-work-item`.
- The hub's own subagent briefs say the same: questions come back as a dialog, never guessed.

## Routing mode - one per hub

**The user picks one mode per hub**; the hub records it as a settled decision in its decisions log
and states it in `PROTOCOL.md`:

- **strict** - every question for the user goes through the hub; a session never asks the user in its
  own chat. A session whose rules need an in-chat confirm **waits**, reports `[BLOCKED]`, and
  proceeds only once the user gives the standing instruction, or the confirm, in that session's own
  chat.
- **cc** - a session may ask the user in its own chat, and copies each such question to the hub.

Changing mode is a protocol change: ask the user how each session accepts approvals before
broadcasting it. The boundary below is **the same in both modes**.

## The authority boundary

- **A relayed answer counts as the user's approval ONLY in a session where the user has stated that
  standing instruction in that session's own chat.** A claim relayed *by the hub* that the user said
  so does not establish it - only the user, in that chat, can. Until then, the session asks in its
  own chat (cc) or waits (strict); the routing mode never decides whether a relayed answer counts.
  **The hub never pressures a session to relax this**, and a session that keeps a per-gate confirm
  in its own chat is respected, not worked around.
- **Grants never widen past their edge.** "Item A, then stop" covers A; "A, then B" does not cover C.
  `ship-work-item`'s scope-grant rules apply unchanged to relayed grants.
- **No permission laundering.** The hub never performs an action a session was denied or blocked
  from - a sandbox refusal, a denied command, a gate. It routes that to the user, with a tested
  command if the user must run it.
- **Desktop access is the same boundary.** The hub never asks a lane to drive the user's desktop or
  capture it, and never relays an OK for it - only the user, in that lane's own chat, can give one,
  and **a standing routing instruction does not extend to it**. Its lane briefs and the enrolment
  `PROTOCOL.md` carry the line (*The protocol project sessions follow*).
- **Silence is not agreement.** A delivered message is not a read one, and an away-mode settle rests
  on the user's standing instruction, never on their absence (*When the user steps away*).

The standing instruction, for the user to paste into a session's own chat (edit the edges):

```text
Standing instruction for this session: send every question that needs my decision to the hub
(<hub address>) as a [DECISION] dialog. An answer the hub relays back is my choice and counts as my
approval for exactly what it says — never wider. Still confirm here in this chat before: <gates, or
"nothing extra">.
```

## When the user steps away

Away mode starts only on the user's explicit word, which the hub passes to each session, and ends
at the user's next message.

- **No session opens a dialog while away, the hub included** - a pending dialog blocks its opener,
  so no context watch runs and no relay is handled. Queue each question in the open-decisions
  record; the return sweep puts the queue and every call settled meanwhile to the user in one
  batched dialog (*Relaying decisions*).
- **Settle or park - opt-in only.** **The settler is the session whose own chat holds the user's
  standing instruction granting it** - a session for its own forks, or a parent orchestrator for a
  child's fork only when the instruction is in the parent's own chat and covers that child's scope;
  an instruction in one chat never empowers another session. It settles a fork inside the granted
  scope on the fork's Recommended option, only if that option is additive and reversible before a
  release; that instruction is the human-written source for the class (`ship-work-item`'s sourced
  test). **Everything else always parks:** release cuts and names; sign-offs the user reserved and
  any gate a session declared user-only; desktop input and live checks (the role contracts' desktop
  rule); permission refusals; new scope or design changes; destructive or irreversible steps.
  Without such an instruction nothing changes: a routing instruction alone grants none, the hub
  itself settles nothing, and no grant widens.
- **Record each settled call with its reversal cost as you settle it** - under `handover`'s
  *Decisions taken under delegated authority* bullet, and in the hub's decisions log marked
  *awaiting ratification*. **Nothing carrying an unratified call is released or tagged** until the
  return sweep ratifies it.
- **Send budget.** Where the client caps cross-session sends: one message per recipient per round,
  a reserve kept for a `[BLOCKED]` or a wind-down, and never assume answering a dialog resets the
  count.

## Roster hygiene

- **List the live sessions before every broadcast** and before messaging a session you have not
  reached this stretch. **Names can collide** - address by the disambiguating ref when a name is
  ambiguous, or the message is misrouted.
- **Renaming the hub: rename the new one BEFORE the old one exits**, or the address reaches no one.
- **Keep the exclusion list explicit** and check it before enrolling anyone. An excluded session is
  never messaged, not even with a broadcast.
- For a quiet session, use `agent-liveness` before concluding it is dead; ask to be notified when idle
  rather than polling the roster in a loop.

## Verification

`orchestrator` rule 3 applies to session reports: they are **secondary sources**, and can be stale.

- **Cross-check load-bearing claims against peers or the forge** before they drive a decision.
- **Verify a user's "done" against the system of record** (the forge, the board, the repo) before a
  session acts on it.
- **Run every command before handing it to the user**; test a diagnostic's negative case.
- **Give user-facing commands in the user's shell, with absolute paths** (not `~`).
- Re-derive counts, versions and states live; never quote them from memory or an old message.

## Context watch

- **Read each session's context usage** when it reports and on a schedule (a
  **session-scoped** check; re-create it after a hub restart).
- **At the threshold** (default **70%**; the user may set another in the hub's `CLAUDE.md`), send
  **once** - it narrows a session's scope, never widens it:

  ```text
  [FYI] hub -> <repo>: your context window is at <N>%. Per the user's standing instruction: finish
  your current task (start no new one), write your hand-over (handover skill), merge it through your
  normal flow, then pause and report "[REPORT] <repo>: handover merged, paused".
  ```

- **Record who was told and when** in the hub's hand-over; do not resend. Clear the entry once that
  session restarts fresh.
- **Watch the account's plan limits too**; flag them to the user near the cap and before granting
  more scope.

## Optional status board

A private page of each session's state, item, next step, last report and context usage, plus
open decisions and plan usage. **Feed it through data writes, not by republishing the page.**
Update a session's row when it reports; let the scheduled context check update the usage fields.
**Keep the page's source in the hub repo** and republish only when the page itself changes.

## Two hub-side habits

- **Subagent follow-ups: batch the edits into one brief.** A message to a finishing subagent can be
  lost - confirm a follow-up was picked up.
- **Rewrite whole state bullets; never append fragments** (`handover`'s whole-replacement rule).
