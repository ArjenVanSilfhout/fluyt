# Agent instructions

Read `CLAUDE.md` in full before working. It is Fluyt's canonical working agreement and Project
Facts block for Claude Code and Codex; this file routes Codex to that single contract rather than
duplicating it.

Use the installed `fluyt` process skills for backlog, delivery, versioning, releases,
retrospectives, upstream reporting, and convention re-sync. In Codex, explicitly mention a skill as
`$fluyt:<name>` when needed. Dispatch the canonical `developer`, `product-owner`,
`preflight-reviewer`, `tech-debt-reviewer`, `test-writer`, and `scrum-master` role files through
`$fluyt:dispatch-role`; do not replace them with unscoped generic prompts.

Project-specific skills stay in this repo under the active client's local skill path — `.agents/skills/`
for Codex, `.claude/skills/` for Claude Code. Fluyt supplies process workflows, not stack or
domain knowledge. This repo's own local skills are `triage-upstream` (maintainer-side triage of inbound
`from-consumer` issues) and `arrow-notation` (applying the arrow legend to a skill or agent file);
they currently ship as Claude skills only, so Codex has no local equivalent to route to yet.
