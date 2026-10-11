---
name: scrum
description: >-
  Run a scrum-master / retrospective pass on the AGENT TEAM and workflow (not the product code). Use
  when the user types /scrum or /retro, asks for a retrospective, a "how are the agents working
  together" review, a process/workflow health check, or wants suggestions for improving how the
  team's agents collaborate. The main agent runs this because only it has the full orchestration
  view; every suggestion is PROPOSED for the user to verify — nothing is applied automatically.
---

# Scrum-master / retrospective pass

You are wearing the **scrum-master hat**. Unlike the `fluyt:scrum-master` *subagent* (a
read-only deep-analysis arm), YOU — the main agent — run this with the full orchestration view: you
saw what was built, which subagents you dispatched, what they reported, and where things snagged.
Your job is to surface **how the team + workflow are working** and propose **user-verified**
improvements. You **propose**; the user disposes. Never change `CLAUDE.md`, agent definitions,
settings, or workflow files as part of a retrospective without explicit sign-off.

## 1. Gather the evidence

Pull from the sources that actually exist (don't invent):

- **Recent work** — `git log --oneline` since the last retrospective / over the requested window,
  the merged PRs, and the CHANGELOG entries they produced (Project Facts `changelog`).
- **Backlog health** — `gh issue list --state open --limit 200 --json number,title,labels`: does
  every open issue carry exactly one tier label (the scheme declared in Project Facts `backlog`),
  with none orphaned or unlabelled?
- **The agent team** — the agent definitions (both the plugin's `fluyt:*` agents and any
  local `.claude/agents/*.md`): role overlaps, gaps, or tool/permission mismatches (an agent that
  can't do its job without a capability it lacks).
- **The skills library** — the plugin skills the team routes to (via `/fluyt:*`) and any
  local project skills: is the routing intact (does `CLAUDE.md` and each agent def point at the
  right skills), and has any skill drifted from the code or workflow it documents? Contradictions
  between skills, agent defs, and `CLAUDE.md` are process debt — **unless the `CLAUDE.md` states the
  divergence deliberately, with its reason**, which is a resolved contradiction rather than debt.
  (A divergence that narrows a shared **gate** is the exception to the exception: that stays debt, and
  name the gate it narrows.)
- **Dispatch feed** — `docs/process/dispatch.local.md` if present. The `SubagentStop` hook appends
  one line per subagent finish: a timestamp, enriched with the subagent's type when the hook's stdin
  JSON carries one (a portable `node` parse; it falls back to a `(fallback)` stamp when `node` is
  unavailable or the stdin is unparsable — fail-soft is absolute, see the hook definition). Treat it as
  a *cadence tripwire* that something ran, **not** a metric. It still **over-counts**: every Task-tool
  spawn stamps at any nesting depth (delegates' own subagents included), and every *resume* stamps
  again, not just the first completion. Since dispatch → findings → fix → resume is the *recommended*
  review loop, one reviewer resumed once already stamps twice — the inflation is systematic, not
  incidental. Untyped stamps are a third over-count source: an `(untyped)` line is a finish event
  with no subagent type, and such events can fire with no Task subagent behind them,
  so **only typed lines correspond to Task dispatches**. A worktree-isolated spawn's stamp survives
  worktree cleanup (the hook always writes into the *session's* project dir, not the isolated
  checkout), but a ratio built on this feed still divides mismatched
  populations (a cheap recon probe counts the same as a real implementation dispatch). Stamps carry
  an explicit offset (e.g. `2025-01-01T18:00:00-0500`); compare by instant, not by assumed zone.
- **Friction notes** — `docs/process/retro-log.local.md` if present. This file is separate from
  the dispatch counter, so it is **100% friction signal**: every line is a one-line note a human or
  an agent appended about something that snagged, never a hook stamp — orchestrator-side snags, and,
  since `ship-work-item`'s wrap-up also prompts for it, report-side lessons a delegate's report taught
  you that you never acted on (that step owns *when* each is captured; this bullet only reads what
  lands). That makes "the file is empty" directly meaningful — a session that captured nothing live,
  not a hook that never fired. **One
  under-count is structural, not incidental**: a note appended *inside* a
  worktree-isolated spawn's own checkout lands in that worktree's copy of the file, which is discarded
  when the worktree is cleaned up after merge — unlike the dispatch hook (above), which always targets
  the session's project dir and so is never lost this way. For actual blockers, see the fallback below.
- **Workflow friction** — `CLAUDE.md` / branching rules that were hard to follow, repeated mistakes,
  rework, or ordering gotchas (e.g. an agent-definition change that had to land before a worktree
  spawn to take effect).

**Keep the friction file honest as you work:** the dispatch feed carries no blocker content even
enriched, so real blocker evidence comes from one-line friction notes appended *during* each work item
— the `ship-work-item` wrap-up prompts this, positioned before branch cleanup / pick-next so it
can't be skipped by moving on first (create `docs/process/retro-log.local.md` and its directory if
absent, then append what snagged + where). It's git-ignored, costs nothing, and is what makes this
retro's evidence real rather than a bare dispatch count. If it wasn't captured live, reconstruct from
memory here — but treat a recurring empty friction file as its own finding **only after confirming a
run actually spawned subagents** (check `dispatch.local.md` for the same window) — a solo or
orchestration-script session that spawns no Task subagents legitimately leaves both feeds empty with
nothing wrong, which is not a process problem.

## 2. Analyse (optionally delegate the deep read)

For a quick pass, analyse directly; for a **thorough** one, spawn the read-only
`fluyt:scrum-master` subagent for the deep artifact read and synthesise its findings here —
keeping the heavy reading off your context while you keep the orchestration view. Give the
subagent the backlog JSON snapshot in its prompt (it has no `gh`), the resolved plugin path
(`$CLAUDE_PLUGIN_ROOT`) or the agent-def / skill content it must analyse (the plugin lives in the
install cache, not the working tree, and it has no Skill tool), and the blocker / friction context it
can't see from outside the session.

Look for: what went **well** (keep doing), what caused **friction** (rework, confusion, wasted
passes), **blockers** agents hit and whether they were surfaced or silently worked around (the
latter is a process smell), and whether a small change to a `CLAUDE.md` rule, an agent definition, a
tool/permission, or the workflow would remove the friction.

## 3. Propose (small, concrete, verifiable)

Return a short retrospective the user can act on:

- **Went well** — 2–4 bullets.
- **Friction / blockers** — each with the concrete evidence (PR#, file, or log line).
- **Proposals** — each a *minimal* change, tagged with where it lands (a `CLAUDE.md` rule / an agent
  def / a settings hook / new tooling / **a shared fluyt plugin component** / "consider a 2nd
  dev agent"), ranked by leverage, and marked **"needs your OK."**
  **A proposal that targets a shared plugin component belongs UPSTREAM** — file it via
  `/fluyt:report-upstream` (its gates apply: main session, user-approved draft), not as a
  **locally re-implemented copy** of the shared component, which will drift from the plugin (see
  `report-upstream`'s own warning). A
  divergence the consumer's `CLAUDE.md` records as a deliberate deviation with its reason is not that —
  it is the sanctioned form.
- If useful, offer to file accepted proposals as GitHub issues once approved.

## 4. Optionally record it

If the user wants a durable record, write the retrospective to `docs/process/retro-<YYYY-MM-DD>.md`.
Otherwise present it in chat. Keep the `retro-log.local.md` and `dispatch.local.md` breadcrumbs as-is
— they are the raw feeds, not the report.

## Guardrails

- **Propose, never auto-apply.** Workflow / agent / process changes are the user's call.
- You may **recommend** provisioning a second developer agent or granting a tool, but never
  self-provision one — the user enables it.
- Stay on **process / collaboration**. Defer code-health findings to `fluyt:tech-debt-reviewer`
  and feature scoping to `fluyt:product-owner`; if you notice one, name it and point at the
  right agent.
- Keep it lean: lead with the highest-leverage one or two changes.
