---
name: dispatch-role
description: >-
  Codex adapter for Fluyt's six specialist roles. Use when a Codex task should delegate to the
  developer, product-owner, preflight-reviewer, tech-debt-reviewer, test-writer, or scrum-master
  contract, or when verifying those roles in read-only smoke mode. Loads the canonical role file
  from this plugin and dispatches it through Codex subagents; never substitutes an unscoped generic
  prompt or a copied local role definition.
---

# Dispatch a Fluyt role in Codex

Claude Code loads `agents/*.md` as named plugin agents; Codex plugins distribute skills but do not
install those manifests as Codex custom-agent TOML files. This skill is the adapter: it reads the
same canonical role file and gives its complete contract to a Codex subagent.

## Supported roles

| Role | Canonical instructions | Semantic model tier | Write boundary |
| --- | --- | --- | --- |
| `developer` | `../../agents/developer.md` | balanced implementation | product code named by the task |
| `product-owner` | `../../agents/product-owner.md` | deep analysis | reports under `docs/` only |
| `preflight-reviewer` | `../../agents/preflight-reviewer.md` | balanced verification | read-only |
| `tech-debt-reviewer` | `../../agents/tech-debt-reviewer.md` | deep analysis | read-only |
| `test-writer` | `../../agents/test-writer.md` | balanced implementation | Project Facts `test-dir` only |
| `scrum-master` | `../../agents/scrum-master.md` | deep analysis | read-only |

No other role name is valid. Claude Code users should keep dispatching the native
`fluyt:<role>` agents; this adapter is the Codex path.

## Dispatch procedure

1. Read the consumer's `CLAUDE.md` in full. It remains Fluyt's canonical Project Facts and
   working-agreement file on both clients; a Codex consumer's `AGENTS.md` routes here. If the file or
   a fact required by the role is missing, stop and ask instead of guessing.
2. Resolve this skill's directory, then read the selected `../../agents/<role>.md` **in full** - the
   single source of truth; never substitute a remembered, summarized, or consumer-local copy. Confirm
   its frontmatter `name` matches the requested role.
3. Check that the requested task belongs to the role and can obey its write/tool boundary. Translate
   Claude tool names in frontmatter into the current Codex tool surface, but preserve every permission
   and ownership restriction. If the available Codex subagent cannot meet the contract, stop and name
   the mismatch; never fall back to an unscoped generic agent.
4. Map the role's model alias semantically because Codex and Claude expose different model selectors.
   **`ship-work-item`'s *Model selection for sub-agents* is the canonical home for spawn model-tier
   policy; the mapping here only projects its tiers onto the Codex surface, so take any question the
   mapping does not answer - overrides, ad-hoc recon spawns, the heavy tier - from there.** `sonnet`
   means the balanced implementation/verification tier; `opus` or `fable` means the strongest
   available deep-analysis tier with high reasoning. A Project Facts `model:<tier>` issue label still
   overrides the default at the same semantic tier. If the current Codex dispatch surface cannot set a
   per-spawn model, inherit the parent model, state that limitation in the handback, and keep the role's
   instructions and boundaries exact.
5. Spawn a Codex subagent through the client's supported multi-agent mechanism. Give it the task, the
   complete canonical role instructions (or an exact readable installed path), the consumer
   `CLAUDE.md` path, and a fail-fast base check that asserts **existence AND commit identity** - the
   named files exist *and* `git rev-parse HEAD` is exactly equal to the expected base SHA the prompt
   states, compared by exact equality rather than `git merge-base --is-ancestor`. The prompt must name
   the role explicitly. State that SHA in the prompt; the subagent has nothing to assert against
   otherwise. **If the mapped Codex subagent has no shell - as `product-owner`, `scrum-master` and
   `tech-debt-reviewer` do not on Claude - it cannot run `git rev-parse`; state the SHA anyway (the
   check becomes real once the surface can run it), and its role file already tells it to mark the
   identity half NOT RUN and say so.** Read a NOT-RUN identity half in the handback as the honest
   result it is, not as a passed check.
6. Check the returned report against the canonical output contract. Every substantive report must end
   with `Skills consulted: ...`; a missing line is a failed dispatch and must be corrected before the
   result is used.

## Read-only smoke mode

Use smoke mode to verify installation without changing a consumer repo. For each requested role:

- force read-only behaviour even for `developer`, `product-owner`, and `test-writer`;
- read the canonical role file and the consumer's `CLAUDE.md`, but do not edit, build, test, launch,
  commit, push, call `gh`, or create another subagent;
- report the role's job, its write boundary in normal mode, and its semantic model tier;
- finish with exactly `Skills consulted: <canonical role path>, <consumer CLAUDE.md path>`.

The orchestrator treats a role as reachable only when the smoke report names the correct role and
boundary and carries that final line - a plugin listing alone does not qualify.
