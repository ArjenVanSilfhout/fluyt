<!-- Fluyt contract v1 - Project Facts block.
     Paste this into your CLAUDE.md and fill every key. The shared fluyt skills and agents
     read these keys by name (e.g. "run the `test-cmd` from Project Facts") and contain NO
     project-specific facts of their own. A key a ritual REQUIRES stops that skill and asks when
     missing; a key with a documented absent-key default (sixteen below, e.g. `delegation`) never
     stops anything - stating it explicitly is recommended, not required: a stated default reads as
     a decision, not an oversight. -->

<!-- Provenance markers - how a key's value was set, so a wrong default is distinguishable from a
     decision.

     Every key below may carry a trailing HTML-comment marker recording how confidently its value
     should be trusted. Three states:

     - `inferred` - the agent guessed it from the survey; nobody was shown the value before it
       landed. Freely re-derivable at any re-sync. An ABSENT marker reads exactly like `inferred` -
       a block without markers stays valid, and an inherited
       recommendation stays freely re-presentable.
     - `ratified` - the key was presented (purpose + options + recommendation) and bulk-accepted
       during the interview. Re-presented at a later re-sync
       ONLY when this template's own recommendation or option set for that key has materially
       changed since (see "Re-presenting a changed recommendation" below) - and never silently
       overwritten in the meantime. Bulk-accepting a re-presentation STAYS `ratified`; it does not
       ratchet to `chosen` on its own.
     - `chosen` - the user considered this specific key and decided it, either through the per-key
       walk or by engaging with that one key directly during a re-presentation. Never touched again
       by anything, regardless of any later upstream change.

     Marker syntax - a trailing HTML comment on the key's own line, invisible when the markdown
     renders:

         - `delegation`: default <!-- provenance: ratified @vX.Y.Z -->

     The `@vX.Y.Z` on a `ratified` marker is the PLUGIN's version when ratified - read `version` from
     the plugin payload's `.codex-plugin/plugin.json` (the install cache; it mirrors the plugin's
     CHANGELOG), NEVER the consumer repo's own CHANGELOG: the `recommendation-changed` annotations
     below also name plugin versions, so both sides of the comparison must share that axis. This lets
     a re-sync tell "ratified before the key's recommendation last changed" from "ratified after"
     without diffing plugin history. `chosen` and `inferred`/unmarked keys carry no version -
     `chosen` is never re-presented regardless of upstream change, and `inferred` is always freely
     re-derivable - so neither has anything to compare against or gate.

     Re-presenting a changed recommendation - the cheap "changed upstream" tell. When a later edit to
     THIS template materially changes a key's recommendation or its option set, that same edit adds
     (or bumps) a `<!-- recommendation-changed: vX.Y.Z -->` annotation next to that key's own
     definition below, naming the version the change ships in - read directly off this file, no
     plugin-history diff needed. At re-sync, a
     `ratified @vX.Y.Z` key whose definition below carries a `recommendation-changed` version NEWER
     than its own `@vX.Y.Z` gets re-presented; everything else - every `inferred` key regardless, and
     every `ratified` key with no newer tell - is left exactly as `adopt-conventions`' existing
     Pass A rules already treat it. Today no key below carries a `recommendation-changed` annotation:
     the mechanism ships ahead of any actual change, and the first key whose recommendation
     materially changes is the first to carry one. -->

## Project Facts (Fluyt contract v1)

- `project-name`: <human-readable name>
- `repo`: <owner>/<repo> (public | private)
- `agent-clients`: <claude | codex | both> - which client surfaces consume this same Fluyt
  working agreement. The Project Facts block remains single-sourced in `CLAUDE.md`; a Codex
  `AGENTS.md` routes to it rather than duplicating the contract.
- `forge`: <github | azure-devops> - which forge platform the delivery ritual's forge-specific steps
  (backlog, PR/merge, issue-close linking, CI gate, branch protection) target. Default `github`
  (absent → `github`, never a STOP). Set `azure-devops` to route those steps through the
  `forge-azure-devops` adapter skill instead.
- `default-branch`: <the repo's GitHub default branch - controls `Closes #N` auto-close>
- `integration-branch`: <where finished work items accumulate, e.g. dev or main - may EQUAL
  `release-branch` for a trunk-based repo; the release skill then skips the promotion PR>
- `release-branch`: <the tagged-release branch, e.g. main>
- `build-cmd`: <the exact build command, or `none` if there is no build step>
- `test-cmd`: <the exact test command, or `none`>
- `run-cmd`: <the exact launch command, or `none`>
- `test-dir`: <the ONLY directory the test-writer agent may write to, or `none`>
- `backlog`: GitHub Issues on <owner>/<repo>; tier labels `must`/`should`/`could`
  (or `prio:must`/`prio:should`/`prio:could`, or your scheme); milestones: <yes|no>;
  auxiliary labels: <e.g. size:S/M/L, cluster:*, single-file, blocked, tracking>
- `not-ready-labels`: <none | comma-separated label names> - labels beyond the built-in `blocked`
  skip whose issues the `backlog` skill's selection order excludes from picking, however they are
  still tiered. Default `none` (absent → `none`): only the built-in `blocked` skip applies, and any
  labels given are always **unioned with** it, never a replacement.
- `release-milestones`: <yes|no> - if `yes`, the `release` skill creates a GitHub Milestone named for
  each release version (vX.Y.Z), assigns the issues shipped in that release, and closes it. Default
  `no` (absent → `no` - the `release` skill skips the milestone step). Orthogonal to the
  `milestones` flag above (which is for PLANNING milestones the backlog skill selects within); a
  project can use either, both, or neither.
- `release-tags`: <yes|no> - if `yes` (the **default** when the key is absent), the `release` skill
  tags the release branch `vX.Y.Z` and diffs against the last tag in pre-flight. Set `no` for a
  **track-main** repo whose consumers pin the release branch tip itself (every push is a release, no
  tags) - the skill then skips tagging and diffs against the release branch instead.
- `github-releases`: <yes|no> - if `yes` (default `no`; implies `release-tags: yes`), the `release`
  skill publishes a GitHub Release (tag + notes from the CHANGELOG) per release, for a human-facing
  release history. Consumers pin the branch tip regardless - the Release is a visibility marker, not
  the pin.
- `release-publish`: <none | command or documented manual step> - an extra publish the `release` skill
  performs (or points you to) AFTER the promotion + tag: a package-registry publish, a store upload, a
  deploy. Default `none` (absent → `none`; a git-only release, e.g. a marketplace repo whose consumers
  pin the branch tip) - mirrors the `release-milestones` gate.
- `changelog`: <path | none> - path to the CHANGELOG (e.g. CHANGELOG.md); `none` = an unversioned
  repo (no entry, no bump, no version in commit subjects or release PR titles, no tags)
- `decisions`: <path to the decisions log, e.g. DECISIONS.md or docs/DECISIONS.md>
- `version-rules`: MINOR = <what counts as a product-behaviour change>; PATCH = a behaviour-neutral
  change (pure wording / formatting / typo) and ALL tooling/docs/process changes even when
  multi-file; MAJOR (once at 1.0) = <a breaking or incompatible change consumers must adapt to -
  leave unset until you plan your 1.0>. The axis is **behaviour, not file count** - a one-file
  behaviour change is still MINOR, so don't gate either side on file count.
- `pr-approvals`: <none | N> - human approvals a work-item PR needs before it may merge. Default
  `none` (solo-first: preflight is the only review, and `ship-work-item` arms auto-merge at once). Set
  `N` if your repo's branch protection requires reviews - the ship ritual then lets `--auto` wait for
  them instead of self-merging.
- `delegation`: <default | on-demand> - WHO implements a work item. Default `default` (absent →
  `default`): the main agent orchestrates and spawns the `developer` agent to implement, while
  it keeps the recon, the spec, and the branch / CHANGELOG / version / commit / PR / merge. Set
  `on-demand` to opt out - the main agent then implements inline in the shared checkout and delegates
  only for genuine parallelism or a large self-contained chunk. Delegation is the default because **the
  human must be able to reach the orchestrator mid-turn**: an orchestrator that is itself editing cannot
  take a correction and redirect the work, which is a different concern from the co-edit collision
  safety `worktree-isolation` covers. With no key present it delegates; write `on-demand` explicitly to keep inline editing.
  Orthogonal to `worktree-isolation` below (*who* implements vs *in which working copy*); all four
  combinations are supported - `ship-work-item`'s *Delegation and worktree isolation* states each.
- `worktree-isolation`: <on-demand | default> - how product-code work items relate to git worktrees.
  Default `on-demand` (absent → `on-demand`): the work happens in the shared checkout -
  whoever `delegation` puts on it - reserving isolated worktrees for parallelism / a large chunk / the
  `ship-work-item` *Parallel work* recipe. Set `default` when the maintainer may co-edit the same working copy the agent
  commits into - product-code items then default to an isolated `git worktree` (the ship flow spawns
  the `developer` with `isolation: worktree` instead of editing the shared checkout), structurally
  preventing the branch-collision co-editing risks. On `on-demand` the shared checkout has **two
  actors**, and two always-on rules cover them: the commit-guard (re-check `git branch --show-current`
  before every commit) protects whoever **commits**, and `ship-work-item`'s *While a non-isolated
  agent is live* freezes `HEAD` for whoever **moves** it. Both apply either way; only
  `worktree-isolation: default` removes the shared `HEAD` that makes them necessary.
- `adversarial-coverage`: <on-demand | default> - whether `ship-work-item`'s §1 *Adversarial coverage
  pass* stays optional or is required for a product-code slice that touches a declared invariant.
  Default `on-demand` (absent → `on-demand`): the pass's own
  RUN/SKIP criteria decide. Set `default` to require it for a product-code slice that touches a declared invariant
  (this file's own **Invariants** section - not bare "product code", which would make the pass
  near-universal in a repo with broad invariants): the pass then RUNS, and a SKIP must carry a
  **stated reason recorded in the PR body and the CHANGELOG entry**. **Self-reported, not a gate** -
  a missing adversarial read leaves no signal in the diff, so nothing downstream (not
  `preflight-reviewer`, not CI) can detect its absence; the key asks for an honest attestation, not
  something it can verify. `on-demand` is the recommended default - the cost is per-item and
  recurring, unlike `delegation`'s default, which has a reachability argument.
- `test-budget`: <advisory | strict> - how hard `preflight-reviewer`'s *Test diff* lens bites.
  Default `advisory` (absent → `advisory`): its redundancy tells in the diff's test files are
  non-blocking Advisory findings. Set `strict` to make them FAIL. The case budget itself is
  `test-writer`'s, not this key's.
- `visual-verification`: <none | a sub-block declaring how rendering changes are visually verified>.
  Default `none` (absent → `none`): no visual gate - non-GUI consumers are unaffected.
  Set it for a GUI / visualization product, where build + tests + a launch can't prove the
  *rendered output* is correct. Declare three parts: `rendering-paths` (globs the consumer treats as
  draw-affecting), `evidence-marker` (the attestation token a rendering change must carry in its
  CHANGELOG entry / PR body, e.g. a `Captured & reviewed: <states>.` line), and optionally `capture-cmd`
  (how the captures are produced). When set, `preflight-reviewer` FAILs a change that touches
  `rendering-paths` but carries no `evidence-marker` - it checks the attestation's presence, not the
  pixels (it is read-only).
- `agent-routing`: <labels | none> - how per-issue implementation routing is recorded. Default `none`
  (absent → `none`): the implementing sub-agent's model comes from its frontmatter default
  (the `ship-work-item` *Model selection* doctrine) with ad-hoc per-spawn overrides. Set `labels` to
  record the choice **on the issue** via two auxiliary label families - `model:<tier>` (a model alias:
  `model:opus` / `model:sonnet` / `model:haiku`, `model:fable` where provisioned) and `agent:<type>` (a
  plugin agent name, e.g. `agent:developer`). On `labels`, `ship-work-item` reads an issue's `model:*`
  label and spawns the implementer at that tier, overriding the frontmatter default (absent → the default
  stands); the `agent:*` label is **advisory** - a human-facing routing/filter marker the `product-owner`
  may recommend, not a dispatcher (the ship flow still decides which agent implements). Seed the families
  with `github-labels.ps1 -AgentRouting`.
- `pinned-deps`: <none | one or more `<path> @ <owner/repo>` entries> - upstream dependencies this
  repo pins to an immutable release (e.g. a tag-pinned git submodule). Default `none` (absent →
  `none`). When declared, the `backlog` skill's hygiene scan checks each pin's freshness -
  the checked-out tag (`git -C <path> describe --tags`) against the upstream repo's latest GitHub
  Release - surfaces any gap in the scan report, and files/refreshes the pin-bump issue. Freshness
  only: pin *integrity* (CI asserting the pin resolves to an exact release) stays the consumer's own
  build's job.
- `handover`: <none | path> - where the `handover` skill writes a session hand-over. Recommended:
  a git-ignored `*.local.md` name, e.g. `docs/process/HANDOVER.local.md` (covered by the
  `docs/process/*.local.md` rule in `gitignore-additions.txt`); naming a tracked path, e.g.
  `docs/process/HANDOVER.md`, is a supported opt-in. Default `none` (absent → `none`): the skill has
  nowhere to write or read, and **STOPS to ask** at first use (recommending the ignored form) rather
  than inventing a path. Once answered, record the path here -
  both the write side and the `CLAUDE.md` routing pointer resolve the location from this key, never
  from a convention.
- `report-upstream`: <on | off> - whether the `report-upstream` skill may file feedback about the
  shared plugin from this repo. Default `on` (absent → `on`, never a STOP). Set `off` in a repo that
  must not publish outside itself: the skill then refuses to file and says why. With `on`, filing is
  still main-session-only, provenance stripped by default, and sent only after the user approves the
  draft.
- `commit-subject`: `<type-or-id>: <summary> (vX.Y.Z)`
- `co-author-trailers`: <forbidden | allowed>
- `git-identity`: <none | `<name> <email>` for git, plus the forge account name> - the identity this
  repo's commits and forge actions must carry. Default `none` (absent → `none`, never a STOP): no
  identity check. When set, the `orchestrator` *Enter* link confirms `git config user.name` /
  `user.email` and the active forge account match it before acting.
- `notes`: <project-specific traps the shared skills should respect - e.g. a locked build
  output, a required env var, a manual setup step>

<!-- Guidance while filling this in:
     • `default-branch` vs `integration-branch`: GitHub fires `Closes #N` closing keywords ONLY on
       the DEFAULT branch. If your integration branch IS the default, work-item merges auto-close
       issues. If not (integration != default), auto-close will NOT fire - the ship-work-item skill's
       post-merge manual-close step covers this. Pick deliberately.
     • tier labels: declare the EXACT label names you use so the backlog skill queries the right
       ones. New projects: the canonical default is plain `must`/`should`/`could` + `size:S/M/L` +
       milestones.
     • `milestones` vs `release-milestones`: two independent ideas. `milestones: yes` = you PLAN in
       milestones (open, spanning releases; the backlog skill selects work within the current one).
       `release-milestones: yes` = the release skill stamps a `vX.Y.Z` milestone per release and files
       the shipped issues under it. Setting one does not imply the other.
     • `test-dir`: the test-writer agent writes ONLY here and never touches product code.
     • Anything genuinely absent → write `none`; do not leave a key blank. But `none` means THIS
       PROJECT HAS NO SUCH THING - a settled answer that stops the skills asking. For something that
       simply does not exist YET (no build or no test suite on a young repo), write
       `<pending — set when it exists>` instead, so a later re-sync still chases it. A pending value
       READS EXACTLY LIKE `none` to every consumer - skipped wherever `none` is skipped, never run as
       a command or written to as a path. The only
       difference is at re-sync, where `none` is left alone and a pending value is chased. -->
