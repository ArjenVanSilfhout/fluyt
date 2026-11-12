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

Current version: **1.21.0**

---

## [1.21.0] — 2026-11-12

**`adopt-conventions`:** step 4's opt-in offer gains a second, separately asked setting:
`"autoMemoryEnabled": false` in the committed `.claude/settings.json`. Checked on Claude Code
2.1.321: it drops the auto-memory section from the session's first message, about 1k tokens. Like
the unused-tool deny it binds every user of the repo and costs them the client's per-project memory,
so it is never applied by default and the settings fragment does not carry it.

## [1.20.0] — 2026-11-10

**`adopt-conventions`:** step 4 gains an opt-in offer, never applied by default, to add a committed
`permissions.deny` for five tools a delivery session never calls (`Artifact`, `SendFeedback`,
`Workflow`, `ScheduleWakeup`, `ReportFindings`). Checked on Claude Code 2.1.321: the deny drops them
from the session's tool list. It binds every user of the repo, so the settings fragment does not
carry it.

## [1.19.0] — 2026-11-09

**Consumer `CLAUDE.md` template:** the shared precedence, deviation-recording and scope-grant text
moves out of the template into one new `orchestrator` section, *Precedence and the scope grant*.
The template's *Deliberate deviations* section keeps its entries fill-in plus one pointer line, and
*Ask the human when* keeps its adaptable gate list plus a one-line **Otherwise, keep working**
pointer. The template shrinks by about 1.3 KB per consumer; re-sync proposes the shorter wording.
The orchestrator's size budget rises to 8300 bytes to hold the moved text.

## [1.18.0] — 2026-11-07

**Project Facts:** a consumer can now keep a small inline core in `CLAUDE.md` and move the other
keys to a referenced file. The new optional key `facts-file` (default `none`, which keeps every key
inline exactly as before; suggested path `docs/process/project-facts.md`) names that file.
`CLAUDE-project-facts.md` lists which keys are core: the build, test and run commands, the three
branches, `forge`, `handover`, `delegation`, `git-identity`, `facts-file`, and the two keys the
hooks read, `changelog` and `co-author-trailers`. It also states the lookup rule once:

- Look inline first, then in the file.
- A key absent from both takes its default, or is a STOP for a required key.
- A named file that is missing is a STOP.
- When a key is in both places, the inline value wins.
- Never `@`-import the file.

Skills and agents that read Project Facts now point to that rule, and `ship-work-item` reads the
file at most once per run. Onboarding offers the split, and a decline is recorded as
`facts-file: none` (`chosen`). Re-sync counts a key as missing only when it is absent from both
places, flags duplicates, and offers the split, asking first. Re-sync step 4 now names confirmed
removals. Also corrected the 1.17.0 entry: the team-roles note is three lines, not two.

MINOR: shipped skills and templates gain instructions a consumer follows; an all-inline consumer
needs no change. Closes #74.

## [1.17.0] — 2026-11-04

**adopt-conventions:** the `CLAUDE-skeleton.md` template's "Agentic process (fluyt plugin)"
section drops from 4,198 to 1,355 bytes. That is the text every consumer's CLAUDE.md carries on
every turn. The 16-row routing table becomes one paragraph: consult the matching skill, start
with `/fluyt:orchestrator`, and each skill loads from its own description. A compact list still
names every skill, so gate check `[4]` keeps catching a deleted skill. The team-roles note
shrinks to three lines. The notation legend, the "Skills consulted" rule and the
project-specific-skills fill-in stay. Re-sync now also proposes removing plugin-owned prose the
skeleton no longer ships, so an onboarded repo's old routing list is flagged. MINOR: a template's
shipped output changes.

## [1.16.0] — 2026-11-04

**release, adopt-conventions, install-refresh-plugin, agent-liveness, handover, orchestrator:**
the six heaviest skills after `ship-work-item` are cut and split. Rarely needed detail moves to
reference files in each skill's own directory, one Read away, and each core gains a "Read
`<file>` when ..." step. Every gate, stop and safety rule stays one Read away, and the core repeats
the key ones beside each pointer. Core bytes, before → after: release 19,299 → 11,910 (+ `back-sync-pr.md`,
`hotfix.md`); adopt-conventions 37,719 → 21,994 (+ `re-sync.md`, `from-scratch.md`);
install-refresh-plugin 19,049 → 9,799 (+ `claude-code-repair.md`, which also holds the
session-root settings check); agent-liveness 17,479 → 14,376 (+ `process-check.md`); handover
8,731 → 8,234 and orchestrator 6,913 → 6,672 (trimmed, not split). Across the six, the core a
session loads drops from 109,190 to 72,985 bytes. No skill folder's summed budget lines rise. The
`CLAUDE-skeleton.md` template's precedence paragraph becomes a pointer to `ship-work-item`,
*Precedence*, so a re-sync no longer re-proposes plugin-owned text. Its scope-grant guardrails
stay in full. Cross-references updated in `branch-protection`, `ship-work-item/worktree.md`,
`CLAUDE-project-facts.md` and `docs/consumer-integration.md`. MINOR: skills gain a
read-this-file step.

## [1.15.2] — 2026-11-04

**orchestrator, hub:** two routing triggers the v1.14.1 description cut dropped instead of
moving are back in the skill bodies: "you are the orchestrator" and "you are the hub" on each
skill's *Loads on* line (the hub skill gains that line), and the orchestrator's do-not-load rule
(one named item, a quiet agent, a hand-over each load their own skill). Descriptions stay at most
200 characters. PATCH: restored routing text; no instruction a consumer follows changes.

## [1.15.1] — 2026-11-04

**CLAUDE.md:** the working agreement drops from 23.3k to about 19.2k bytes (314 to 262 lines)
after a read-only review: two contradictions fixed (the work-branch pattern now matches
`ship-work-item` §0's `<type>/i<N>-<slug>`, and the bug rule no longer claims to cross tiers),
five restatements of the `main`-pin fact collapsed to one, the precedence paragraph replaced by a
pointer to `ship-work-item` (the scope-grant guardrails stay stated in full), the two long
invariants cut to rule plus a `DECISIONS.md` pointer, and the client-specific sandbox and shell
chatter removed from `test-cmd` and `notes`. Three Project Facts keys the template defines are
now stated explicitly: `test-budget: advisory`, `git-identity: none`, `report-upstream: on`. No
gate, invariant, key or value is dropped. PATCH: a repo-side file.

## [1.15.0] — 2026-11-04

**developer, test-writer, preflight-reviewer:** each body shrinks to about 10k bytes
(18,584 → 10,443; 14,613 → 10,147; 24,790 → 9,614), because every dispatch paid for the whole
role whether or not its cases arose. The detail moved verbatim into 24 reference files under
`references/<role>/`, a plugin-root folder neither client scans as an agent; a body cites each one
as `${CLAUDE_PLUGIN_ROOT}/references/<role>/<topic>.md` at the trigger where the case arises, and
`dispatch-role` tells Codex the same path resolves as `../../references/…`. Every gate, hard
boundary, report field and desktop or identity rule stays in the body. Summed size per role
grows (body plus references: 25.8k, 19.9k, 32.6k); gate check `[12]` budgets the new folder.
MINOR: an agent gains read-this-file steps a consumer follows.

## [1.14.1] — 2026-11-04

**All sixteen skills:** descriptions are cut to at most 200 characters (folded), because every
session pays for the skill listing whether or not it uses the skill: 9,295 characters of listing
become 3,041. Each description opens with its trigger; three trigger phrases that lived only in a
description ("work the backlog", "after updating the plugin", raw ideas to be filed) moved into
the body of `orchestrator`, `adopt-conventions` and `backlog`. Nine size budgets ratchet down with
the files. PATCH: no instruction a consumer follows changes.

## [1.14.0] — 2026-11-04

**ship-work-item, developer:** a `size:S` item takes a fast path: the one `developer` spawn writes
the code and its tests, held to `test-writer`'s *What earns a test* bar, and no `test-writer` is
spawned; preflight runs as before. A comment-only or rename-only slice is one PR with the
`developer` at `haiku`; an issue's `model:*` routing label still wins over that rule. The
covered-by rule stays on top of both paths, and `size:M` / `size:L` keep the `test-writer` spawn.
The reason: a small item paid for a second spawn and a second hand-off that its test budget never
needed. One rationale sentence in `model-selection.md` ("searching code is never a heavy-model
task") is cut to fit the file's budget; its instruction stays. MINOR: a skill and an agent gain an
instruction a consumer follows.

## [1.13.2] — 2026-11-04

**README:** the two Status lines no longer name a version (they said 1.0.0 while the current
version was 1.13.1) and point to `CHANGELOG.md` for the current version instead, so the README
cannot go stale again at a release. PATCH: docs only.

## [1.13.1] — 2026-11-04

**ship-work-item:** the *Dispatch in the background* sentence in `delegation.md` ends at "for its
whole run" again. The 1.13.0 split dropped the clause that followed the comma and left two
sentences joined. PATCH: wording only, no instruction changes.

## [1.13.0] — 2026-11-02

**ship-work-item:** the skill splits into a core of under 15k characters plus eight reference files,
because every load paid for all 65k characters. Every gate, the scope-grant rules and the rules
whose miss is irreversible stay stated in the core. The detail moved verbatim apart from retargeted pointers, and the
core says when to read each file: `pick.md`, `delegation.md`, `worktree.md`, `verification.md`,
`commit-and-pr.md`, `merge.md`, `after-merge.md` and `model-selection.md`.

The skill's summed size budget rises, because each new file needs its own line and the core repeats
what it must keep in view. MINOR: a consumer now reads the detail at named triggers.

## [1.12.1] — 2026-11-02

**All six agents:** descriptions are cut to at most 200 characters, because every session and
dispatch pays for the agent listing whether or not it uses the agent. What a description dropped
already sits in that agent's body, or moved there: `developer` gains its delegation and no-tests
lines, and `preflight-reviewer` gains when to run it. Size budgets follow the formula. PATCH: no
instruction a consumer follows changes.

## [1.12.0] — 2026-11-02

**tech-debt-reviewer, scrum:** redundant tests now surface in reviews and retrospectives, the last
of the five changes that stop test suites growing only by adding.

- **tech-debt-reviewer** gains lens D, *Test redundancy*, scoped to `test-dir`. Each finding names
  the cases to merge and what still catches their target. It is a report only.
- **scrum** reads cases added and removed per item, and the ratio of test lines to product lines,
  as evidence. An item with no record is reported as unknown, never as zero.

Size budgets for both files rise by the formula, because the new text does not fit. MINOR: a shipped
agent and skill gain instructions.

## [1.11.0] — 2026-10-28

**ship-work-item:** the Adversarial coverage pass now sorts each surviving mutant into one of three
classes, so a survivor no longer turns into a new test by default:

- **redundant:** an existing test, golden or digest kills it once named. Nothing is added, and the
  verdict names that test and cites the captured kill.
- **gap:** the nearest owning test is extended with a row or an assertion.
- **new:** a new test is written, but only when nothing owns the mutant. `test-writer`'s *What
  earns a test* decides.

A delegated pass carries the classes in its spawn brief. MINOR: a shipped skill gains instructions.

## [1.10.0] — 2026-10-28

**preflight-reviewer, Project Facts template:** a new *Test diff* lens at the end of Step 7. It
reads the diff's test files for five redundancy tells:

- three or more cases differing only by a literal;
- more than two rows per branch;
- an expected value built by the same expression as the actual;
- a new test duplicating an existing one;
- a new file for a regression whose subject already has a suite.

Findings are Advisory. They FAIL only under the new Project Facts key `test-budget: strict` (absent
or `advisory` means Advisory), and the lens never flags what `test-writer` marks "never thinned".
Until now, no reviewer read the test diff for redundancy. The `preflight-reviewer` budget line rose
from 25300 to 26800 for the lens. MINOR: a shipped agent and the template gain instructions.

## [1.9.0] — 2026-10-28

**ship-work-item, developer:** a `test-writer` brief now names the suite to extend and a case
budget, which defaults to `test-writer`'s *What earns a test*. When an existing test already
discriminates the change, no `test-writer` is spawned, and the PR cites that test instead. The
`developer` may answer "covered by <test>" in its test report. This keeps a new case from being
added where an owning test already catches the change. MINOR: shipped components gain instructions.

## [1.8.0] — 2026-10-28

**test-writer:** a new "What earns a test" bar. A test earns its place only when it guards a declared
invariant, a public contract, a regression that happened, or logic whose wrong answer would be
silent. Duplicates, restated constants, interior rows on a covered branch, implementation-detail
pins and library behaviour don't qualify. An owning test is extended before a new one is added,
within a case budget: the brief's, else one per acceptance criterion plus one per touched
invariant. A keep list (digests, goldens, round-trips, contract tests, one case per real bug, and
others) is never thinned. The companion-oracle and twin-fixture rules can now be met by a row on
the owning test. The edge-case list becomes "cover the boundaries the logic branches on, in one
table", and the report counts cases added, extended and declined against the budget. Suites had
grown only by adding. Budget line raised from 13900 to 15800 for the new section. MINOR: a shipped
agent gains instructions.

## [1.7.4] — 2026-10-28

**Design (docs only):** `docs/design/affected-tests.md` proposes an opt-in, stack-neutral recipe for
running only the tests a change affects. It covers a default-off Project Facts sub-block, a decision
procedure that falls back to a full run whenever it cannot prove a test unaffected, a full-run safety
net, and a shadow period that measures savings before a consumer keeps the recipe. Three forks are
left for the maintainer, among them whether fluyt should ever ship a reusable workflow
(recommendation: no). PATCH: docs only, and no shipped file changes.

## [1.7.3] — 2026-10-28

**Fix (CI):** the per-plugin `claude plugin validate --strict` step tolerates the new "Plugin
directory checks" block that CLI 2.1.312 prints. The block is verdict-neutral by its own wording,
but the step's fail-closed rule turned every PR red because of it. The skip still fails closed when
the block changes shape. PATCH: CI only.

## [1.7.2] — 2026-10-11

**17 shipped skill files:** a second size cut, about 26 KB in total, with wording-only cuts landing
at least 2% under the new budgets. Budgets are lowered per the user's call in three tiers:

- **15%:** `orchestrator`, `scrum`, `report-upstream`, `dispatch-role`, `backlog`, `handover`, and
  the `ship-work-item` reference files `parallel-work`, `known-failure-modes` and `portability`.
- **9%:** `ship-work-item`, `closing-keyword-grep`, `release`, `install-refresh-plugin`, `hub`,
  `hook-authoring` and `versioning-and-changelog`.
- **6%:** `adopt-conventions`.

Most cuts replace an explanation with a pointer to the skill that owns it. `orchestrator`'s chain
diagram is redrawn in ASCII. An adversarial review of every removed span found fifteen small
losses of logic (a dropped qualifier, warning or scope), and each was restored. PATCH: no instruction
a consumer follows changes.

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
