# fluyt

The client-agnostic agentic-development process, packaged for Claude Code and Codex from one payload.
It carries the delivery ritual, backlog conventions, release process, retrospectives, versioning
discipline, six canonical team roles, and client scaffolding — with **zero project-specific facts**. Everything is
parameterized against the consumer repo's **Project Facts** block (see
`docs/consumer-integration.md` in the marketplace root).

## Components

### Skills (`/fluyt:<name>` on Claude Code; `$fluyt:<name>` on Codex)

| Skill | What it is |
| --- | --- |
| `orchestrator` | The top-level session posture for the main agent: a thin router that names the ritual chain (hand-over → backlog → ship-work-item → agent-liveness → loop → release only on the human's call → hand-over) and the thirteen posture rules, each ending in the component that owns it. Restates none of them but rule 13. |
| `hub` | Run ONE cross-project hub session that coordinates several project sessions, each still the orchestrator of its own repo: the hub repo (an ops notebook, no versioning), the session message protocol, verbatim decision relay, the authority boundary (a relayed answer is approval only where the user said so in that session's own chat; no permission laundering), roster hygiene, verification, and the context watch. Routes to `orchestrator` and `handover`. |
| `ship-work-item` | The end-to-end delivery ritual: pick an issue, branch off the integration branch, implement, test, CHANGELOG + version bump, `Closes #N` in the PR body, PR, fire-and-forget auto-merge, post-merge close check. |
| `backlog` | GitHub-Issues backlog conventions: reads the tier-label scheme + milestones flag from Project Facts, selection order, atomic filing, hygiene scan. |
| `release` | Promote the integration branch to the release branch with a **merge commit** (never squash) and tag, when Project Facts `release-tags` says so. |
| `scrum` | Run a retrospective on the agent team + workflow; proposes, never auto-applies. |
| `versioning-and-changelog` | The CHANGELOG-as-source-of-truth and version-bump reference. |
| `adopt-conventions` | Scaffolds a consumer repo — instantiates the Project Facts block and conventions non-destructively. Three modes: from-scratch (interview the shape, offer to create the repo and branches), first-time adopt, and re-sync. |
| `branch-protection` | The repo-configuration playbook `adopt-conventions` routes to: offer or audit a ruleset (or classic protection) on the integration and release branches, pick the per-role merge methods, decide what CI must report — and audit the GitHub Actions triggers while you are there. |
| `report-upstream` | File a bug or feature request UPSTREAM about the plugin itself (a shared skill/agent/hook/template) to the plugin's home repo, with provenance and the right labels; web-form fallback. |
| `install-refresh-plugin` | Install, refresh, and diagnose the plugin using the active client's manifests, cache, and restart boundary. |
| `agent-liveness` | States the two standing spawn defaults — dispatch detached, never watch what is running — then decides whether a quiet background sub-agent is still working, has died, or has already handed back: which signals lie, which two tell the truth, and when to resume a completed agent rather than re-dispatch. |
| `handover` | Write a session hand-over a successor can act on without the transcript: the questions it must answer, written from the tree, location from Project Facts `handover`; mid-item it is written but never committed. |
| `hook-authoring` | Discipline for authoring a Claude Code hook: own your output file, stamp in the right timezone, resolve the repo root correctly, fail silently on purpose, and know whether you're counting a tripwire or a metric. |
| `dispatch-role` | Load one canonical `agents/*.md` contract and dispatch it through Codex's supported subagent mechanism. |
| `forge-azure-devops` | The Azure DevOps forge adapter for consumers with Project Facts `forge: azure-devops`: translates the canonical rituals' GitHub/`gh` steps to `az` — Boards work items, PR auto-complete, work-item close-linking (with the inverted over-close trap), build-validation policies, branch security, bearer-token auth. Recipes are unverified. |

### Specialist roles

`developer`, `product-owner`, `preflight-reviewer`, `tech-debt-reviewer`, `test-writer`, and
`scrum-master`. Claude Code loads them directly as `fluyt:<name>`. Codex uses
`dispatch-role`, which reads these same files rather than copying them into custom-agent TOML. Each
role reads the consumer's `CLAUDE.md` + Project Facts and the skills it names.

### Hooks

`hooks/hooks.json` registers five hooks. **These are Claude Code hooks only** — Codex has no hook
mechanism, so on Codex the process rules the hooks enforce remain prose-only (the skills stay the
cross-client authority; a hook is prevention layered in front of them, never their replacement).

**Prerequisite: Node.js 18 or later on `PATH`.** Every hook is a `node -e` one-liner, so without
Node none of them does its job. Each checks for `node` before anything else and, when it is
missing, still lets the session proceed but says so, rather than passing for a considered allow:
each `PreToolUse` hook prints a one-line `systemMessage` naming itself
(`fluyt hook skipped: node is not on PATH, so the <hook> did not run`), and `SubagentStop` writes
its line tagged `(fallback: node not on PATH)` instead of the generic `(fallback)`. Every other
failure stays exactly as fail-open as that hook's own paragraph below describes.

**Network and credentials, per hook:** two hooks reach the network, both through `gh` on the
user's existing `gh` login, with a 10 s timeout — the closing-keyword echo (`gh pr view`) and the
open-PR branch-delete guard (`gh pr list`). The other three (`SubagentStop`, the co-author guard,
the CHANGELOG-entry guard) use neither the network nor any credential; the CHANGELOG-entry guard
runs local `git` only. No hook sends anything anywhere else.

**`SubagentStop`** — when any subagent finishes, it appends a
timestamped one-line breadcrumb — enriched with the subagent's type when available — to
`docs/process/dispatch.local.md` under the consumer's project directory (creating `docs/process/`
if needed). This is the dispatch-cadence feed the `scrum` skill reads for retrospectives, kept
separate from `docs/process/retro-log.local.md` (human-appended friction notes) so that file stays
100% signal. Both files are meant to be **git-ignored** in the consumer (added by
`adopt-conventions` to `.gitignore`); the hook is fail-soft — it degrades to a
`(fallback)`-tagged timestamp and never blocks the session if it cannot parse or enrich (tagged
`(fallback: node not on PATH)` when `node` is missing, per the prerequisite above).

**`PreToolUse` (Bash)** — blocks a `git commit` command carrying a `Co-Authored-By` trailer, but
**only** when the consumer's `CLAUDE.md` declares `co-author-trailers: forbidden`; any other value,
an absent key, an unresolvable `CLAUDE.md`, or any internal error allows silently (fail-open by
design — the consumer's own post-hoc checks remain the detectors of record). It resolves the
consumer's `CLAUDE.md` by walking up from the tool call's working directory to a directory holding
both `CLAUDE.md` and `.git`, falling back to the session's project directory. One footnote: the
walk-up expects the working directory in the OS-native path form the client supplies; a
POSIX-mount-style path (e.g. an MSYS `/c/...` form fed in by hand) falls into the same silent
fail-open path as an unresolvable file.

**`PreToolUse` (Bash, closing-keyword echo)** — informational, never blocking: fires when the Bash
command matches `gh pr merge`, parses the PR number out of the command text (a bare `#<n>`/`<n>`
token, or a `.../pull/<n>` URL), and re-runs the `ship-work-item` §4 body grep — the ritual's exact
flatten-then-match pattern, not a reimplementation of it — against that PR's body, surfacing every
hit. Zero hits is surfaced too (fine for a no-issue chore, wrong for anything that should close its
issue); a command with no parseable PR number, or a failed, absent, or timed-out `gh` call, surfaces a
loud message pointing the reader at running the §4 grep themselves rather than silently guessing.
**The message rides both documented channels: `systemMessage`, which the Claude Code hooks reference
(code.claude.com/docs/en/hooks) describes as a message shown to the user, and
`hookSpecificOutput.additionalContext`, which that page's *PreToolUse decision control* table
documents for this event as a string added to the model's context alongside the tool result** — so
the human reading the transcript and the agent about to arm the merge both see the hits. It returns
no `permissionDecision`, so the normal permission flow is untouched. So this is a second-pair-of-eyes aid alongside the ritual's own pre-arm
grep step, never a substitute for running it. It exits 0 on every path (fail-open) and, by design,
never gates the merge.

**`PreToolUse` (Bash, CHANGELOG-entry guard)** — informational, never blocking: fires when the Bash
command runs `git commit` in **command position** (line start, or after `;`, `&&`, `|`, a newline,
or inside `$(…)`; a mention in prose, or in the body of a data heredoc, does not count) and that
commit's **staged** diff includes the consumer's changelog. It names today's **UTC** date, compares
it against the date on the first `##` heading carrying an ISO date in the staged file — brackets, a
leading `v`, and dash / colon / paren separators are all accepted, and the first such heading wins —
and appends the measured-figures reminder, so both `versioning-and-changelog` rules that
apply at the entry-writing moment (entries are dated UTC; a figure carried from a report or brief
is not a source) arrive where the entry is being written. Verdicts are `OK`, `MISMATCH`, or "no
dated `##` heading found". A MISMATCH has two legitimate causes — an entry authored before 00:00 UTC
and committed after, and a later-day commit touching an already-dated entry — so it says *check the
entry date* rather than *fix it*. The changelog path comes from the consumer's Project Facts
`changelog` key, resolved by the same `CLAUDE.md` walk-up as the co-author-trailer hook above, and
**defaults to `CHANGELOG.md` at the repo root** when the key or the file is unresolvable — so a
silent run always means broken, never undeclared. The view is the index; an all-flag commit (`-a`,
`--all`, `-am`) also consults unstaged tracked changes and reads the working-tree file instead. It
rides the same two channels as the closing-keyword echo above, returns no `permissionDecision`, and
exits 0 on every path (fail-open). **Control case: a commit that stages the changelog and prints
nothing is a broken hook, not a quiet one.**

**`PreToolUse` (Bash, open-PR branch-delete guard)** — **blocking**: fires when the Bash command
deletes a branch (`git branch -d`/`-D`/`--delete`, `git push --delete`, or a `:<ref>` push) and
`gh pr list --head <ref> --state open` reports that branch is the head of an open PR, because
deleting it closes the PR unmerged. The denial names each PR and points at the `ship-work-item` §4
step 6 gate (`gh pr view <n> --json state` must read `MERGED` first). When `gh` is absent, fails, or
times out, it **allows** the delete but says loudly that the guard was blind and the gate is the
reader's to run; a branch with no open PR, or any internal error, allows silently.

## The parameterization contract

Shared skills/agents say "run the `test-cmd` from Project Facts" — never a literal command. If a
needed Project Facts key is missing, the skill **stops and asks** rather than guessing. The
`adopt-conventions` skill sets up the Project Facts block; `docs/consumer-integration.md` in the
marketplace root documents the full contract (Fluyt contract v1).

## Versioning

The Claude manifest deliberately has **no `version` field** — consumers track `main` by ref. The
Codex manifest requires strict SemVer and mirrors the marketplace CHANGELOG current version; the
dual-package validator rejects drift between them.

## License

MIT. See [`LICENSE`](LICENSE) in this directory. The licence covers every file in this plugin,
including the prose assets (skills, agent definitions, hooks and templates), not just code.
