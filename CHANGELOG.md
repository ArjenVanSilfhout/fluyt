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

Current version: **1.7.1**

---

## [1.7.1] — 2026-10-11

**Fix (ship-work-item, orchestrator, scrum):** four doc errors found in a size review.
`ship-work-item` dropped its own arrow legend, left over after 1.6.0 moved the legend into the
instruction-file skeletons. `portability.md` no longer calls every trap a scoped conditional,
since its last two rules apply on every OS. `orchestrator`'s description, lead-in and rules
heading now agree that rules 2 and 13 are its own. `scrum` no longer cites a `report-upstream`
warning that does not exist. PATCH: no instruction a consumer follows changes.

## [1.7.0] — 2026-10-11

**release (*The ritual* step 3):** GitHub Release notes are now a short summary of everything since
the previous release, instead of pasted CHANGELOG sections. The summary opens with one line naming
the previous release, groups short bullets by area with one line per change describing its effect
on the reader, and closes with a pointer to the CHANGELOG version range. *Afterwards* now points to
that summary. Repo-side, `scripts/publish-release.ps1` no longer builds notes: it requires
`-NotesFile` and refuses to publish without a readable, non-empty one. MINOR: a shipped skill
changes an output a consumer produces.

## [1.6.0] — 2026-10-11

**adopt-conventions (CLAUDE.md and AGENTS.md skeletons):** the arrow legend (`⇒` implies, `→` then)
now ships once, as one line in the plugin-owned routing section, instead of per skill. Existing
consumers are offered it on their next re-sync, which already proposes any missing plugin-owned
paragraph. Onboarding names the notation line in its routing merge. Known gaps: built-in Explore
and Plan subagents skip CLAUDE.md, per the Claude Code docs, so a brief to them spells the arrows
out; whether Codex subagents read AGENTS.md is unverified. No other symbols join the legend:
measured candidates saved no tokens. This repo's CLAUDE.md and AGENTS.md carry the line, the
repo-local `/arrow-notation` skill drops its per-file legend rule, and AGENTS.md lists
`trim-to-budget`. MINOR: a shipped template gains a line a consumer follows.

## [1.5.1] — 2026-10-11

**All shipped skills and agents:** every component size budget is 5% lower, and 22 files are
trimmed to at least 2% under their new budget with wording-only cuts (the 26 budgeted files
shrink by about 13 KB in total, the em-dash swap included):
restatements, filler and rationale no rule depends on. Prose em dashes under `plugins/` are now
` - `; literal formats keep theirs (code spans, fenced blocks, the CHANGELOG heading in the
template). Arrows are unchanged. `install-refresh-plugin` also says that a dry run that throws means `<folder>` matched
no `projectPath`, and to run the backup step once. A new repo-local `/trim-to-budget` skill
records the method. PATCH: no instruction a consumer follows changes.

## [1.5.0] — 2026-10-11

**install-refresh-plugin:** documents a Claude Code refresh trap measured on 2.1.296. A repo whose
session folders each carry their own `.claude/settings.json` holds one `--scope project` install
record per folder, and `claude plugin update --scope project` run from a later folder resolved to
the first folder's record, so the others stayed on the old commit. The skill now says how to spot
the stale records (a different `gitCommitSha`) and adds a user-run backup, dry-run and apply
sequence that repoints `installPath`, `version` and `gitCommitSha`. The agent hands those steps to
the user and never runs the apply. MINOR: a shipped skill gains a step a consumer follows.

## [1.4.3] — 2026-10-11

**ship-work-item (§1, first bullet):** the commit no longer appears among the duties that stay
with the orchestrator on every path. The bullet now names the two lane-commit exceptions the
skill and its roles already carry: a worktree `developer` commits its own branch, and a pinned
`test-writer` commits only its `test-dir` files. PATCH: no instruction changes, since both
exceptions already existed.

## [1.4.2] — 2026-10-11

**Docs (CLAUDE.md):** the three Project Facts marked `provenance: chosen` (codename release titles,
the hand-over path, the commit-subject format) now read `provenance: ratified @v1.3.1`, the
installed payload version, on the user's confirmation; `agent-routing` stays `chosen`.
PATCH: repo-side documentation.

## [1.4.1] — 2026-10-11

**Docs (CLAUDE.md, DECISIONS.md):** the citation rule no longer says the CHANGELOG ships; a version
resolves for a consumer through the payload manifest and the public CHANGELOG.

DECISIONS.md gains a dated correction entry (the old entry stays as written) and records the user
ratification of the three Project Facts marked `provenance: chosen`; their markers are unchanged.
PATCH: repo-side documentation.

## [1.4.0] — 2026-10-11

**Template (adopt-conventions):** the consumer `.gitignore` fragment no longer ignores `.mcp.json`;
its comment now says secrets never go into a committed one (environment-variable expansion, or a
plugin `userConfig` with `sensitive: true`).

On Claude Code that file is the shareable, project-scoped MCP configuration, so ignoring it hid a
new consumer setup from teammates and CI (a plain `git add` skips an ignored file). A consumer that
adopted earlier keeps the old ignore line, since adoption only appends; a re-sync surfaces it. The
user chose this over documenting the trade-off or adding a Project Facts key (DECISIONS.md,
2026-10-11). MINOR: a shipped template changes what a consumer gets.

## [1.3.1] — 2026-10-11

**Tooling (gate):** the local gate no longer lints or scans git-ignored paths in its two walks from
the repo root (checks [9] and [10]); CI never sees those files, so a local-only hand-over or scratch
copy can no longer turn the gate RED on its own.

The ignored set comes from `git check-ignore` run in argv batches per walk (never `--stdin`, which
from PowerShell on Windows yields no usable match because of CRLF line endings); if git cannot
answer, the walk scans everything as before and says so with one WARN per walk, never skipping
silently. Tracked files lint exactly as before, and the green line now counts what it linted and
skipped. PATCH: scripts only.

## [1.3.0] — 2026-10-11

**Hooks (hooks.json, READMEs):** every shipped hook now checks for `node` first and, when it is
missing, still lets the work through but says so; Node.js 18 or later is declared as the
prerequisite for the hooks.

Each `PreToolUse` hook prints a one-line `systemMessage` naming the guard that did not run, and the
`SubagentStop` feed line is tagged `(fallback: node not on PATH)`. With node present every hook
produces byte-for-byte the same output as before, verified by running the saved commands from
`hooks.json` with and without node on PATH, with a blocked commit as the control. The scrum skill
and the scrum-master role name the new tag; both READMEs and the consumer guide declare the
prerequisite, and the consumer guide now counts the hooks correctly. MINOR: hook output changes.

## [1.2.4] — 2026-10-11

**CI (dev ruleset):** the `local invariants (validate-local.ps1)` job is now a required status check
on `dev`, so a merge waits for a green run instead of landing the instant a PR is ready.

The ruleset is renamed `dev: PR-only, CI-green`; the workflow and action comments describe the
ruleset read instead of classic branch protection. The context had reported on every PR into `dev`
so far before being required, per the `branch-protection` skill. PATCH: CI configuration.

## [1.2.3] — 2026-10-11

**Tooling (gate, agent-liveness):** the one drive-letter path root in the plugin vocabulary
allowlist is gone, and the prose example that needed it now uses a placeholder root.

The path signal of the gate keeps only the root segment of a drive-letter path, so that entry
exempted every path under the root, not just the one example. The example in `agent-liveness` keeps
its point (a backslash read as a regex escape) without a real drive letter. PATCH: a script asset
and illustrative wording; no instruction a consumer follows changes.

## [1.2.2] — 2026-10-11

**Docs (README):** "Staying current" now gives the full Claude Code update path: marketplace update,
`claude plugin update fluyt@fluyt` (with `--scope project` for a project-scoped record), and a
restart; Codex gets its new-task step.

The old text stopped at the marketplace update, which refreshes the clone but not the installed
payload, as the `install-refresh-plugin` skill already explains. PATCH: documentation only.

## [1.2.1] — 2026-10-11

**Docs (CLAUDE.md):** the repo description now counts the shipped hooks correctly: five Claude Code
hooks, not one.

`hooks/hooks.json` registers five (one SubagentStop, four PreToolUse on Bash), as both READMEs already
said. PATCH: repo-side documentation only.

## [1.2.0] — 2026-10-11

**Fix (test-writer, ship-work-item, orchestrator):** the `test-writer` contract gains a lane-commit
exception like the one the `developer` contract carries, and the parallel-work recipe cites it.

Step 3 of the parallel-work recipe has the test-writer commit its tests in the developer worktree,
while the role contract forbade every commit, so a role following its contract could not carry out
the step. The contract now permits exactly that commit: only `test-dir` files, in the worktree the
brief names, onto that branch, and only when the brief instructs it; the step says the brief must do
so. The orchestrator skill reads the same way now: a delegate sharing the working copy does not
commit. MINOR: a role contract and a ritual step change an instruction a consumer follows.

## [1.1.0] — 2026-10-11

**Fix (adopt-conventions, install-refresh-plugin):** the three shipped instructions that read the
plugin version now name the `version` in `.codex-plugin/plugin.json`: the installed payload copy for
the provenance stamps, the marketplace source copy at the release ref for the Codex pin check.

The payload ships no CHANGELOG (its root holds `LICENSE`, `README.md`, `agents/`, `hooks/`, `skills/`
and the two manifests), so the previous reads could not be followed as written: the provenance-marker
comment in the Project Facts template, the provenance step of `adopt-conventions`, and the Codex pin
check of `install-refresh-plugin`. The manifest `version` mirrors this CHANGELOG, and
`install-refresh-plugin` already names it as the readable installed release. The Codex check now
compares the installed version with the version in the manifest at the release ref for equality.
MINOR: an instruction a consumer follows changed.

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
