---
name: scrum
description: >-
  Run a scrum-master / retrospective pass on the AGENT TEAM and workflow (not the product code). Use
  when the user types /scrum or /retro, asks for a retrospective, a "how are the agents working
  together" review, a process/workflow health check, or wants suggestions for improving how the
  team's agents collaborate. The main agent runs this because only it has the full orchestration
  view; every suggestion is PROPOSED for the user to verify - nothing is applied automatically.
---

# Scrum-master / retrospective pass

You are wearing the **scrum-master hat**. Unlike the `fluyt:scrum-master` *subagent* (a
read-only deep-analysis arm), YOU - the main agent - run this with the full orchestration view: you
saw what was built, what you dispatched, what came back, and where things snagged. Surface **how the
team + workflow are working** and propose **user-verified** improvements: you **propose**; the user
disposes. Never change `CLAUDE.md`, agent definitions, settings, or workflow files as part of a
retrospective without explicit sign-off.

## 1. Gather the evidence

Pull from sources that exist, never invented:

- **Recent work** - `git log --oneline` since the last retrospective / over the requested window,
  the merged PRs, and the CHANGELOG entries they produced (Project Facts `changelog`).
- **Backlog health** - run `backlog`'s *Hygiene scan* (`gh issue list --state open --limit 200
  --json number,title,labels`): any unlabelled or orphaned issue?
- **The agent team** - the agent definitions (the plugin's `fluyt:*` agents and any local
  `.claude/agents/*.md`): role overlaps, gaps, or tool/permission mismatches.
- **The skills library** - the plugin skills the team routes to and any local project skills: is
  the routing intact (do `CLAUDE.md` and each agent def point at the right skills), and has any
  skill drifted from the code or workflow it documents? Contradictions
  between skills, agent defs, and `CLAUDE.md` are process debt - **unless the `CLAUDE.md` states the
  divergence deliberately, with its reason**, which is a resolved contradiction rather than debt.
  (A divergence that narrows a shared **gate** is the exception to the exception: that stays debt;
  name the gate it narrows.)
- **Dispatch feed** - `docs/process/dispatch.local.md` if present. The `SubagentStop` hook appends
  one line per subagent finish: a timestamp, plus the subagent's type when the hook's stdin JSON
  carries one (the plugin README's *Hooks* section owns the `(fallback)` stamps). Treat it as a
  *cadence tripwire* that something ran, **not** a metric. It still **over-counts**: every Task-tool
  spawn stamps at any nesting depth (delegates' own subagents included), and every *resume* stamps
  again, not just the first completion. Dispatch → findings → fix → resume is the *recommended*
  review loop, so one reviewer resumed once already stamps twice: the inflation is systematic.
  Untyped stamps are a third over-count source: an `(untyped)` line is a finish event with no
  subagent type, and can fire with no Task subagent behind them, so **only typed lines correspond to
  Task dispatches**. A worktree-isolated spawn's stamp survives worktree cleanup (the hook writes
  into the *session's* project dir), but a ratio built on this feed still divides mismatched
  populations (a recon probe counts the same as an implementation dispatch). Stamps carry an
  explicit offset (e.g. `2025-01-01T18:00:00-0500`); compare by instant, not by assumed zone.
- **Friction notes** - `docs/process/retro-log.local.md` if present. Separate from the dispatch
  counter, so it is **100% friction signal**: every line is a one-line note a human or an agent
  appended about something that snagged, never a hook stamp - orchestrator-side snags and
  report-side lessons a delegate's report taught you that you never acted on (`ship-work-item`'s
  wrap-up owns *when* each is captured; this bullet only reads what lands). So "the file is empty"
  is directly meaningful: a session that captured nothing live, not a hook that never fired.
  **One under-count is structural, not incidental**: a note appended *inside* a worktree-isolated
  spawn's own checkout lands in that worktree's copy of the file, discarded when the worktree is
  cleaned up after merge - unlike the dispatch hook (above). For actual blockers, see the fallback
  below.
- **Workflow friction** - `CLAUDE.md` / branching rules that were hard to follow, repeated mistakes,
  rework, or ordering gotchas.

**Keep the friction file honest:** the dispatch feed carries no blocker content, so real blocker
evidence comes from the one-line notes `ship-work-item` *After the merge lands* step 5 has you
append during each work item. If it wasn't captured live, reconstruct from memory here - but treat
a recurring empty friction file as its own finding **only after confirming a run actually spawned
subagents** (check `dispatch.local.md` for the same window) - a solo or orchestration-script
session that spawns no Task subagents legitimately leaves both feeds empty, which is not a process
problem.

## 2. Analyse (optionally delegate the deep read)

For a quick pass, analyse directly; for a **thorough** one, spawn the read-only
`fluyt:scrum-master` subagent for the deep artifact read and synthesise its findings here -
keeping the heavy reading off your context. Give the
subagent the backlog JSON snapshot in its prompt (it has no `gh`), the resolved plugin path
(`$CLAUDE_PLUGIN_ROOT`) or the agent-def / skill content it must analyse (it has no Skill tool),
and the blocker / friction context it can't see from outside the session.

Look for: what went **well** (keep doing), what caused **friction** (rework, confusion, wasted
passes), **blockers** agents hit and whether they were surfaced or silently worked around, and
whether a small change to a `CLAUDE.md` rule, an agent definition, a tool/permission, or the
workflow would remove the friction.

## 3. Propose (small, concrete, verifiable)

Return a short, actionable retrospective:

- **Went well** - 2–4 bullets.
- **Friction / blockers** - each with the concrete evidence (PR#, file, or log line).
- **Proposals** - each a *minimal* change, tagged with where it lands (a `CLAUDE.md` rule / an agent
  def / a settings hook / new tooling / **a shared fluyt plugin component** / "consider a 2nd
  dev agent"), ranked by leverage, and marked **"needs your OK."**
  **A proposal that targets a shared plugin component belongs UPSTREAM** - file it via
  `/fluyt:report-upstream` (its gates apply: main session, user-approved draft), not as a
  **locally re-implemented copy** of the shared component, which will drift from the plugin. A
  divergence the consumer's `CLAUDE.md` records as a deliberate deviation with its reason is the
  sanctioned form.
- If useful, offer to file accepted proposals as GitHub issues once approved.

## 4. Optionally record it

If the user wants a durable record, write the retrospective to `docs/process/retro-<YYYY-MM-DD>.md`.
Otherwise present it in chat. Keep the `retro-log.local.md` and `dispatch.local.md` feeds as-is.

## Guardrails

- You may **recommend** provisioning a second developer agent or granting a tool, but never
  self-provision one.
- Stay on **process / collaboration**. Defer code-health findings to `fluyt:tech-debt-reviewer`
  and feature scoping to `fluyt:product-owner`; if you notice one, name it and point at the agent.
- Keep it lean: lead with the one or two highest-leverage changes.
