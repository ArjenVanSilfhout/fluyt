# Fluyt — Changelog

A log of completed/changed work, newest first. Each entry has a version and date.

Versioning:

- **MAJOR** (X.0.0) — a breaking change to a consumer's setup (for example a removed or renamed
  Project Facts key).
- **MINOR** (X.Y.0) — a **shipped component's behaviour** changes (a skill, agent, hook, or template
  gains or changes an instruction, step, or output a consumer follows).
- **PATCH** (X.Y.Z) — wording / clarification / typo in a shipped file that changes no instruction,
  plus all scripts, CI, docs, or repo housekeeping — even when multi-file.

`CHANGELOG.md` is the single source of truth for completed work AND version numbers — never
duplicate them elsewhere. (See CLAUDE.md `version-rules`.)

Current version: **1.0.0**

---

## [1.0.0] — 2026-10-11

First public release. One plugin, `fluyt`, shipped from one payload to Claude Code and Codex.

**Skills**

- `orchestrator`: the session posture for the main agent, and the ritual chain it conducts.
- `hub`: run one cross-project hub session that coordinates several project orchestrators.
- `ship-work-item`: the end-to-end delivery ritual for one work item, branch to merged and closed.
- `backlog`: GitHub-Issues selection order, filing, re-tiering and hygiene.
- `release`: the integration-to-release promotion ritual (merge commit, tag, milestone).
- `versioning-and-changelog`: the CHANGELOG as the single source of truth, and the MINOR-versus-PATCH
  rule.
- `scrum`: a retrospective pass on the agent team and workflow.
- `handover`: a session hand-over a successor can act on without the transcript.
- `agent-liveness`: tell a working background agent from a dead one, and resume versus re-dispatch.
- `branch-protection`: rulesets and classic protection, required checks and merge-method limits.
- `adopt-conventions`: scaffold a repo onto the process, from scratch or as a re-sync.
- `report-upstream`: file a bug or feature request about the plugin itself.
- `install-refresh-plugin`: install, refresh and diagnose the plugin on either client.
- `hook-authoring`: the discipline to read before writing or changing a Claude Code hook.
- `dispatch-role`: the Codex adapter that dispatches the canonical specialist roles.
- `forge-azure-devops`: translate the ritual's GitHub and `gh` steps to Azure DevOps and `az`.

**Agent roles**

- `developer`: implements a well-specified task in product code, builds, and reports back.
- `product-owner`: turns a rough idea into a decision-ready feature spec.
- `preflight-reviewer`: a read-only pre-PR gate on diff scope, trackers, version class and closing
  keyword.
- `tech-debt-reviewer`: a read-only code-health review with minimal-diff refactor suggestions.
- `test-writer`: writes automated tests, only under the project's declared test directory.
- `scrum-master`: a read-only retrospective analyst for the agent team.

**Hook**

- `hooks.json`: dispatch-feed logging on subagent stop; a block on commits carrying a co-author
  trailer when the consumer forbids them; a closing-keyword echo before a merge is armed; a
  CHANGELOG date and vanished-heading check on commit; a branch-delete guard for branches heading an
  open PR.

**Templates** (under `adopt-conventions`)

- CLAUDE and AGENTS skeletons, the Project Facts contract, CHANGELOG and DECISIONS skeletons,
  settings, `.gitignore` and `.gitattributes` fragments, a GitHub-labels bootstrap script, and a
  branch ruleset (under `branch-protection`).

**Codex adapter**

- A strict-semver Codex manifest mirroring this CHANGELOG, a Codex marketplace file, and
  `dispatch-role` for the canonical roles.

**Repo tooling**

- A local validation gate (`scripts/validate-local.ps1`) with a CI workflow that runs it, a
  per-file component size budget, a guard fixture matrix, a release publisher, and an optional
  pre-push hook that blocks pushes containing terms from a denylist file kept outside the repo.
