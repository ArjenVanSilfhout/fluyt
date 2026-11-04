# Fluyt — working agreement

## What this repo is

A **dual Claude Code + Codex plugin marketplace**. It ships ONE plugin, `fluyt`:
client-agnostic agentic-development process assets (skills, canonical team roles, five Claude Code
hooks, and scaffolding templates) that **any project** imports instead of re-implementing the same
delivery ritual. Nothing in it is specific to one kind of project.

**There is no build step. The git repo IS the artifact.** Both clients install from this repo and
track `main` (pinned via marketplace ref — **not** the default branch, which is `dev`). Claude's
manifest stays versionless and tracks the branch tip; Codex's required strict-semver manifest mirrors
the CHANGELOG current version. **Consumers never ride `dev`**: the `ref` pin decouples them, so
`main` moves only by a release promotion. (Stated once here; later sections point back.)

## Agentic process (fluyt plugin)

This repo uses the **fluyt** plugin for its delivery process (its own dogfood — the plugin is
authored here and consumed from the installed release, `main` @ the marketplace `ref` pin). The
shared playbooks live in the plugin; this file stays the compact, client-neutral contract + the
routing that points at them. **Consult the matching skill before working in its area** instead of
working from memory. Claude Code invokes namespaced skills as `/fluyt:<name>`; Codex uses
`$fluyt:<name>` (or triggers from its description). Below, swap `/` for `$` when working in
Codex:

- **Starting a working session, or resuming after a context reset** — "run the project", "work the
  backlog", "drive the work", "you are the orchestrator" — the session posture and the ritual chain
  it routes to: `/fluyt:orchestrator`. Name the session `Fluyt` first (the `hub` skill, *Name your
  session after your repo*).
- **Running ONE cross-project hub session** that coordinates several project sessions (each still the
  orchestrator of its own repo): `/fluyt:hub`
- **Delivering a work item** (branch → PR → merge, version bump, close the issue):
  `/fluyt:ship-work-item`
- **Picking / filing / re-tiering backlog issues**: `/fluyt:backlog`
- **Cutting a release** (integration → release branch): `/fluyt:release`
- **Version + CHANGELOG discipline**: `/fluyt:versioning-and-changelog`
- **Retrospective on the agent team + workflow**: `/fluyt:scrum`
- **Found a bug in / want a feature for the shared plugin itself**: `/fluyt:report-upstream`
  (from THIS repo that usually means: file the backlog issue directly instead — the tracker is here)
- **Starting a brand-new project from scratch** (interview the shape, offer to create the repo and
  branches, then onboard it): `/fluyt:adopt-conventions` (from-scratch mode)
- **After updating the fluyt plugin — re-sync conventions** (pull in new Project Facts keys +
  changed shipped guidance): `/fluyt:adopt-conventions` (re-sync mode)
- **Protecting a branch** (a ruleset or classic protection on the integration or release branch,
  required status checks, which merge methods a branch allows) — or auditing the CI triggers that go
  with it: `/fluyt:branch-protection`
- **Plugin won't load / update on an embedded client, or checking which version is loaded**:
  `/fluyt:install-refresh-plugin`
- **About to dispatch a sub-agent** (detached or blocking? watch it or collect it?), **or a background
  one has gone quiet** — is it working, dead, or already handed back? Resume it or re-dispatch?:
  `/fluyt:agent-liveness`
- **Ending a session, or a context reset is coming** (an auto-compaction threshold, a manual reset, a
  long pause, handing off to another person or agent) — write a hand-over a successor can act on
  without reconstructing state from the transcript: `/fluyt:handover`. On resuming after one,
  read it before acting on anything a prior turn appears to have told you.
- **About to write or change a Claude Code hook** (a `hooks.json` entry, or any event hook that
  writes a file, stamps a time, or resolves a path) — read the authoring discipline BEFORE authoring,
  not once at onboarding: `/fluyt:hook-authoring`
- **Dispatching a canonical specialist role from Codex**: `/fluyt:dispatch-role`
- **The repo lives on Azure DevOps** (Project Facts `forge: azure-devops`) and a ritual step names
  GitHub or `gh`: `/fluyt:forge-azure-devops` (dead routing here — this repo is `forge: github`;
  kept so re-syncs stop re-proposing it)

Claude Code loads the team subagents directly as `fluyt:developer`,
`fluyt:product-owner`, `fluyt:preflight-reviewer`,
`fluyt:tech-debt-reviewer`, `fluyt:test-writer`, and `fluyt:scrum-master`.
Codex dispatches the same canonical role files through `$fluyt:dispatch-role`. Every role's
substantive report ends with a **"Skills consulted"** line naming the skill / rule files it read; a
missing line is worth questioning ("none" is legitimate only for a trivial mechanical task).

Notation in fluyt skills and agent files: `⇒` = implies (what follows, or what a system does); `→` =
then (the next step, or the action you take).

**Project-specific skills** stay in this repo under `.claude/skills/`: `/triage-upstream`
(maintainer-side triage of inbound `from-consumer` issues — see Task flow below),
`/arrow-notation` (applying the `⇒`/`→` legend to a skill or agent file, with the rewording tips
and proof steps), and `/trim-to-budget` (cutting a shipped file to its byte budget without
changing behaviour, including when to split a file and when not to).

## Project Facts (Fluyt contract v1 — this repo's own values)

Defaults are stated explicitly even where the shipped default would do: this repo authors the
rules, so a reader sees the value, not an inference.

- `project-name`: Fluyt
- `repo`: ArjenVanSilfhout/fluyt (public)
- `agent-clients`: both (Claude Code and Codex consume the same Project Facts contract)
- `forge`: github — the delivery ritual's forge-specific steps (backlog, PR/merge, issue-close
  linking, CI gate, branch protection) target GitHub. <!-- provenance: ratified -->
- `default-branch`: dev (integration == default, so `Closes #N` auto-fires on work-item merges;
  the consumer pin is explained in *What this repo is*; see DECISIONS.md, 2026-10-11)
- `integration-branch`: dev
- `release-branch`: main
- `build-cmd`: none (no build step)
- `test-cmd`: `pwsh -NoProfile -File scripts/validate-local.ps1` (local gate; CI is authoritative
  and runs the same script under `pwsh`). Three traps: run it under `pwsh` (PowerShell 7) — under
  `powershell` (5.1) "running scripts is disabled on this system" is an execution-policy limit, not
  a red gate, and `-ExecutionPolicy Bypass` is never the answer (`ship-work-item`'s
  `portability.md`); `Set-Location` to the repo root or pass an absolute script path, since the
  working directory can reset mid-session; and re-run it after committing — pre-commit, check
  `[11]` reports "no commits ahead to check", a green run in which that check never executed.
- `run-cmd`: none (no runnable app)
- `test-dir`: none (no unit-test project; validation is static)
- `backlog`: GitHub Issues on `ArjenVanSilfhout/fluyt`; tier labels `must`/`should`/`could`
  (canonical plain scheme) + `size:S/M/L`; milestones: no (solo, small); auxiliary: `tracking`,
  `question`
- `not-ready-labels`: none — only the built-in `blocked` skip is in use. <!-- provenance: ratified -->
- `release-milestones`: yes — the `release` skill stamps a `vX.Y.Z` GitHub Milestone per release and
  files that release's shipped issues under it (closed at release). Orthogonal to planning
  `milestones` (`no`). See DECISIONS.md, 2026-10-11.
- `release-tags`: yes — a human-facing marker, not the pin. See DECISIONS.md, 2026-10-11.
- `github-releases`: yes — the `release` skill publishes a GitHub Release (tag + CHANGELOG notes) per
  release. **Release titles carry a nautical codename** — `vX.Y.Z "Name"`; pick one in-theme at each
  cut, and do not reuse an earlier one. <!-- provenance: ratified @v1.3.1 -->
- `release-publish`: none — no package-registry publish, store upload, or deploy beyond the
  git-only release. <!-- provenance: ratified -->
- `changelog`: `CHANGELOG.md` (root). A version bump here and the
  `plugins/fluyt/.codex-plugin/plugin.json` mirror move in the SAME edit batch — gate check
  `[3]` reds otherwise; an inline CHANGELOG edit with no delegate checklist is where the mirror is
  easiest to miss.
- `decisions`: `DECISIONS.md` (root)
- `handover`: `docs/process/HANDOVER.local.md` <!-- provenance: ratified @v1.3.1 --> — git-ignored by
  default (the `.gitignore` `docs/process/*.local.md` glob; gate check `[13]` fails if one is ever
  tracked), so a hand-over never lands in history.
- `version-rules`: MINOR (X.Y.0) = a **shipped component's behaviour changes** — a skill, agent,
  hook, or template gains or changes an instruction, step, or output a consumer follows. PATCH
  (X.Y.Z) = wording / clarification / formatting / typo in a shipped file that changes no instruction
  a consumer follows, plus all scripts, CI, docs, and repo housekeeping — even when multi-file. The
  test is **behaviour, not which file changed**. MAJOR = a breaking change to a consumer's setup.
  (Rationale: DECISIONS.md, 2026-10-11.)
- `commit-subject`: `<type-or-id>: <summary> (vX.Y.Z)` — version stamped in the subject; at most
  72 characters including the stamp and the squash merge's `(#<PR>)` suffix (the shipped
  default). <!-- provenance: ratified @v1.3.1 -->
- `co-author-trailers`: forbidden (maintainer identity only — no Co-Authored-By lines, ever)
- `git-identity`: none — no identity check; the maintainer's git identity is the only one in use.
- `pr-approvals`: none — solo maintainer; requiring `1` would deadlock with nobody else to approve.
  <!-- provenance: ratified -->
- `delegation`: default — the main agent **orchestrates**; a spawned `developer` implements. The
  inline escape hatch still applies to a genuinely trivial change (one file, no new logic, a
  handful of lines, no test) — see `ship-work-item` §1. Orthogonal to `worktree-isolation`:
  `delegation` is *who* implements, not *where*.
- `worktree-isolation`: on-demand <!-- provenance: ratified -->
- `adversarial-coverage`: on-demand — the `ship-work-item` §1 Adversarial coverage pass stays
  optional, its own RUN/SKIP criteria deciding; Fluyt ships no product code, so `default`'s
  invariant-touching trigger could never fire.
- `test-budget`: advisory — `preflight-reviewer`'s *Test diff* findings stay non-blocking.
- `visual-verification`: none — no rendering surface. <!-- provenance: ratified -->
- `report-upstream`: on — moot in practice: the upstream tracker IS this repo's backlog.
- `agent-routing`: labels — **the maintainer's override of the recommended `none`.** Issues MAY carry
  `model:<tier>` / `agent:<type>` routing labels: `ship-work-item` reads an issue's `model:*` label
  and spawns the implementer at that tier, overriding the spawn-tier frontmatter default (absent →
  the default stands); `agent:*` is advisory only, not a dispatcher. The label families are seeded
  by the shipped labels script (`adopt-conventions` templates, `github-labels.ps1 -AgentRouting`).
  <!-- provenance: chosen -->
- `pinned-deps`: none — no upstream dependency this repo pins to an immutable release.
  <!-- provenance: ratified -->
- `notes`: Node, npm and the `claude` CLI are expected locally; `markdownlint-cli2` and
  PSScriptAnalyzer may not be, so those two CI linters have no local equivalent — run
  `npx --yes markdownlint-cli2 <changed files>` by hand before pushing. `claude plugin validate`
  checks **manifests only**, not skill or agent frontmatter, so it is no substitute for the gate's
  own frontmatter checks.

## Deliberate deviations from the shared playbook

Precedence — what this file may override and what it may not — is `ship-work-item`, *Precedence*:
a shared **default** bends to this file; a shared **gate** never does, and an entry that narrows
one is not a deviation (honour the gate, surface the conflict, file the backlog issue). This repo
keeps no separate deviation register: divergences are recorded **at the Project Facts keys
themselves** (e.g. `agent-routing`) and as dated entries in `DECISIONS.md`.

## Invariants (non-negotiable)

- **Zero project facts in `plugins/`.** No product or project names, framework, runtime or
  build-tool names, product-code paths, build commands, or **consumer** repo slugs anywhere under
  `plugins/`. Shared assets reference the consumer's Project Facts block by key name and
  STOP-and-ask when a needed key is missing. A **sanctioned self-reference** names the plugin's OWN
  identity or home — its slug, its repo, its author, its manifest metadata — never a consumer fact;
  re-derive the current sites with `grep -rlE "fluyt|ArjenVanSilfhout" plugins/` and judge each
  against that test rather than a stale enumeration. Gate check `[7]` enforces this **by shape**,
  minus `scripts/plugin-vocabulary-allowlist.txt` — the one list to maintain, and its trigger is the
  PLUGIN's vocabulary changing, never a consumer adopting. Identifying terms are listed nowhere in
  the repo (the optional pre-push hook `scripts/hooks/pre-push` reads a denylist you keep outside
  it). Run the gate before any `plugins/` commit. Rationale: DECISIONS.md, 2026-10-11.
- **A citation in a shipped asset must resolve for whoever RECEIVES it, not for whoever wrote it.**
  A consumer gets the payload and their own repo — not this tracker and not this `DECISIONS.md` —
  so inside `plugins/` a bare `#<issue>` or a "see the marketplace `DECISIONS.md`" pointer is
  dangling. **Cite a version instead** (`until v1.2.0`), or state the reasoning without the
  pointer. This is an **audience** rule; `versioning-and-changelog`'s resolvability rule is the
  *timing* half, and both apply. **Illustrative placeholders are exempt** (`- [ ] #18` in an epic
  template, a worked example). Rationale: DECISIONS.md, 2026-10-11.
- **Every component change updates `CHANGELOG.md`** (newest first) and bumps `Current version:`,
  with the Codex mirror in the same edit (gate checks `[3]` and `[8]`).
- **Never add a `version` field to `.claude-plugin/plugin.json`.** Claude track-main is deliberate; a
  stale explicit version silently blocks consumer auto-updates. Codex is the scoped exception:
  `.codex-plugin/plugin.json` requires strict SemVer, mirrors `CHANGELOG.md`, and fails validation on
  drift (see DECISIONS.md, 2026-10-11).
- **Component dirs live at plugin root** (`plugins/fluyt/skills|agents|hooks`), never inside
  `.claude-plugin/` or `.codex-plugin/`.
- **Risky work goes through `dev` + a PR** and reaches `main` only via a release promotion (*What
  this repo is*). CI validates every push and PR.

## Code style

- Markdown prose wraps at ~100 columns, matching the surrounding file; **bold** carries the
  load-bearing clause of a rule.
- Repo-side files (scripts, CI, this file, `DECISIONS.md`) deliberately carry dense rationale
  comments citing decisions (DECISIONS.md dates), as `.github/workflows/validate.yml` exemplifies.
  This consciously overrides the shared no-rationale-comments default: process assets ARE this
  repo's product, so the recorded reasoning is the maintenance surface, not noise.
- Shipped files under `plugins/` follow the Invariants above instead (cite versions, never bare
  `#N`).
- **Made-up names are generic and follow one naming theme** — skills, templates, tests and
  fixtures use invented repo, project and component names, never a real repo name or a real issue
  number. The theme: names that relate to Dutch maritime history yet read like modern tooling, the
  way container tooling borrows shipping terms. **Use English words of Dutch maritime origin, never
  actual Dutch words** (yacht, sloop, yawl, scow, smack, skipper, commodore, splice, boom, buoy,
  dock, freight, bowsprit, cruise, maelstrom), and **check each against an etymology source before
  first use** — the pool above is candidates, not verified. **Steer clear of anything tied to
  slavery, colonialism, piracy or punishment** (that rules out keelhaul and filibuster). Syntax
  placeholders such as `<owner/repo>` or `#N` are not names and stay as they are.
- **State once, point thereafter:** a fact is stated in full once per file; later same-file mentions
  point rather than restate. Deliberate safety repetition, mnemonics, and point-of-use duplication
  stay sanctioned when the text marks them as deliberate.
- Otherwise match the surrounding file's density and idiom.

## Git

- Branches: `main` (release) + `dev` (integration/default — roles in Project Facts above). Typed
  work branches off `dev`, named per `ship-work-item` §0 (`<type>/i<N>-<slug>`).
- Commit subjects follow `commit-subject`; the MINOR/PATCH split follows `version-rules`; the
  CHANGELOG moves with the bump (Project Facts and Invariants, above).

## Task flow

Work items live in the `backlog` (Project Facts, above), picked in the `backlog` skill's selection
order; the shipped `ship-work-item`, `backlog`, `release`, and `versioning-and-changelog` skills
describe the exact process this repo follows.

Inbound consumer feedback (issues labelled `from-consumer`, filed from other repos via the shipped
`/fluyt:report-upstream` skill) is triaged **on demand** with the local `/triage-upstream` skill;
it plans only — turning a triaged item into a change is the normal `ship-work-item` flow.

## Ask the human when

An irreversible design fork appears (e.g. adding a `version` field, flipping the default branch,
splitting the plugin); a design or tuned-value decision is not **sourced** — no written record of the
human's decision states the value actually used; any destructive or irreversible operation on data or
history is about to run (deletions, force-pushes, history rewrites, mass regeneration); or the work is
only possible in an external tool or console — file it as a `question` issue and/or ask in-session,
and log durable outcomes in `DECISIONS.md`.

**Otherwise, keep working.** An authorized scope of work — "work the backlog", a named tier, "do
these N" — is a standing mandate to proceed item-to-item without re-confirming between items, on
the scope-grant terms `ship-work-item` states under *Continue autonomously across a scope* (a scope
never widens; a grant lives only for the stretch that opened it). Landing items to the integration
branch is in-scope; **cutting a release is not** — that keeps its own confirm step
(`/fluyt:release`), as does filing upstream (`/fluyt:report-upstream`).
