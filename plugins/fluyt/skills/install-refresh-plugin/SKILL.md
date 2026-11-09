---
name: install-refresh-plugin
description: >-
  Install, refresh and diagnose a Fluyt-style plugin on Claude Code or Codex. Use when a plugin
  will not load or update, the loaded version is unclear, or a new skill or role adapter is missing.
---

# Install / refresh / diagnose a plugin by client

First identify the active client: **Claude Code** or **Codex**. Do not mix their state directories
or repair commands. Use the matching section below with `<marketplace>`, `<plugin>`,
`<marketplace-source>`, `<release-ref>`, and `<plugin-source-path>` filled from the installed
marketplace and the consumer's Project Facts (`<plugin-source-path>`: see `claude-code-repair.md`).

## Claude Code

Claude Code stores marketplace and install state below `~/.claude/` on macOS/Linux or
`%USERPROFILE%\.claude\` on Windows.

### Four load requirements

All four must hold:

1. `<marketplace>` exists in `plugins/known_marketplaces.json` and has a clone below
   `plugins/marketplaces/<marketplace>/`.
2. `plugins/installed_plugins.json` contains an install record whose `projectPath` matches the repo
   being opened.
3. That record's `installPath` is populated with the plugin payload.
4. User-level `settings.json` contains
   `enabledPlugins: { "<plugin>@<marketplace>": true }`. Project settings alone may not load it.

After fixing state, fully restart the client. A `/plugin` reload may refresh skills without
registering newly added native agents.

### Project settings resolve from the SESSION ROOT

**A session opened one directory above the repo never reads `<repo>/.claude/settings.json`**, and
every key it declares silently takes its default. **Do not diagnose this from downstream
behaviour.** When a key appears to take its default although the file declares it - a worktree on an
unexpected ref, a hook that never fires - read the *Project settings resolve from the SESSION ROOT*
section of `claude-code-repair.md` in this skill's directory before diagnosing the harness.

### Refresh and diagnose Claude Code

A marketplace `git pull` updates the source clone, not necessarily the installed cache. **The
primary refresh path is the CLI's own two steps, verified end-to-end:**

```sh
claude plugin marketplace update <marketplace>   # refresh the clone, then re-run the ref check
                                                 # below (an update can silently un-pin)
claude plugin update <plugin>@<marketplace>      # re-point the install record at a fresh SHA-keyed
                                                 # cache dir (prints old → new); restart to apply
```

Two traps: `claude plugin install` **no-ops** when the plugin already shows installed, reporting
success while changing nothing; and where the install cache is **keyed by commit SHA**
(`cache/<marketplace>/<plugin>/<sha>/`), an in-place overwrite leaves the recorded SHA asserting
contents it no longer has. Prefer `update`
wherever it exists; the fallbacks are in `claude-code-repair.md`.

**Which release is installed: read it out of the payload.** The Claude `.claude-plugin/plugin.json`
is versionless and you must never add a version to it. `.codex-plugin/plugin.json` ships in the
**same installed payload both clients receive** and its `version` mirrors the package's CHANGELOG:

```sh
grep '"version"' <installPath>/.codex-plugin/plugin.json
```

Answer that first: a stale cache behaves correctly by older rules.

**Source/cache equality answers a different question - keep both.** It is a payload **integrity**
check: it proves the cache mirrors the clone, not *which release* either is, nor the ref the clone
tracks, which is the pin itself. Read the resolved ref back: the `<marketplace>`
entry's `source` object in `plugins/known_marketplaces.json` needs a `ref` that matches Project
Facts `release-branch` - not absent, and not `integration-branch` - then cross-check the clone with
`git -C plugins/marketplaces/<marketplace> branch --show-current`. Run it on any install.

**Run it again after EVERY marketplace update - an update can silently un-pin you.** A client
version may rewrite the entry from the pinned `github` shape to a bare `git` + `url` shape,
**dropping both `ref` and `autoUpdate`**, and re-create the clone as a **shallow, single-branch**
checkout of the repository's *default* branch - which for any repo following `adopt-conventions` is
the **integration** branch, so the consumer is one update away from unreleased work. **Only the ref
check shows it:** the version reads correct and a source/cache diff comes back clean. **A correct
version is not evidence of a correct pin.**

**`lastUpdated` is a cheap trigger for whether to re-run the ref check - never a health signal for
the pin itself.** It records the client's last rewrite of the marketplace entry (`grep -o
'"lastUpdated"[^,}]*' plugins/known_marketplaces.json`). Record it whenever you repair or verify the
pin (the three commands in `claude-code-repair.md`, *Repairing a broken pin*). On a later visit read
it first: unmoved means no update ran - skip the three-command check; moved means it is owed. Only
the three commands settle the pin's health.

**`gh api repos/<owner>/<repo>/commits` resolves the repository's DEFAULT branch** - for any repo
following `adopt-conventions`, the *integration* branch, so it returns **unreleased** history. Name
the ref (`gh api "repos/<owner>/<repo>/commits?sha=<release-branch>"`) whenever you ask what the
released version is.

Read `claude-code-repair.md` in this skill's directory when `claude plugin update` plus a restart
did not fix it: a second `--scope project` record `update` will not move, a client that cannot
refresh through its CLI, a failed ref check, or a live session that seems to run older rules (a
mid-session `autoUpdate` swap; an agent cannot introspect what it loaded, so such checks only prompt
a restart). Deliberate repeats: **the agent hands apply steps to the user and never runs them;
`installed_plugins.json` / `known_marketplaces.json` edits are user-owned; on a mismatch repair the
clone first, then the entry.**

## Codex

Codex uses `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`, and client state below
`~/.codex/`. Installed plugins load from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`,
not directly from the marketplace clone.

### Install

Add the Git marketplace pinned to its release ref, install the plugin, and inspect the result:

```sh
codex plugin marketplace add <marketplace-source> --ref <release-ref>
codex plugin marketplace list
codex plugin add <plugin>@<marketplace>
codex plugin list
```

The marketplace entry must point at a plugin root containing `.codex-plugin/plugin.json`; the
manifest needs strict SemVer and `skills: "./skills/"`. After installation, start a **new Codex
task**. Existing tasks retain the skill catalog they started with.

### Refresh and diagnose Codex

Upgrade the configured marketplace snapshot, reinstall, and inspect the installed version:

```sh
codex plugin marketplace upgrade <marketplace>
codex plugin add <plugin>@<marketplace>
codex plugin list
```

For a released plugin, `.codex-plugin/plugin.json` mirrors the package's CHANGELOG current version;
the validator must reject drift. Codex caches by marketplace, plugin, and version, so a changed
released payload requires a new SemVer. During unpublished local iteration only, use one build
metadata cachebuster (`<base>+codex.local-<timestamp>`), reinstall, then restore the exact CHANGELOG
version before committing.

If `codex plugin list` and behaviour disagree, inspect the cached `.codex-plugin/plugin.json`, check
that its skill directories exist, and compare the cached payload to the configured marketplace
snapshot; reinstall after correcting either. A listing proves discovery; invoke a skill to prove
load.

Codex does not load Claude `agents/*.md` as named custom agents. Verify specialist roles with the
plugin's `dispatch-role` skill in read-only smoke mode. Each smoke report must name the canonical
role file and end with `Skills consulted: ...`; do not accept an unscoped generic-agent response.

Confirm the pin on Codex too: read back `codex plugin marketplace list`'s entry for `<marketplace>`
and confirm its source still resolves to `<release-ref>`, and that the version segment of the
installed cache path and `codex plugin list`'s reported version match the `version` in
`.codex-plugin/plugin.json` of the marketplace source at `<release-ref>`, not unreleased
`integration-branch` content. On a mismatch, re-run `codex plugin marketplace add
<marketplace-source> --ref <release-ref>` (or correct the configured source directly), then
reinstall; if the reported version does not move, remove the stale cached entry first.

## Private-fork authentication (optional)

The public marketplace needs no credentials. A private fork needs credentials both clients can clone
with. Manual Git/CLI actions may use the OS credential manager while background update paths use
environment credentials, and a narrowly scoped `GH_TOKEN` can shadow the user's normal `gh` identity
for other repos. Never persist a token on the user's behalf; identify which credential path the
active client is using and hand any user-owned authentication change back explicitly.

## Fluyt values

For Fluyt, `<marketplace>` and `<plugin>` are both `fluyt`. Read the configured
marketplace source and release ref from the active client's marketplace record; do not hard-code a
consumer-specific source or guess an unpinned ref.

- Claude Code enable key: `fluyt@fluyt`; hard-verify with
  `/fluyt:ship-work-item` or a native `fluyt:*` agent.
- Codex install: as in *Install* above, with `fluyt@fluyt`; hard-verify a process skill and use
  `$fluyt:dispatch-role` smoke mode for specialist roles in a new task.
