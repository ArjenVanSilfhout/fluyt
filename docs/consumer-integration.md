# Consumer integration guide

How a repo adopts the **fluyt** plugin on Claude Code, Codex, or both. Fluyt itself never
touches your repo — you (or your agent) apply these steps and choose the client surfaces in Project
Facts `agent-clients`.

## 0. Prerequisites

fluyt assumes a specific substrate — confirm these before adopting:

- **A GitHub-hosted repo with Issues enabled** — the backlog, `Closes #N` auto-close, release
  milestones, and the upstream-feedback loop are all GitHub-native. **No repo yet?** `adopt-conventions` in
  **from-scratch mode** can help: it interviews for the project shape and *offers* to run
  `gh repo create` (it never creates one unasked), then *offers* to create the branch model and runs
  the normal onboarding.
- **An authenticated `gh` CLI** — the `backlog` / `release` / `report-upstream` skills shell out to
  `gh` (no stored token; it rides your existing login).
- **A plugin-capable Claude Code or Codex client** — to install the marketplace and invoke the
  process skills. Claude Code loads the role manifests natively; Codex uses the shipped role adapter.
- **Node.js 18 or later on `PATH`, on Claude Code** — the plugin's five Claude Code hooks are
  `node -e` one-liners, so without it their Node logic is inert: each still lets the work through,
  and says it was skipped (the exact wording is in `plugins/fluyt/README.md`, *Hooks*).

**Azure DevOps is the one supported alternative forge:** set Project Facts `forge: azure-devops` and
the `forge-azure-devops` adapter skill (§1) translates the rituals' GitHub/`gh` steps to `az`. Read
the GitHub bullets above as the default-forge path: an ADO consumer needs `az` authenticated instead
of `gh` (`report-upstream` still prefers `gh`, with a web-form fallback). A repo on GitLab / any
other self-hosted forge can
still borrow the *process shape*, but the forge-specific skills won't run as-is: only GitHub and
Azure DevOps adapters exist.

## 1. Component inventory (namespaced names)

Once installed, the plugin contributes:

**Skills** — Claude Code invokes `/fluyt:<name>`; Codex mentions
`$fluyt:<name>` or lets the skill description trigger it:

- `/fluyt:orchestrator` — the session posture for the main agent and the ritual chain it
  conducts; routes to the skills that own each step and restates none of them.
- `/fluyt:hub` — run one cross-project hub session coordinating several project
  orchestrators: the hub repo, the session protocol, verbatim decision relay, and the authority
  boundary (a relayed answer is approval only where the user said so in that session's own chat).
- `/fluyt:ship-work-item` — the branch → PR → merge delivery ritual.
- `/fluyt:backlog` — GitHub-Issues selection order, filing, hygiene.
- `/fluyt:release` — integration branch → release branch promotion + tag.
- `/fluyt:versioning-and-changelog` — CHANGELOG-as-source-of-truth + version bumps.
- `/fluyt:scrum` — retrospective on the agent team + workflow.
- `/fluyt:adopt-conventions` — the scaffolding skill (run this first — step 4); also the
  from-scratch entry point when the repo does not exist yet.
- `/fluyt:branch-protection` — offer or audit branch protection: a ruleset (or classic
  protection) on the integration and release branches, the per-role merge methods, what CI must
  report before a merge, plus the GitHub Actions trigger and docs-only fast-path audit.
- `/fluyt:report-upstream` — file a bug / feature request upstream about the plugin itself.
- `/fluyt:install-refresh-plugin` — load / refresh / diagnose the plugin on an embedded client
  using that client's manifests, cache, and restart boundary.
- `/fluyt:agent-liveness` — decide whether a quiet background sub-agent is still working or
  has died, without reading its transcript or killing a healthy one; and whether an agent that already
  reported should be resumed rather than replaced.
- `/fluyt:handover` — write a session hand-over a successor can act on without the
  transcript; location from Project Facts `handover`, mid-item written but never committed.
- `/fluyt:hook-authoring` — the discipline for authoring a Claude Code hook or a
  `hooks.json` entry: own your output file, stamp the right timezone, resolve the repo root
  correctly, fail silently on purpose, and know whether you're counting a tripwire or a metric.
- `/fluyt:dispatch-role` — Codex adapter for the six canonical role files.
- `/fluyt:forge-azure-devops` — the Azure DevOps forge adapter: for a consumer whose Project
  Facts declares `forge: azure-devops`, translates the canonical rituals' GitHub/`gh` steps to `az`
  (Boards work items, PR auto-complete, work-item close-linking, build-validation policies, branch
  security, bearer-token auth); its recipes ship unverified.

**Specialist roles** — `developer`, `product-owner`, `preflight-reviewer`, `tech-debt-reviewer`,
`test-writer`, and `scrum-master`. They appear directly as `fluyt:<name>` on Claude Code.
Codex dispatches them through `dispatch-role`, which reads the same canonical `agents/*.md` file and
does not install a divergent `.codex/agents/*.toml` copy.

**Claude Code hooks** — five, disclosed in `plugins/fluyt/README.md` *Hooks*: four `PreToolUse`
guards on Bash and a `SubagentStop` breadcrumb that appends to `docs/process/dispatch.local.md`
(the dispatch cadence feed `/fluyt:scrum` reads, kept separate from
`docs/process/retro-log.local.md`, the human-appended friction notes). Codex runs none; role
dispatch works without claiming that Claude's hook schema is active there.

The enable key is `fluyt@fluyt`.

## 2. Install on the active client

Both clients must track Fluyt's release branch `main`, not GitHub's default/integration branch
`dev`.

### Claude Code

Merge this into the consumer's **committed** `.claude/settings.json` (so anyone opening the repo is
prompted, consent-based, to install):

```json
{
  "extraKnownMarketplaces": {
    "fluyt": {
      "source": { "source": "github", "repo": "ArjenVanSilfhout/fluyt", "ref": "main" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": { "fluyt@fluyt": true }
}
```

**The `"ref": "main"` is load-bearing — keep it.** Fluyt's GitHub **default** branch is `dev`
(its integration branch, so its own `Closes #N` auto-fires). `main` is the **release** branch. An
*unpinned* source follows the default branch, which would land you on `dev` (unreleased integration
work). Pinning `ref: "main"` keeps you on stable releases regardless of the default. (To deliberately
ride the bleeding edge instead, set `"ref": "dev"`.)

**Manual fallback** (works on all plugin-capable Claude Code versions, no prompt needed):

```text
/plugin marketplace add ArjenVanSilfhout/fluyt
/plugin install fluyt@fluyt
```

Note: the bare `marketplace add` above tracks Fluyt's **default** branch (`dev`). To pin the
release branch, prefer the JSON fragment with `"ref": "main"` — that is the confirmed way to pin.

### Codex

Fluyt ships a repo marketplace at `.agents/plugins/marketplace.json` and a versioned Codex
manifest alongside the unchanged Claude metadata. Add the official Git source, install the same
namespaced plugin, and inspect it:

```powershell
codex plugin marketplace add ArjenVanSilfhout/fluyt --ref main
codex plugin marketplace list
codex plugin add fluyt@fluyt
codex plugin list
```

The listing must show `fluyt@fluyt` installed and enabled with a strict-semver version.
Then start a **new Codex task**: an existing task keeps the skill catalog it started with. In that new
task, `$fluyt:ship-work-item` must resolve and `$fluyt:dispatch-role` smoke mode must be
able to reach each canonical specialist role.

## 3. Authentication note

Fluyt is a public repo, so a plain install needs no credentials. Manual installs and marketplace-add
use your existing Git/GitHub credentials when you have them. Claude Code **background auto-update** (the `autoUpdate: true` above) may need a
`GITHUB_TOKEN` / `GH_TOKEN`; Codex refreshes its configured Git marketplace through
`codex plugin marketplace upgrade`. Authentication is a **user decision** — an agent must never
persist a token on your behalf.

## 4. Run adopt-conventions

After installing, run **`fluyt:adopt-conventions`** using the active client's invocation style.
It records `agent-clients: claude | codex | both`, keeps the Project Facts block single-sourced in
`CLAUDE.md`, and adds an `AGENTS.md` pointer for Codex instead of duplicating that contract. It also
merges the applicable client routing, settings/gitignore/gitattributes fragments, and
CHANGELOG/DECISIONS skeletons non-destructively, offers the label bootstrap, and proposes retiring
local process components the plugin now covers.

On Claude Code, if the plugin's **skills** resolve but its **agents** don't
(`agent type 'fluyt:…' not found`),
restart the Claude Code client fully — a `/plugin` reload isn't always enough to register newly-added
agents. Until you restart, fall back to a `general-purpose` agent with the agent file's mandate pasted
in. On Codex, do not expect those Claude manifests to appear as named agents; use `dispatch-role`,
which provides the scoped canonical prompt through Codex's supported subagents.

## 5. Shadowing cleanup cheat sheet

Same-named local process components can shadow or duplicate the plugin. After adopting, clean up:

- **A repo with NO `.claude/` yet (e.g. a CLAUDE.md-only project):** nothing to delete. Slim the
  CLAUDE.md's task-flow / git sections down to the Project Facts block + the skill pointers (the
  routing paragraph) — the process detail now lives in the plugin skills.
- **A repo with an existing `.claude/` process setup (local ship-work-item/release/scrum/backlog
  skills + team agents):** retire the local **process** skills and the six team agents (they're now
  the plugin's). **KEEP every project-specific / stack skill** (codebase maps, area skills, add-thing
  recipes) — the plugin covers PROCESS only. Declare your existing label scheme (e.g. `prio:*` +
  no-milestones) in Project Facts, OR optionally rename your labels to the canonical plain scheme
  (`gh label edit prio:must --name must` etc. — issues keep the renamed labels). Your call.
- **A repo with `.agents/skills/` process copies or `.codex/agents/*.toml` role copies:** retire the
  duplicated process skills and role adapters. Keep domain skills. Codex's supported specialist path
  is `dispatch-role` reading the plugin's canonical `agents/*.md` files.

## 6. Auto-close caveat (the load-bearing one)

`Closes #N` fires **only on the repo's default branch**:

- If your **integration branch IS the default branch** (e.g. default = `dev`, work merges into `dev`):
  auto-close works — done issues close on merge.
- If your **integration branch is NOT the default** (e.g. default = `main` but work merges into
  `dev`): auto-close will NOT fire. The `ship-work-item` skill's post-merge step catches this — it
  verifies the issue and closes it manually. Either accept the manual close, or flip your default
  branch to the integration branch (only if nothing else depends on the default being `main`).

**Fluyt's own shape (worked example):** `dev` is its default branch (§2), so its own merges
auto-close; pinning consumers to `"ref": "main"` (§2) is what satisfies "nothing else depends on the
default being `main`" — consumers ride `main` via the explicit ref, not the default. Any marketplace
consumer tracking a default branch can use the same trick.

## 7. What stays per-repo forever

The plugin never absorbs these — they live in each consumer:

- **Stack / domain skills** (codebase maps, area guides, add-thing recipes).
- **Permissions and environment** (a plugin cannot ship permissions or env).
- **Architecture invariants** (declared once in the consumer's `CLAUDE.md`; Codex's `AGENTS.md`
  routes to it — the reviewers enforce "whatever CLAUDE.md declares").
- **The Project Facts block** (your build/test/run commands, branches, labels, paths).
- **CI** (your build/test workflows).

## 8. Filing feedback upstream (bugs & feature requests for the plugin itself)

Found a bug in a shared skill / agent / hook, or want a capability the plugin doesn't have yet? File
it **upstream** on Fluyt — don't bury the fix in your repo where it will drift. Two ways:

- **From an installed client:** run **`fluyt:report-upstream`** using that client's invocation
  style. It captures which repo
  you're filing from, which component, and a repro / rationale, de-dupes against existing reports,
  and files to `ArjenVanSilfhout/fluyt` with a `bug` or `enhancement` label plus
  `from-consumer`. It first asks you to refresh through the active client (`/plugin marketplace
  update fluyt` on Claude Code or `codex plugin marketplace upgrade fluyt` on Codex),
  so you report against current `main`.
- **From the browser:** open
  `https://github.com/ArjenVanSilfhout/fluyt/issues/new/choose` and pick **Bug report** or
  **Feature request** (sign in to GitHub to file).

Rule of thumb: does the fix change a plugin file or a file in your repo? Plugin file →
`report-upstream`; repo file → `fluyt:backlog` (active client's invocation style).

## 9. Client version models

Claude's `.claude-plugin/plugin.json` stays versionless: consumers pin `main` and every release-branch
update is loadable. Codex requires strict SemVer, so `.codex-plugin/plugin.json` mirrors the
`CHANGELOG.md` current version; CI rejects drift. A Claude move to explicit manifest versioning would
be a separate future decision and does not follow from the Codex requirement.

## 10. Staying current (plugin updates + re-sync)

The plugin evolves; a repo already on fluyt keeps up in two steps:

1. **Update the plugin** — on Claude Code, `/plugin marketplace update fluyt` (or let
   `autoUpdate` do it); on Codex, `codex plugin marketplace upgrade fluyt` followed by
   `codex plugin add fluyt@fluyt`. Start a new task after a Codex reinstall.
2. **Re-sync the conventions** — skim the marketplace CHANGELOG for new Project Facts keys or changed
   shipped guidance, then run **`fluyt:adopt-conventions` in re-sync mode** using the active
   client's invocation style ("re-sync the conventions" / "check for convention drift"). It is
   additive and non-destructive: it proposes the Project Facts keys the template gained (Pass A), the
   plugin-owned `CLAUDE.md` guidance that changed (Pass B — paragraph-by-paragraph, bounded by the
   skeleton's `<...>` convention), the settings / gitignore / gitattributes fragments (Pass C), and the
   repo-level GitHub settings that only ever ran at onboarding — auto-merge, the
   `delete_branch_on_merge` topology check, labels, branch protection and CI triggers (Pass D, which
   proposes **repo settings rather than file edits** and applies nothing without an explicit yes),
   never overwriting your own wording. Claude track-main has no
   manifest version to signal drift, so make this a habit after each update. Codex consumers also
   re-sync the plugin-owned `AGENTS.md` routing paragraph without copying Project Facts into it.

## 11. If your project also embeds an upstream core (optional)

Some projects are a **core + consumers** split: a *core* develops in its own repo
and cuts releases; one or more *consumers* embed it (submodule, package, or vendored copy). This is
about your *own* upstream dependency, not fluyt itself — but the same discipline applies:

- **Pin the core to an immutable release, not a floating branch.** A tag, a release artifact, or an
  exact pinned commit — anything that can't move under you — so a given build always embeds a known,
  reproducible core version. The mechanism is yours (a submodule gitlink at a tag, a lockfile-pinned
  package, whatever your ecosystem uses).
- **Verify the pin in CI, and fail on a floating one.** Make the build assert the core resolves to an
  immutable release — e.g. for a tag-pinned submodule,
  `git -C <core-path> describe --exact-match --tags HEAD`. Then "which core version is in this build?"
  stays answerable and a bisect stays meaningful.
- **Adopt core releases deliberately.** The core never pushes changes downstream; a consumer bumps its
  pin when it chooses to take a new release. This mirrors how you pin fluyt itself by `ref` (§2)
  — you take upstream updates on your own terms.

This is advisory: fluyt ships no Project Facts key or CI check for it, because *how* you pin an
upstream dependency is project-specific (and mandating a tag pin would contradict fluyt's own
`ref`-to-`main` track-main model). If you want it enforced, add the check to your own CI.

## 12. Codex fresh-profile acceptance

Use an isolated `CODEX_HOME` so an existing personal mirror or cached plugin cannot make the test
pass accidentally. On PowerShell:

```powershell
$env:CODEX_HOME = Join-Path $env:TEMP ("fluyt-smoke-" + (Get-Date -Format yyyyMMddHHmmss))
codex plugin marketplace add ArjenVanSilfhout/fluyt --ref main
codex plugin marketplace list
codex plugin add fluyt@fluyt
codex plugin list
```

Acceptance requires all of the following:

1. `codex plugin list` shows `fluyt@fluyt` installed and enabled, with the same strict
   SemVer as `.codex-plugin/plugin.json` and the CHANGELOG current version.
2. In a **new task**, all sixteen process skills resolve under `fluyt:` (`dispatch-role`
   included).
3. Run `dispatch-role` in read-only smoke mode once for each of `developer`, `product-owner`,
   `preflight-reviewer`, `tech-debt-reviewer`, `test-writer`, and `scrum-master`. Each result names the
   correct canonical `agents/*.md` file, states its normal write boundary and semantic model tier,
   makes no repo change, and ends with `Skills consulted: ...`.
4. Run the normal Claude marketplace validation and local invariant gate. Codex support is additive;
   the existing Claude install, native agents, and versionless Claude manifest must remain green.

---

## Appendix — worked Project Facts examples

These are **illustrative** — Fluyt does not apply them; each repo's own agent fills its block.
The first two show a branching repo (a separate integration branch) and a trunk-style default; the
third shows a library. Repo names are made up.

### A service with a separate integration branch (the `Yawl` shape)

```text
- project-name: <the service>
- repo: example-org/Yawl (private)
- agent-clients: both
- default-branch: main
- integration-branch: dev
- release-branch: main
- build-cmd: <the build command, e.g. a make/script target>
- test-cmd: <the test command>
- run-cmd: <the launch command>
- test-dir: <the test folder>
- backlog: GitHub Issues on example-org/Yawl; tier labels must/should/could (plain
  scheme); milestones: yes (one per plan milestone); auxiliary: size:S/M/L, kind labels, tracking
- release-milestones: no (this repo plans in milestones instead — see the `milestones` flag above)
- changelog: CHANGELOG.md
- decisions: DECISIONS.md
- version-rules: MINOR = any product-behaviour change (behaviour is the axis, not file count); PATCH
  = a behaviour-neutral change or any tooling/docs/process change
- commit-subject: `<type-or-id>: <summary> (vX.Y.Z)`
- co-author-trailers: forbidden
- notes: default-branch == release-branch (main), so `Closes #N` does NOT auto-fire on dev-merge —
  the post-merge manual-close step applies; work that is only possible in an external console is a
  manual user step — file it as a question issue.
```

### A repo whose default branch is the integration branch (the `Scow` shape)

```text
- project-name: <the application>
- repo: example-org/Scow (private)
- agent-clients: both
- default-branch: dev
- integration-branch: dev
- release-branch: main
- build-cmd: <the build command>
- test-cmd: <the test command>
- run-cmd: <the launch command>
- test-dir: <the tests folder>
- backlog: GitHub Issues on example-org/Scow; tier labels prio:must/prio:should/
  prio:could; milestones: no; auxiliary: size:*, blocked, bug
- release-milestones: no
- changelog: CHANGELOG.md
- decisions: DECISIONS.md
- version-rules: MINOR = product-behaviour change (behaviour is the axis, not file count); PATCH = a
  behaviour-neutral change or any tooling/docs/process change even when multi-file
- commit-subject: `#<issue>: <summary> (vX.Y.Z)`
- co-author-trailers: forbidden
- notes: default == integration (dev), so `Closes #N` auto-fires on dev-merge; keep dev as default
  or auto-close breaks.
```

### A trunk-based library (the `Smack` shape)

```text
- project-name: <the library>
- repo: example-org/Smack (public)
- agent-clients: claude
- default-branch: main
- integration-branch: main
- release-branch: main
- build-cmd: <the packaging command>
- test-cmd: <the test command>
- run-cmd: none (a library, not a runnable app)
- test-dir: tests/
- backlog: GitHub Issues on example-org/Smack; tier labels must/should/could (plain scheme);
  milestones: no; auxiliary: size:S/M/L
- release-milestones: no
- changelog: CHANGELOG.md
- decisions: DECISIONS.md
- version-rules: MINOR = a public API change (a new or changed signature, a new supported
  input); PATCH = a behaviour-neutral change or any tooling/docs/process change even when
  multi-file
- commit-subject: `<type-or-id>: <summary> (vX.Y.Z)`
- co-author-trailers: forbidden
- notes: integration-branch == release-branch (trunk-based, so `release` skips the promotion PR);
  no `visual-verification` key — a library has no rendering surface to attest.
```
