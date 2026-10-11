<!-- AGENTS.md skeleton for a Codex repo adopting fluyt — merge as plugin-owned routing
     into an existing AGENTS.md, never overwrite consumer guidance. CLAUDE.md stays the single Project
     Facts / working-agreement source for both clients, not duplicated here. -->

# Agent instructions

Read `CLAUDE.md` in full before working — it is this repo's canonical Fluyt working agreement
and Project Facts block for both clients; this file only makes that contract auto-loadable from
Codex, without duplicating it.

This repo uses the **fluyt** plugin for delivery work. Consult the matching skill before
acting instead of working from memory. Mention a skill with `$` or let its description trigger it —
e.g. `$fluyt:ship-work-item`, `$fluyt:backlog`. Dispatch specialist roles with
`$fluyt:dispatch-role` and one of `developer`, `product-owner`, `preflight-reviewer`,
`tech-debt-reviewer`, `test-writer`, or `scrum-master` — never an unscoped generic subagent.

Project-specific Codex skills stay under `.agents/skills/`; Fluyt supplies process workflows,
not stack or domain knowledge.
