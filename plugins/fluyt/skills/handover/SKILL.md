---
name: handover
description: >-
  Write a session hand-over so a successor - the same agent after a context reset, a fresh session,
  or a different person or agent - can act without reconstructing state from a transcript. Use when
  the user says hand over, handover, end the session, write the handover, prepare a successor, or a
  context reset is coming (an auto-compaction threshold, a manual reset, a long pause, the day
  ending). Also consult it on RESUMING after one, to find the artifact at the location Project
  Facts `handover` names.
---

# Hand-over - leaving a session a successor can act on

A hand-over is a deliberate, reviewable state capture - the answer to a **context reset**: the
*conversation* survives in some form while orchestration state - which lane holds what, which
grants are still live, which decisions are waiting on the human - does not.

This is the **predecessor's** half; the successor's half is `ship-work-item`'s *Continue
autonomously across a scope*.

## When to write one

Use it whenever the user asks (the phrasings in the description), and on your OWN
initiative before a foreseeable context reset: a client threshold you can see coming, a long pause
about to start, or stopping for the day mid-drain. Also consult it the moment you **resume** after
one - *Finding one* below states the read-side rule.

## The questions it must answer - not a fixed schema

Ship the questions a hand-over must answer, not a mandated section list. Answer what applies,
under whatever heading fits; skip the rest and say so rather than leave a silent gap:

- **What is mid-way, and the one thing not to break.** The single fact a successor needs before
  anything else.
- **Standing instructions currently in force, QUOTED, verbatim - with their edges**: what a scope
  grant does and does not cover, what was paused, what the human said they'd decide later. Mark
  every grant **expired by default** (`ship-work-item`: a grant is live only for the stretch it
  opened).
- **Where the work is, from the TREE** - `git` / `gh` queries run at write time, never recalled: the
  integration branch and its state, open PRs, **uncommitted work flagged loudly** (a tracked
  mid-item edition is itself the loudest case - see *Committing it*), and, where more than one item
  is queued, the **integration order with its reason** - integration is serial even when
  implementation is parallel, and the order usually encodes a dependency a successor cannot
  re-derive from the tree alone.
- **Live lanes, gated on what you actually OBSERVE, never on a Project Facts key.** Most sessions
  have no worktree or live agent, and `worktree-isolation` does not predict them. Check `git
  worktree list` and what you actually dispatched; write the section only when one of them is
  non-empty. State plainly what a successor must re-derive rather than trust - whether an agent is
  still working, dead, or has already handed back is a fact about **your own inbox**, which a reset
  destroys; see `agent-liveness`.
- **Decisions taken under delegated authority, awaiting the human's review** - each with its
  **reversal cost**, so the human can overrule cheaply. Point at the decisions-log entry where one
  exists rather than restating it; add only the **awaiting-review** state, which the log doesn't
  carry.
- **Open questions**, each with a recommended default and whether it blocks or can wait.
- **Traps found this session that are not yet in a durable file.** A durable one goes to the
  project's own local skill; a friction signal to the git-ignored breadcrumb `ship-work-item`
  describes - not a third ledger. Once a trap is written durably, drop it from the next edition.
- **A starting instruction** - a first move, not a plan.

## The rules that make it trustworthy

- **Written from the tree, never from memory.** Every fact above is a `git` / `gh` query away; a
  hand-over assembled from recollection is the failure the exercise exists to catch.
- **Cite, don't copy.** Point at `CLAUDE.md`, the decisions file, the CHANGELOG, or an issue rather
  than restating their content - a copy drifts the moment its source changes.
- **Refresh it, never append.** Each edition **replaces** the last in full; an appended trail leaves
  a successor guessing which paragraph is still true. **Between full editions, amend in place:**
  replace each affected section or bullet whole, and keep a SINGLE "last amended `<UTC>` - what
  changed" line in the stamp, replaced each time, never accumulated. A full edition is due at a
  reset or seam, or once amendments pile up.
- **Stay readable in one pass.** When an edition outgrows that, move durable content to its home
  (decisions to the `decisions` file, traps to a local skill), never into the hand-over.
- **Stamp its own freshness, self-describing.** Record the branch **and the CHANGELOG version** (or,
  where the repo keeps no CHANGELOG, a UTC date-time), never a commit SHA or the artifact's own PR
  number - the artifact's own commit moves the tip a SHA would have named, and its own PR number
  does not exist until the PR is opened; the version is neither. A successor may arrive with no
  other context, so it must tell how fresh the file is from the file itself.
- **Never a second source of truth.** The CHANGELOG is the single source of truth for completed work
  and versions, and the `backlog` skill's selection order for what's next - this file **cites**
  both and never restates either as authority. Where it does record a queue (the integration order
  above), mark it a **snapshot to re-derive, not an instruction** (a new `bug` jumps any tier).
- **No full-CI-wait.** Writing - and, at a seam, committing - a hand-over must never become gated on
  watching a CI round-trip go green; land it and move on.

## Where it lives

There is **no mandated path.** Read the consumer's **Project Facts `handover` key**. **The default
is git-ignored**: a `*.local.md` name such as `docs/process/HANDOVER.local.md`, already covered by
the `docs/process/*.local.md` rule in `adopt-conventions`'s `templates/gitignore-additions.txt`.
**Tracking is a supported opt-in**: name a tracked path (e.g. `docs/process/HANDOVER.md`) to make it
reviewable and visible to a successor on another clone or machine. **Key absent or unset ⇒ STOP and
ask where it should live**, recommending the ignored default - never invent a path. Once the human
answers, record it in Project Facts (`adopt-conventions`'s `templates/CLAUDE-project-facts.md`).

## Finding one (the read side)

Discovery is a **pointer**, not a search: the consumer's `CLAUDE.md` (and, on Codex, `AGENTS.md`
routing to it) carries a one-line pointer to this skill and the Project Facts key naming the
artifact's location - added at onboarding by `adopt-conventions`. On **resuming** after a context
reset, read that pointer, then the file it names before acting on anything a prior turn appears to
have told you. If no pointer exists, there is nothing to find - proceed as on any fresh session, and
consider offering to set one up.

## Committing it - only for a tracked hand-over

**Ignored (the default): nothing to commit**, at a seam or mid-item - the file is local, so write it
and stop. The rest of this section is the **tracked opt-in**, except constraint 4, which holds for
both.

**Tell them apart before writing:**

- **At a seam** - the working tree is clean and no item is in flight - write it and commit it through
  the consumer's own ordinary process for a `docs/process` change (a `docs/` PR, a direct push,
  whatever this repo already does). **Defer to the consumer's own `version-rules`** for whether that
  commit needs a version bump - this skill hardcodes no tier, PATCH included.
- **Mid-item** - a work branch, a dirty tree, an item genuinely in flight - **write it and leave it
  uncommitted.** There is no legal commit path here: the ritual's own commit-guard forbids staging
  anything but the item's own files, and a hand-over committed here would ride into that item's own
  squash merge. Do not look for a legal commit; do not commit.

Four constraints on the mid-item case (tracked), all load-bearing:

1. **Mark it uncommitted, at the top of the file itself.** A reader has no other way to know it
   isn't in history; `git log` on the file says nothing.
2. **State plainly that this edition is expected to be discarded or rewritten, not merged.** It is a
   hand-off for the next turn, not a record for the repo.
3. **Never `git add` it, and never `git add` its directory, mid-item.** A directory-level add breaks
   the moment an ignore rule changes - and mid-item the rule is stronger still: no add of any kind.
4. **Write only from the main checkout, never from inside a worktree.** A file written into an
   isolated worktree's copy of the path (ignored or tracked) is destroyed when that worktree is
   cleaned up - `ship-work-item` removes them with `--force` once their commits are integrated. If
   you are running isolated, hand the content back to the orchestrator to write.
