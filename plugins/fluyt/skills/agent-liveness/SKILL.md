---
name: agent-liveness
description: >-
  Decide whether a dispatched background sub-agent is working, dead, or already handed back. Use
  when an agent is quiet too long, before re-dispatching or resuming one, and before spawning.
---

# Agent liveness - is it working, is it dead, or has it already handed back?

A backgrounded sub-agent hands back once, at the end of its turn. Between spawn and that handback the
orchestrator is blind, and the two states look identical from outside:

- the agent is **working** - a long mandated recon, a slow build, a full test run, or editing files
  it already created; or
- the agent is **gone** - killed at the platform level, or dead on a terminal API error after retries.

Guessing wrong is expensive both ways. Kill a working agent and you lose its context and its
half-finished slice. Wait on a dead one and the lane stalls indefinitely, and in a parallel drain so
does everything behind it.

There is a **third** state, and it is not a silence at all: the agent has **already handed back**,
and you are holding a report rather than diagnosing a gap (*A returned agent is not a running
one*). It is the costliest of the three to misread, because no signal in this file can *confirm* it.

This is the **orchestrator's** half of the problem. The agent's half lives in `agents/developer.md`:
`developer` emits a one-line checkpoint before its first edit, and its report is terminal - it never
arms a wake-up intending to continue alone. Use that checkpoint when it exists; use this procedure
when it does not (`test-writer`, `preflight-reviewer`, custom spawns) or the agent then went quiet.

## Dispatch detached, and never watch - the two defaults this skill owns

Both rules are **stated here, once**; both govern the blind window this skill diagnoses.
`ship-work-item` §1 keeps the operative default under its *Dispatch in the background* and *Do not
watch a background agent* headings and points here for the full rule; its §4 auto-merge and
approval-wait steps, and every other place leaning on either rule, are **applications** of them.

- **Dispatch in the BACKGROUND, detached rather than blocking - that is the default, and it includes
  preflight.** A synchronous dispatch makes the orchestrator unreachable for as long as the agent
  runs, so a maintainer's mid-turn correction queues behind it and arrives too late to redirect the
  work: a blocking spawn removes the human from the loop, not merely delays them.
  **State the trade honestly:** the result arrives later, so you must actually collect it, and
  integration still serializes (`ship-work-item` §4), so backgrounding buys reachability, not
  concurrent merges. **A backgrounded preflight obliges a draft PR** - that
  pairing is not optional and is spelled out in `ship-work-item` §4. Where a client genuinely cannot
  dispatch detached, say so in your summary rather than silently reverting to blocking.
- **Do not WATCH a background agent, workflow, or process - collect its result when it reports.** A
  watch loop orphans on session teardown, burns a turn per pass against unchanged state, and - the
  reason that outranks both - makes you unreachable for as long as it runs, which is the very cost
  backgrounding exists to remove. **The prohibition is on *watching*, not on *waiting*** - **what
  occupies you**, not elapsed time: a *blocking dispatch* holds the orchestrator for the agent's
  entire run (the previous bullet's concern), while *elapsed time* on something you are not checking
  occupies nobody - so this rule never forbids a synchronous dispatch. Check a background result
  when something specific needs it - the next turn that consumes it, or a silence out of proportion
  to the slice - never on a timer. **That second trigger is what the rest of this skill is for**:
  how to read a silence once one is worth a look.
- **A corollary of the second default, not a third: one bounded wait that ends your turn is
  *collecting*, not *watching*.** When a result has no next turn to land in - an orchestrator arming
  a merge as its last act, nothing else queued - start **one** background command that exits at the
  terminal state, **with a cap** (or your client's equivalent single-shot notification), then end
  the turn. It fits the rule above: your turn is over, so you stay reachable, and it wakes you
  **once** - never a loop you re-check. **Its exit is a wake-up, never the result:**
  a clean exit or an expired cap says nothing about the state, so read the state yourself before
  acting, and a wait that dies with the session is no evidence of anything - the next turn that
  needs the result still checks it. Only a session the client re-enters can be woken; a delegate's
  handback ends it (*A returned agent is not a running one*). If the cap expires with nothing
  terminal yet, or your client gives no notification when a background command exits, report what is
  pending - e.g. "armed; post-merge steps pending" - to whoever coordinates the lane instead of
  starting another wait.

## A returned agent is not a running one

If the agent's most recent turn ended in a report and you have not re-entered it since, you are not
diagnosing a silence - you are holding a **handback**. None of the liveness signals apply to it; skip to
*When it returned - resume rather than re-dispatch*. Once you resume it, it is working again, and a
fresh silence after that is diagnosed with the signals below as normal.

The trap: an agent finishes a long step, arms itself a wake-up - a monitor, a poll, a "check back
when the run lands" - and returns its interim findings. **Nothing it scheduled can bring it back.**
Once it returns, its turn is over and only the orchestrator can re-enter that lane. The wake-up it
armed is not pending work or evidence of work; it is a handback with a follow-up attached, waiting
on **you**. Left alone it is a stall that reads like liveness: the agent
believes it is waiting, you believe it is working, and nothing is running.

Two things make it hard to spot:

- **Not every message is a completion - and provisional wording does not make one non-terminal.**
  `developer` must emit a mid-run checkpoint before its first edit on every spawn **except a
  declared-synchronous, non-large-slice one** (see above), so an arriving message may well be a live
  agent mid-slice. Tell the two apart by **shape, not tone**: a checkpoint is a single line of plain
  progress output arriving before any edit; a handback carries the report structure
  `agents/developer.md` mandates - what changed, build, tests, invariants, skills consulted.
  Anything with that shape ended the turn, however tentative it reads and however firmly it promises
  to continue. Where your client separately signals that the task itself completed, that signal is
  terminal and the agent-authored text is not.
- **A parked agent and a slow one look alike under the signals below** - no fresh writes, no new work
  product, no message. The one signal that can separate them speaks only in the positive, so it is
  silent on exactly the lane you are worried about. What separates them is whether a report already
  arrived - a fact about your own inbox, not the worktree. Check that first; it is free.

## The signals that lie

Rank all of these **below** the next two sections. Each looks like death and is not.

- **An empty transcript artifact.** Whatever file your client exposes for a running agent task - on
  Claude Code, the task's `.output` path, which is a symlink to the subagent's JSONL transcript - it
  routinely reads as **0 bytes on a perfectly healthy agent**, and its mtime does not track the
  agent's activity. An empty transcript artifact means nothing at all. (A Codex subagent dispatched
  via `dispatch-role` exposes none; the rule below holds everywhere.)
- **Never read that file to find out.** It is the full transcript; reading it will overflow your
  context and turn a cheap question into a lost session. Where the harness warns about this at
  spawn, the warning is literal.
- **An unchanged `git status`.** It reports *which* files differ, not *when* they changed. An agent
  refining files it already created, running a build, or sitting in a long test run produces
  byte-identical `git status` output across many minutes of healthy work.
- **A silence that is merely long.** Calibrate to the slice, not the clock. A large multi-file slice
  can spend 15–20 read-only tool calls on mandated recon before its first write (`developer.md`
  steps 0–3): ten silent minutes on a broad refactor is unremarkable, on a one-predicate bug fix
  worth a look.

## The signal that tells the truth

**Modification times on the specific files the agent is actually writing**, compared against now:

```sh
ls -la --time-style=+%H:%M:%S <the files its brief named> <its new-file directory>/ ; date +%H:%M:%S
```

```powershell
Get-ChildItem <the files its brief named> | Select-Object Name, LastWriteTime ; Get-Date
```

A write in the last few minutes proves life and ends the enquiry. Exactly one other thing does -
see *When mtimes are structurally silent* - and nothing beyond those two. (The `Read` / `Glob` tools
work too - the point is the comparison, not the command.)

Two ways to get this wrong:

- **Do not sweep the tree.** A tree-wide "modified in the last N minutes" search is useless in a
  fresh worktree: the checkout stamps *every* file with the checkout time, so the sweep returns the
  entire source tree and reads as furious activity when there is none. Narrow to the files the brief
  named.
- **Do not read build output as work.** The build-output directories your project declares (Project
  Facts, or its `.gitignore`) are stamped by builds, including ones the agent ran long ago and ones
  *you* ran. They are not its work product.

## When mtimes are structurally silent

Mtimes answer only once the agent has started writing. Read `process-check.md` in this skill's
directory when the brief's long pole runs BEFORE the agent's first write - a baseline test run, a
measurement, a long build - and mtimes have nothing to report: the process check, its platform
forms, and its four constraints (match the worktree path, discount your own query, it proves the
command not the agent, absence proves nothing).

## What death actually looks like

A platform-killed agent has produced **nothing** - not "an empty transcript", but no work product at
all: the file it was told to create does not exist, its directory is absent, `git status` is clean.
Confirm with a targeted existence check, not inference:

```sh
ls <expected new file or directory>     # or Glob for the expected pattern
git -C <worktree> status --short
```

**Zero work product *and* a silence out of proportion to the slice** is the pair that justifies
acting. Either one alone does not.

## When it really is dead

- **Re-dispatch fresh.** A killed agent has no live context to continue from. Spawn a new one with the
  same brief, stating what the previous attempt had already completed, if anything, so it does not
  redo settled work or duplicate a partial edit.
- **Never spawn alongside a live one.** If the check was inconclusive, wait. Two agents in one
  worktree produce interleaved edits that cost far more to unpick than the delay you avoided. The
  harness's "do NOT spawn a duplicate" warning is the correct default posture.

## When it returned - resume rather than re-dispatch

Re-dispatching fresh (*When it really is dead*, above) is the rule for a **killed** agent; it does
not carry across to one that **completed**. A returned agent still holds its context. Spawning a
fresh one to follow up on the slice it just did discards that, and invites the replacement to
re-derive a result the first agent already established - a hazard wherever a figure gets re-measured
rather than carried forward.

Where your client can re-enter a completed agent's context, do that instead of spawning. (On Claude
Code that is `SendMessage`, to the agent's name or ID; the capability is the rule, the tool the
instance.)

When it cannot - no resume capability in the session (on Claude Code, `SendMessage` absent from the tool
set), or the agent's id gone after a context reset - spawn a fresh agent of the same role
**non-isolated**, pinned by absolute path to the returned agent's existing worktree, following
`ship-work-item`'s `parallel-work.md` step 3 (fail-fast branch + HEAD check, `git -C <worktree>`).
Carry the prior report **verbatim**, the failing tests by name, and the concrete correction - a
fresh agent briefed from a summary is blind. Never `isolation: worktree` for this correction: it
mints a second worktree and orphans the lane the work is in. The bound below still applies first -
confirm the worktree and branch still exist and match the report before pinning anything to them.

Two bounds:

- **Resume for a follow-up on the slice it just did** - what it measured and why, a correction to its
  own figure, an extension of a guard it just built, a sign-off on a value it proposed. A **new** slice
  gets a fresh agent, whose uncontaminated context is worth more than the continuity.
- **Recall is always safe; editing again is not.** What the agent *knows* lives in its transcript and
  survives anything. What it *wrote* lives in a worktree that may already be gone - `ship-work-item`
  has you remove it once its commits are integrated, and its base goes stale the moment a sibling
  merges. Before asking a returned agent to touch files again, confirm its worktree and branch still
  exist and match what it reported.

## Cost discipline

Completion notifications are terminal; mid-run output is not (*A returned agent is not a running
one*). Don't watch a running agent (*Dispatch detached, and never watch*).

Check liveness when you have a **specific reason** - a silence out of proportion to the slice, or a
dependent lane you cannot start without knowing. Then stop. Two checks a few minutes apart tell you
what one did.

Resuming is not free either - it grows that agent's transcript, so a long chain of follow-ups
eventually costs more than the fresh spawn it saved. Prefer it where the context is the point; not
as a habit.

If nothing is landable and nothing is dispatchable, **say so and end the turn** rather than
re-verifying; idle re-checks feel like progress and are not.
