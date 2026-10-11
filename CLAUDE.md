# Fluyt — working agreement

## What this repo is

A **dual Claude Code + Codex plugin marketplace**. It ships ONE plugin, `fluyt`:
client-agnostic agentic-development process assets (skills, canonical team roles, five Claude Code
hooks, and scaffolding templates) that **any project** imports instead of re-implementing the same
delivery ritual. Nothing in it is specific to one kind of project.

**There is no build step. The git repo IS the artifact.** Both clients install from this repo and
track `main` (pinned via marketplace ref — **not** the default branch, which is `dev`). Claude's
manifest stays versionless and tracks the branch tip; Codex's required strict-semver manifest mirrors
the CHANGELOG current version.

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
  it routes to: `/fluyt:orchestrator`. **First, check the session title: if it is not
  `Fluyt`, rename it** (`set_session_title`) — the hub addresses sessions by name, so an unnamed
  session is unreachable.
- **Running ONE cross-project hub session** that coordinates several project sessions (each still the
  orchestrator of its own repo) — the hub repo, the message protocol, relaying decisions, and the
  authority boundary: `/fluyt:hub`
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
  GitHub or `gh` — translate that step, not the ritual: `/fluyt:forge-azure-devops` (dead
  routing here — this repo is `forge: github` — kept for skeleton parity so re-syncs stop
  re-proposing it)

Claude Code loads the team subagents directly as `fluyt:developer`,
`fluyt:product-owner`, `fluyt:preflight-reviewer`,
`fluyt:tech-debt-reviewer`, `fluyt:test-writer`, and `fluyt:scrum-master`.
Codex dispatches the same canonical role files through `$fluyt:dispatch-role`. Every role's
substantive report ends with a **"Skills consulted"** line naming the skill / rule files it read; a
missing line is worth questioning ("none" is legitimate only for a trivial mechanical task).

**Project-specific skills** stay in this repo under `.claude/skills/`: `/triage-upstream`
(maintainer-side triage of inbound `from-consumer` issues — see Task flow below) and
`/arrow-notation` (applying the `⇒`/`→` legend to a skill or agent file, with the rewording tips
and proof steps).

## Project Facts (Fluyt contract v1 — this repo's own values)

- `project-name`: Fluyt
- `repo`: ArjenVanSilfhout/fluyt (public)
- `agent-clients`: both (Claude Code and Codex consume the same Project Facts contract)
- `forge`: github — the delivery ritual's forge-specific steps (backlog, PR/merge, issue-close
  linking, CI gate, branch protection) target GitHub; stated explicitly per this repo's
  state-the-default house style. <!-- provenance: ratified -->
- `default-branch`: dev (integration == default, so `Closes #N` auto-fires on work-item merges;
  consumers do NOT ride the default — they pin `main` via the marketplace
  `ref`; see DECISIONS.md, 2026-10-11)
- `integration-branch`: dev
- `release-branch`: main
- `build-cmd`: none (no build step)
- `test-cmd`: `pwsh -NoProfile -File scripts/validate-local.ps1` (local gate; CI is authoritative —
  and CI's own runner invokes the script under `pwsh` too). Four facts govern actually RUNNING it,
  each with its failure signature. **The host decides whether it runs at all**: `pwsh` (PowerShell 7)
  runs it in the agent Bash sandbox, while `powershell` (Windows PowerShell 5.1) refuses with
  "running scripts is disabled on this system" (reads like a red gate, is really a 5.1
  execution-policy limit). From a real PowerShell either spelling works. Never add `-ExecutionPolicy
  Bypass` — a security classifier denies it and `ship-work-item`'s portability notes forbid it; the
  sanctioned invocation already runs without it. `Set-Location` to the repo root (or pass an
  absolute script path) first — the working directory can reset mid-session, failing
  "scripts/validate-local.ps1 ... does not exist" (reads like a missing file, isn't). Re-run it again
  after committing — pre-commit, check `[11]` reports "no commits ahead to check", a green run in
  which the commit-identity check never executed; a green run never proves a check ran.
- `run-cmd`: none (no runnable app)
- `test-dir`: none (no unit-test project; validation is static)
- `backlog`: GitHub Issues on `ArjenVanSilfhout/fluyt`; tier labels `must`/`should`/`could`
  (canonical plain scheme) + `size:S/M/L`; milestones: no (solo, small); auxiliary: `tracking`,
  `question`
- `not-ready-labels`: none — only the built-in `blocked` skip is in use; no other label excludes an
  issue from picking. <!-- provenance: ratified -->
- `release-milestones`: yes — the `release` skill stamps a `vX.Y.Z` GitHub Milestone per release and
  files that release's shipped issues under it (closed at release). Orthogonal to planning `milestones`
  (`no` — this repo picks work by tier, not by milestone; the per-release milestones only record
  what shipped). See DECISIONS.md, 2026-10-11.
- `release-tags`: yes — Fluyt publishes tagged GitHub Releases for visibility (see
  `github-releases`); consumers still pin the `main` branch tip, so the tag is a human-facing marker,
  not the pin. See DECISIONS.md, 2026-10-11.
- `github-releases`: yes — the `release` skill publishes a GitHub Release (tag + CHANGELOG notes) per
  release. See DECISIONS.md, 2026-10-11. **Release titles carry a nautical codename** —
  `vX.Y.Z "Name"`; pick one in-theme at each cut, and do not reuse an earlier one. Recorded here so
  precedent-copying cannot drop it. <!-- provenance: chosen -->
- `release-publish`: none — no package-registry publish, store upload, or deploy beyond the
  git-only release. <!-- provenance: ratified -->
- `changelog`: `CHANGELOG.md` (root). A version bump here and the
  `plugins/fluyt/.codex-plugin/plugin.json` mirror move in the SAME edit batch — gate check
  `[3]` reds otherwise; an inline CHANGELOG edit with no delegate checklist is where the mirror is
  easiest to miss.
- `decisions`: `DECISIONS.md` (root)
- `handover`: `docs/process/HANDOVER.local.md` <!-- provenance: chosen --> — git-ignored by default
  (the `.gitignore` `docs/process/*.local.md` glob; gate check `[13]` fails if one is ever tracked),
  so a hand-over never lands in history.
- `version-rules`: MINOR (X.Y.0) = a **shipped component's behaviour changes** — a skill, agent,
  hook, or template gains or changes an instruction, step, or output a consumer follows. PATCH
  (X.Y.Z) = wording / clarification / formatting / typo in a shipped file that changes no instruction
  a consumer follows, plus all scripts, CI, docs, and repo housekeeping — even when multi-file. The
  test is **behaviour, not which file changed**: did what a consumer loads and follows change? No →
  PATCH. A **MAJOR** bump is a breaking change to a consumer's setup. (Fluyt's product IS its
  process assets, so this deliberately mirrors the behaviour axis the shipped
  `versioning-and-changelog` skill defines — see DECISIONS.md, 2026-10-11.)
- `commit-subject`: `<type-or-id>: <summary> (vX.Y.Z)` — version stamped in the subject; at most
  72 characters including the stamp and the squash merge's `(#<PR>)` suffix (the shipped
  default). <!-- provenance: chosen -->
- `co-author-trailers`: forbidden (maintainer identity only — no Co-Authored-By lines, ever)
- `pr-approvals`: none — solo maintainer; requiring `1` would deadlock with nobody else to approve.
  <!-- provenance: ratified -->
- `delegation`: default — the main agent **orchestrates**; a spawned `developer` implements. Stated
  explicitly rather than relying on the absent-key default, because this repo is where the rule is
  authored. The inline escape hatch still applies to a genuinely trivial change (one file, no new
  logic, a handful of lines, no test) — see `ship-work-item` §1. Orthogonal to `worktree-isolation`
  below: `delegation` is *who* implements, not
  *where*.
- `worktree-isolation`: on-demand — already asserted in prose at the `delegation` entry above; stated
  here as its own key so a re-sync reads it directly instead of inferring it from another key's aside.
  <!-- provenance: ratified -->
- `adversarial-coverage`: on-demand — the `ship-work-item` §1 Adversarial coverage pass stays
  optional, its own RUN/SKIP criteria deciding. Stated explicitly, the `delegation` precedent: named
  where the key is authored. `on-demand` rather than `default` because Fluyt ships no product
  code of its own — its product is process assets — so there is no invariant-touching product-code
  slice for `default`'s trigger to ever fire on.
- `visual-verification`: none — no rendering surface; the plugin ships process assets, not a
  GUI/visualization product. <!-- provenance: ratified -->
- `agent-routing`: labels — **the maintainer's override of the recommended `none`.** Issues MAY carry
  `model:<tier>` / `agent:<type>` routing labels: `ship-work-item` reads an issue's `model:*` label
  and spawns the implementer at that tier, overriding the spawn-tier frontmatter default (absent →
  the default stands); `agent:*` is advisory only, not a dispatcher. The label families themselves
  are seeded by the labels script (`github-labels.ps1 -AgentRouting`). <!-- provenance: chosen -->
- `pinned-deps`: none — no upstream dependency this repo pins to an immutable release.
  <!-- provenance: ratified -->
- `notes`: Node, npm and the `claude` CLI are expected locally; `markdownlint-cli2` and
  PSScriptAnalyzer may not be, so those two CI linters have no local equivalent.
  `scripts/validate-local.ps1` is the dual-package local gate; CI runs authoritative Claude
  validation plus the same Codex structural/version/inventory checks. Note the `claude` CLI buys
  less than it sounds: `claude plugin validate` checks **manifests only** and does not check skill
  or agent frontmatter — so it is no substitute for the gate's own frontmatter checks. Tool
  availability varies by machine, so re-run `where.exe <tool>` from a real PowerShell before
  relying on it (the agent Bash tool can resolve tools the real machine lacks).

## Deliberate deviations from the shared playbook

This file **overrides a shared `fluyt` default** — the plugin's skills are the default, not the
authority. It does **not** override a shared **gate**: the stops `ship-work-item` lists under *Surface
mid-scope only for a real decision*, together with the scope-grant guardrails restated under **Ask the
human when** below. Those are what keep an agent from
deciding alone what only the human can decide. **An entry that narrows a gate is not a deviation and
does not belong here** — an agent that meets one honours the gate, surfaces the conflict, and does not
act on the entry. If a project genuinely needs a gate relaxed, raise it upstream — in this repo that
means filing the backlog issue directly.

This repo keeps no separate prose register: divergences are recorded **at the Project Facts keys
themselves** (e.g. `agent-routing`, the maintainer's override of the recommended default) and as dated
entries in `DECISIONS.md` — per the skeleton's keep-your-own-register rule, that existing register
stays where it is rather than being duplicated here.

## Invariants (non-negotiable)

- **Zero project facts in `plugins/`.** No product or project names, framework, runtime or
  build-tool names, product-code paths, build commands, or **consumer** repo slugs anywhere under
  `plugins/`. Shared
  assets reference the consumer's Project Facts block by key name and STOP-and-ask when a needed key
  is missing. A **sanctioned self-reference** names the plugin's OWN identity or home — its slug,
  its repo, its author, its manifest metadata — never a consumer fact, and is permitted wherever
  the plugin must name itself (distinct from *citing* a source, which the next rule governs). That
  is a test, not a fixed count: re-derive the current sites with
  `grep -rlE "fluyt|ArjenVanSilfhout" plugins/` and check each hit against
  the test above, rather than trusting an enumeration that goes stale as the plugin grows. See
  DECISIONS.md, 2026-10-11. `scripts/validate-local.ps1` check `[7]` enforces this **by shape**: it flags
  anything under `plugins/` that looks like a project fact — slug-shaped identifiers, framework /
  runtime / build-tool names, absolute and drive-letter paths — and subtracts
  `scripts/plugin-vocabulary-allowlist.txt`, the plugin's own legitimate vocabulary. **That
  allowlist is the one list to maintain, and its trigger is the PLUGIN's vocabulary changing** (a new
  agent-client tool name, a new shipped snippet, a new product the plugin must name) — never a
  consumer adopting. A forgotten entry there is a false RED; an enumerate-the-consumers denylist
  would fail the other way, staying green on any consumer it does not list. **Identifying terms**
  are listed nowhere in the repo: the optional local pre-push hook `scripts/hooks/pre-push` blocks a
  push containing any term from a denylist file you keep outside the repo, so publishing the hook
  never publishes the terms. There is no
  in-repo denylist, so **nothing is appended when a consumer adopts**. Run the gate before any
  `plugins/` commit.
- **A citation in a shipped asset must resolve for whoever RECEIVES it, not for whoever wrote it.**
  A consumer gets the plugin payload and their own repo — not this tracker, and not this
  `DECISIONS.md`. So a bare `#<issue>` or a "see the marketplace `DECISIONS.md`" pointer inside
  `plugins/` is dangling *for its actual reader*, however well it resolves here. **Cite a version
  instead** (`until v1.2.0`) — it resolves for them through the payload manifest's `version` and the
  public CHANGELOG, which the payload itself does not carry — or state the reasoning without the
  pointer; a justification that needs an unreachable reference to stand up was not carrying its own
  weight. This is an **audience** rule, distinct from the resolvability rule in
  `versioning-and-changelog` (which is about *timing* — citing something not yet recorded — and is
  checked against this repo's own tree). Both apply; neither substitutes for the other. **Illustrative
  placeholders are exempt** and must stay readable as such — `- [ ] #18` in an epic template, or a
  worked example — because the fix is to make citations resolvable, not to ban the character sequence.
- **Every component change updates `CHANGELOG.md`** (newest first) and bumps `Current version:`.
  The Codex mirror moves in the same edit, so gate checks `[3]` and `[8]` stay green.
- **Never add a `version` field to `.claude-plugin/plugin.json`.** Claude track-main is deliberate; a
  stale explicit version silently blocks consumer auto-updates. Codex is the scoped exception:
  `.codex-plugin/plugin.json` requires strict SemVer, mirrors `CHANGELOG.md`, and fails validation on
  drift (see DECISIONS.md, 2026-10-11).
- **Component dirs live at plugin root** (`plugins/fluyt/skills|agents|hooks`), never inside
  `.claude-plugin/` or `.codex-plugin/`.
- Consumers on both clients are pinned to `main` (the release branch), so **risky work goes
  through `dev` + a PR** and reaches `main` only via a release promotion.
  `dev` being the default branch does NOT expose it to consumers — the `ref` pin decouples them. CI
  validates every push and PR.

## Code style

- Markdown prose wraps at ~100 columns, matching the surrounding file; **bold** carries the
  load-bearing clause of a rule.
- Repo-side files (scripts, CI, this file, `DECISIONS.md`) deliberately carry dense rationale
  comments citing decisions (DECISIONS.md dates), as
  `.github/workflows/validate.yml` exemplifies. This consciously overrides the shared
  no-rationale-comments default: process assets ARE this repo's product, so the recorded reasoning is
  the maintenance surface, not noise.
- Shipped files under `plugins/` follow the Invariants above instead (cite versions, never bare
  `#N`).
- **Made-up names are generic and follow one naming theme** — skills, templates, tests and
  fixtures use invented repo, project and component names, never a real repo name or a real issue
  number. The theme: names that relate to Dutch maritime history yet
  read like modern tooling, the way container tooling borrows shipping terms. **Use English words of Dutch maritime
  origin, never actual Dutch words** (yacht, sloop, yawl, scow, smack, skipper, commodore, splice,
  boom, buoy, dock, freight, bowsprit, cruise, maelstrom), and **check each against an etymology
  source before first use** — the pool above is candidates, not verified. **Steer clear of
  anything tied to slavery, colonialism, piracy or punishment** (that rules out keelhaul and
  filibuster). Syntax placeholders such as `<owner/repo>` or `#N` are not names and stay as they
  are.
- **State once, point thereafter:** a fact is stated in full once per file; later same-file mentions
  point rather than restate. Deliberate safety repetition, mnemonics, and point-of-use duplication
  stay sanctioned when the text marks them as deliberate.
- Otherwise match the surrounding file's density and idiom.

## Git

- Branches: `main` (release) + `dev` (integration/default — roles and the auto-close rationale are
  in Project Facts above). Typed work branches off `dev`: `feat/<slug>`, `fix/<slug>`,
  `chore/<slug>`, `docs/<slug>`.
- Commit subjects follow `commit-subject`; the MINOR/PATCH split follows `version-rules` (Project
  Facts, above). Update `CHANGELOG.md` with the bump.
- **No Co-Authored-By lines. Ever.**
- Dogfood: once self-installed, Fluyt's own changes use `/fluyt:ship-work-item`.

## Task flow

Work items live in the `backlog` (Project Facts, above); a `bug`-labelled issue jumps any tier,
smallest first. This repo eats its own dog food — the shipped `ship-work-item`, `backlog`,
`release`, and `versioning-and-changelog` skills describe the exact process this repo follows.

Inbound consumer feedback (issues labelled `from-consumer`, filed from other repos via the shipped
`/fluyt:report-upstream` skill) is triaged **on demand** with the local `/triage-upstream`
skill (`.claude/skills/`): it finds untriaged `from-consumer` issues, inspects the targeted plugin
component, posts a triage plan as a comment, and tiers each into the backlog. It plans only — turning
a triaged item into a change is the normal `ship-work-item` flow.

## Ask the human when

An irreversible design fork appears (e.g. adding a `version` field, flipping the default branch,
splitting the plugin); a design or tuned-value decision is not **sourced** — no written record of the
human's decision states the value actually used; any destructive or irreversible operation on data or
history is about to run (deletions, force-pushes, history rewrites, mass regeneration); or the work is
only possible in an external tool or console — file it as a `question` issue and/or ask in-session,
and log durable outcomes in `DECISIONS.md`.

**Otherwise, keep working.** When none of the above applies, an authorized scope of work — "work the
backlog", a named tier, "do these N" — is a standing mandate to proceed item-to-item; agents do
**not** re-confirm between backlog items. Guardrails: a scope never widens (one tier does not roll
into the next; a named set does not grow into the backlog), "keep going" resumes the scope already in
flight rather than opening a wider one, and a grant is live only for the continuous stretch it opened
— re-confirm after a context reset, an intervening instruction, or a long gap. Landing items to the
integration branch is in-scope; **cutting a release is not** — that keeps its own confirm step
(`/fluyt:release`), as does filing upstream (`/fluyt:report-upstream`). Full doctrine:
`/fluyt:ship-work-item`.
