---
name: install-refresh-plugin
description: >-
  Install, refresh, and diagnose a Fluyt-style marketplace plugin on Claude Code or
  Codex. Use when a plugin will not load, a marketplace update did not reach the installed cache,
  the loaded version is unclear, or a newly installed skill/role adapter is missing. Keeps the two
  clients' manifests, caches, enablement records, refresh commands, and restart/new-task boundaries
  explicit instead of applying one client's repair steps to the other.
---

# Install / refresh / diagnose a plugin by client

First identify the active client: **Claude Code** or **Codex**. Do not mix their state directories
or repair commands. Use the matching section below with `<marketplace>`, `<plugin>`,
`<marketplace-source>`, `<release-ref>`, and `<plugin-source-path>` filled from the installed
marketplace and the consumer's Project Facts. `<plugin-source-path>` is the `<plugin>` entry's
`source` in the marketplace manifest, resolved relative to the **marketplace clone root** - the
directory holding `.claude-plugin/marketplace.json`, not the plugin's own `.claude-plugin/` - with
any leading `./` dropped; it is `.` when the plugin sits at that root.

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
every key that file declares silently takes its default. Nothing warns you, and no output names the
file that was skipped.

**It does not look like a settings problem**: a setting declared in the repo appears to have no
effect, and behaviour matches the *documented default*. That reads as a harness defect, so the
search goes to the wrong place.

**The check** - compare the directory the session resolves from against the location of the settings
file you expect to apply, then confirm the key is present in the **loaded** one, not merely in the
one you meant:

```sh
ls <session-root>/.claude/                                   # the settings that actually load
grep -sn '<the key>' <session-root>/.claude/settings*.json   # no output ⇒ not in effect
grep -sn '<the key>' <repo>/.claude/settings.json            # present ⇒ declared but skipped
```

**Use `-s`, and read the OUTPUT - not the exit code.** With no `settings*.json` in the directory the
glob does not expand and a bare `grep` reports "No such file or directory" - precisely in the state
you are diagnosing. `-s` suppresses that message, so an absent file reads as an absent key. It does
**not** normalise the exit status: **2** when nothing matched the glob, **1** for a clean no-match,
**0** when the key was found - so a check keyed to exit 1 for "not in effect" silently misses the
no-file case. Read what the command prints.

There is a **third** layer this two-way comparison does not show: user-level settings
(`~/.claude/settings.json`, `%USERPROFILE%\.claude\settings.json` on Windows), which requirement 4
above already treats as its own scope. Check it too before concluding a key is nowhere in effect.

Requirement 2 above matches an install record against the repo being opened, so run both checks from
the same place: the directory the session actually resolves from, not the one the work is in.

**Do not diagnose this from downstream behaviour.** Observing a worktree on an unexpected ref is
*consistent with* several causes and does not discriminate; reading the loaded settings does.

### Refresh and diagnose Claude Code

A marketplace `git pull` updates the source clone, not necessarily the installed cache. **The
primary refresh path is the CLI's own two steps, verified end-to-end:**

```sh
claude plugin marketplace update <marketplace>   # refresh the clone — then re-run the ref check
                                                 # below; an update can silently un-pin
claude plugin update <plugin>@<marketplace>      # re-point the install record at a fresh
                                                 # SHA-keyed cache dir (prints old → new); restart
                                                 # the client to apply
```

Two traps beside them: `claude plugin install` **no-ops** when the plugin already shows installed -
it is not a refresh command and reports success while changing nothing; and on a
client whose install cache is **keyed by commit SHA** (`cache/<marketplace>/<plugin>/<sha>/`), an
in-place cache overwrite leaves the recorded SHA asserting contents it no longer has, where
`update` mints a new correctly-named directory instead. Prefer `update` wherever it exists; the
paths below are the fallback.

**One `--scope project` record per session folder: `update` moves only ONE** (measured on Claude
Code 2.1.296). A `.claude/settings.json` per folder gives each its own record, and `update` from a
later folder resolved to the **first** folder's, reporting "already at the latest". Stale records
differ in `gitCommitSha` from the refreshed one (`<folder>` below: its `projectPath`). **The agent
hands these steps to the user and never runs the apply;** restart afterwards. A dry run that
throws means `<folder>` matched no `projectPath`. Run (a) once: a re-run overwrites the original
`.bak`.

```sh
F=~/.claude/plugins/installed_plugins.json; cp "$F" "$F.bak"   # a
S='const fs=require("fs"),[f,k,p]=process.argv.slice(1),j=JSON.parse(fs.readFileSync(f,"utf8")),
r=j.plugins[k].find(x=>x.projectPath==p);for(const x of j.plugins[k])if(x.scope=="project"&&
x.gitCommitSha!=r.gitCommitSha)for(const c of["installPath","version","gitCommitSha"])
{console.log(x.projectPath,c,x[c],"->",r[c]);x[c]=r[c]}
if(process.env.APPLY)fs.writeFileSync(f,JSON.stringify(j,null,2))'
node -e "$S" "$F" <plugin>@<marketplace> <folder>   # b: dry run
APPLY=1 node -e "$S" "$F" <plugin>@<marketplace> <folder>   # c: apply
```

**Fallback - overwrite the cache from the source clone** (when the client cannot refresh through
its own CLI), without deleting unrelated state. Paths below are relative to the client state root
above; `<installPath>` is the absolute path recorded in the install record:

```sh
cp -R plugins/marketplaces/<marketplace>/<plugin-source-path>/. <installPath>/
```

This copy applies only when the entry's `source` is a path inside the clone. An object `source`
(`npm`, `url`, `github`, `git-subdir`) fetches the payload from elsewhere, so there is nothing under
the clone to copy - reinstall through the client instead.

An agent may be able to copy into `<installPath>` while still being denied deletion or edits to
`installed_plugins.json`; hand those user-owned steps back explicitly. Diagnose the loaded payload
by diffing `<installPath>` against the marketplace source or grepping a marker in a cached skill or
agent file. Do not trust the cache directory's SHA after an in-place overwrite. Hard-verify by
invoking a plugin skill or spawning a native plugin agent.

**Which release is installed: read it out of the payload.** The Claude `.claude-plugin/plugin.json`
is deliberately versionless for a track-release-branch marketplace, and you must still never add a
version to it. The release is readable anyway: `.codex-plugin/plugin.json`
ships in the **same installed payload both clients receive**, its `version` mirrors the package's
CHANGELOG, and one grep of it names the installed release outright:

```sh
grep '"version"' <installPath>/.codex-plugin/plugin.json
```

Use that as the first question you answer: a stale cache does not misbehave, it behaves
correctly by older rules, so nothing surfaces the gap except the version.

**Source/cache equality answers a different question - keep both, don't substitute one for the
other.** Equality is a payload **integrity** check: it proves the cache mirrors the clone, not
*which release* either of them is - so it will report a healthy install that is six versions
behind, and says nothing about which ref the clone is tracking, which is the pin itself. Read the
resolved ref back and compare it to the declared one: check the `<marketplace>` entry's `source`
object in `plugins/known_marketplaces.json` for a `ref` field that matches Project Facts
`release-branch` - not absent, and not `integration-branch` - then cross-check the clone directly
with `git -C plugins/marketplaces/<marketplace> branch --show-current`, since the clone reports
whichever branch it actually holds regardless of what the JSON claims. Run this check on any
install; it is a routine diagnostic, not evidence of a specific client defect.

**Run it again after EVERY marketplace update - an update can silently un-pin you.** A client
version may rewrite the entry from the pinned `github` shape to a bare `git` + `url` shape,
**dropping both `ref` and `autoUpdate`**, and re-create the clone as a **shallow, single-branch**
checkout of the repository's *default* branch - which for any repo following `adopt-conventions` is
the **integration** branch. The consumer is then one update away from receiving unreleased work.

**This is invisible to every check except the ref check.** Immediately after a release the release
and integration branches are content-identical, so `.codex-plugin/plugin.json` reads the correct
release and a source/cache diff comes back clean. **A correct version is not evidence of a correct
pin.**

**`lastUpdated` is a cheap trigger for whether to re-run the ref check below - never a health signal
for the pin itself.** The marketplace entry's `lastUpdated` field records when the client last
rewrote the entry. Record its value whenever you repair or verify the pin (the three commands
below):

```sh
grep -o '"lastUpdated"[^,}]*' plugins/known_marketplaces.json
```

On a later visit, read it again first. Unmoved means no update ran since - skip the three-command
check. Moved means one did, and the check is owed. Neither state proves the pin's health; only the
three commands settle it.

On a mismatch, repair **both halves** - the JSON alone is not enough - and repair them **in this
order**, because the order decides what a half-finished repair leaves behind:

1. **The clone - do this first.** Its fetch refspec is rewired, not just its checked-out branch, so
   `git checkout <release-branch>` fails outright with *pathspec did not match*. Widen the refspec
   first, or the fetch cannot see the branch at all:
   ```sh
   git -C <clone> config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
   git -C <clone> fetch origin <release-branch> --depth=1
   git -C <clone> checkout -B <release-branch> origin/<release-branch>
   ```
2. **The entry - only once the clone is verified on the release branch.** Restore the pinned source
   shape, since the broken state has no `ref` field to edit:
   `"source": {"source": "github", "repo": "<owner>/<repo>", "ref": "<release-branch>"}`, plus
   `"autoUpdate": true` if it was dropped. Write UTF-8 **without a BOM** - a strict parser rejects
   one. Writing the entry first risks the failed-clone-repair state the note below warns about.
   **Edit the entry programmatically - parse the file, mutate `source`, re-serialise - rather
   than hand-writing it.** Its `installLocation` values may be Windows paths whose backslashes must
   be doubled in JSON; a shell heredoc can collapse them and produce invalid JSON the client
   rejects. Parsing and re-serialising also satisfies the no-BOM requirement by construction.

Repairing only the JSON is **worse than leaving it**: the entry then asserts a pin that nothing
honours, and the reader has no reason to run the clone check again. **That is why the clone goes
first** - when the clone repair is the half that fails, nothing has been claimed, the entry still
shows the broken bare-`git` shape, and the next reader's check still fires.

Verify with the three commands that settle it. The first two read the clone's real state, so no
amount of writing the JSON can satisfy them; the third confirms the entry itself carries the pin:

```sh
git -C <clone> branch --show-current                   # must read: <release-branch>
git -C <clone> config --get-all remote.origin.fetch    # must include refs/heads/<release-branch>
grep -o '"ref"[^,}]*' plugins/known_marketplaces.json  # must be present
```

Whichever path got you here - a clean verification or a completed repair - record the entry's
`lastUpdated` value now as the baseline for deciding whether the three commands above are owed
again.

Known sharp edge: `/plugin install` can no-op when the plugin already shows installed, and `/plugin
marketplace update` can report the plugin as not found against the corrected entry - if either
happens, fall back to a full uninstall then a clean reinstall so the clone is redone against the
fixed ref. **Read the install records first, though:** `installed_plugins.json` can hold records at
several scopes (user, plus per-project entries for OTHER repos), and an uninstall can take those
with it - where the pin is intact and only the payload is behind, the `update` path above refreshes
without touching any of them, which is why it is the primary path.

**Naming the ref matters on the remote side too: `gh api repos/<owner>/<repo>/commits` resolves the
repository's DEFAULT branch.** For any repo following `adopt-conventions`, the default branch is the
*integration* branch - so that call returns **unreleased** history, and reading a version out of it
reports work consumers have not received. Name the ref explicitly (`gh api
"repos/<owner>/<repo>/commits?sha=<release-branch>"`) whenever you are asking what the released
version is. Getting this wrong is silent: the answer looks plausible but is ahead of what is pinned.

### The SESSION's own loaded payload can be stale, even when the cache above is fresh

**Lead with the honest limit: an agent cannot introspect the text it already loaded.** Everything
below is a heuristic that prompts a **restart** - never a proof.

Every check above compares the **installed cache** against the **marketplace clone or its pin**.
None of them compare the **payload this session loaded** against the installed cache - a separate
gap. `"autoUpdate": true` (trade-off below) is what makes it reachable: a release can land under a
*live* orchestrator mid-session. The cache re-points to the new payload and the previous payload
directory is left behind, marked `.orphaned_at`, rather than deleted. Every subagent spawned
**after** that moment loads the new payload; the orchestrator itself keeps whatever it loaded at
session start, - nothing about a running session re-reads the cache. The result is silent, as with a
stale cache: the orchestrator behaves correctly by older rules, and nothing surfaces the gap except
the version.

Two cheap, non-conclusive signals:

1. **Name the installed release at ritual start**, reusing the grep above
   rather than a new mechanism. Its
   value is not detection - it puts the number **in the transcript**, so a later mismatch against a
   subagent's self-reported version becomes at least noticeable.
2. **More than one payload directory under the plugin's cache root**
   (`cache/<marketplace>/<plugin>/`), with the live one not being the one the session started under,
   is the observable signature: the `.orphaned_at`-marked sibling is the previous payload.

**Both signals are prompts to restart the client - state the remedy plainly.** If a restart is not
available and a session suspects it is stale, the interim discipline at load-bearing steps is to
read the **marketplace-source copy** (the plugin's own home repo, working tree) or the
**freshly-updated cache copy**, read directly as a file rather than recalled from memory - and to
remember the loaded **skill catalog itself does not refresh this way**: a skill added, renamed, or
removed since load stays invisible until restart, whichever file you check.

**This is a third instance of the SESSION being the unit that decides what loads.** Project settings
resolving from the session root (above) is the first; a shipped hook always writing into the
*session's* project directory rather than an isolated worktree checkout is the second (the `scrum`
skill's dispatch-feed `SubagentStop` hook); this is the third.

**`autoUpdate` is a choice with both costs - present them, recommend neither.** `true` is what makes
the mid-session swap above reachable at all; `false` trades that freshness for stability, turning an
update into a deliberate act at a session boundary. Choose it knowingly rather than inheriting
whichever a template defaulted to.

## Codex

Codex uses `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`, and client state below
`~/.codex/`. Installed plugins are loaded from
`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, not directly from the marketplace clone.

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
snapshot. Reinstall after correcting either source. A listing proves discovery; invoke a skill to
prove load.

Codex does not load Claude `agents/*.md` as named custom agents. Verify specialist roles with the
plugin's `dispatch-role` skill in read-only smoke mode. Each smoke report must name the canonical
role file and end with `Skills consulted: ...`; do not accept an unscoped generic-agent response.

Confirm the same question on Codex regardless of the Claude Code check above: read back `codex
plugin marketplace list`'s entry for `<marketplace>` and confirm the source it reports still
resolves to `<release-ref>`, then check that the version segment of the installed cache path
(`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`) and `codex plugin list`'s reported
version match the `version` in `.codex-plugin/plugin.json` of the marketplace source at
`<release-ref>`, not unreleased `integration-branch` content. On a mismatch, re-run `codex plugin
marketplace add <marketplace-source> --ref <release-ref>` (or correct the configured source
directly), then reinstall; if the reported version does not move, remove the stale cached entry
first so the corrected ref has something to install into.

## Private-fork authentication (optional)

The public marketplace needs no credentials. If you install from a private fork, both clients need
credentials that can clone it. Manual Git/CLI actions may use the OS credential manager while
background update paths use environment credentials. A narrowly scoped `GH_TOKEN` can shadow the
user's normal `gh` identity for other repos. Never persist a token on the user's behalf; identify
which credential path the active client is using and hand any user-owned authentication change back
explicitly.

## Fluyt values

For Fluyt, `<marketplace>` and `<plugin>` are both `fluyt`. Read the configured
marketplace source and release ref from the active client's marketplace record; do not hard-code a
consumer-specific source or guess an unpinned ref.

- Claude Code enable key: `fluyt@fluyt`; hard-verify with
  `/fluyt:ship-work-item` or a native `fluyt:*` agent.
- Codex install: as in *Install* above, with `fluyt@fluyt`; hard-verify a process skill and use
  `$fluyt:dispatch-role` smoke mode for specialist roles in a new task.
