# Claude Code repair, stale payloads, and the session root

The on-demand part of the `install-refresh-plugin` skill, read when its `SKILL.md` points here; its
*Four load requirements* and *Which release is installed* references point into that `SKILL.md`.
Paths are relative to the client state root named there.

## Several `--scope project` records: `update` moves only ONE

Measured on Claude Code 2.1.296. A `.claude/settings.json` per folder gives each its own record, and
`update` from a later folder resolved to the **first** folder's, reporting "already at the latest".
Stale records differ in `gitCommitSha` from the refreshed one (`<folder>` below: its `projectPath`).
**The agent hands these steps to the user and never runs the apply;** restart afterwards. A dry run
that throws means `<folder>` matched no `projectPath`. Run (a) once: a re-run overwrites the
original `.bak`.

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

## Fallback - overwrite the cache from the source clone

Use it when the client cannot refresh through its own CLI; it deletes no unrelated state.
`<plugin-source-path>` is the `<plugin>` entry's `source` in the marketplace manifest, resolved
relative to the **marketplace clone root** - the directory holding
`.claude-plugin/marketplace.json`, not the plugin's own `.claude-plugin/` - with any leading `./`
dropped; it is `.` when the plugin sits at that root. `<installPath>` is the absolute path recorded
in the install record:

```sh
cp -R plugins/marketplaces/<marketplace>/<plugin-source-path>/. <installPath>/
```

This applies only when the entry's `source` is a path inside the clone. An object `source` (`npm`,
`url`, `github`, `git-subdir`) fetches the payload from elsewhere, so there is nothing under the
clone to copy - reinstall through the client instead.

An agent may be able to copy into `<installPath>` while still being denied deletion or edits to
`installed_plugins.json`; hand those user-owned steps back explicitly. Diagnose the loaded payload
by diffing `<installPath>` against the marketplace source or grepping a marker in a cached skill or
agent file. Do not trust the cache directory's SHA after an in-place overwrite. Hard-verify by
invoking a plugin skill or spawning a native plugin agent.

## Repairing a broken pin

On a mismatch from the ref check in `SKILL.md`, repair **both halves** - the JSON alone is not
enough - and **in this order**:

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
   one. **Edit the entry programmatically - parse the file, mutate `source`, re-serialise - rather
   than hand-writing it:** its `installLocation` values may be Windows paths whose backslashes must
   be doubled in JSON, which a shell heredoc can collapse; re-serialising also guarantees no BOM.

Repairing only the JSON is **worse than leaving it**: the entry then asserts a pin that nothing
honours. **That is why the clone goes first** - if the clone repair fails, the entry still shows the
broken bare-`git` shape and the next reader's check still fires.

Verify with the three commands that settle it. The first two read the clone's real state, so no
amount of writing the JSON can satisfy them; the third confirms the entry itself carries the pin:

```sh
git -C <clone> branch --show-current                   # must read: <release-branch>
git -C <clone> config --get-all remote.origin.fetch    # must include refs/heads/<release-branch>
grep -o '"ref"[^,}]*' plugins/known_marketplaces.json  # must be present
```

Known sharp edge: `/plugin marketplace update` can report the plugin as not found against the
corrected entry (and `/plugin install` no-ops) - if either happens, fall back to a full uninstall
and a clean reinstall so the clone is redone against the fixed ref. **Read the install records
first, though:** `installed_plugins.json` can hold records at several scopes (user, plus per-project
entries for OTHER repos), and an uninstall can take those with it - where the pin is intact and only
the payload is behind, `update` refreshes without touching any of them, which is why it is the
primary path.

## The SESSION's own loaded payload can be stale, even when the cache is fresh

**An agent cannot introspect the text it already loaded;** everything below prompts a **restart** -
never a proof.

Every check in `SKILL.md` compares the **installed cache** against the **marketplace clone or its
pin**; none compares the **payload this session loaded** against the installed cache. `"autoUpdate":
true` (trade-off below) makes that gap reachable: a release can land under a *live* orchestrator
mid-session. The cache re-points to the new payload and the previous payload directory stays behind,
marked `.orphaned_at`. Every subagent spawned **after** that moment loads the new payload; the
orchestrator keeps what it loaded at session start - a running session never re-reads the cache. The
result is silent: it behaves correctly by older rules.

Two cheap, non-conclusive signals:

1. **Name the installed release at ritual start**, reusing the grep in *Which release is installed*
   (`SKILL.md`). It puts the number **in the transcript**, so a later mismatch against a subagent's
   self-reported version is noticeable.
2. **More than one payload directory under the plugin's cache root**
   (`cache/<marketplace>/<plugin>/`), with the live one not being the one the session started under:
   the `.orphaned_at`-marked sibling is the previous payload.

**Both signals are prompts to restart the client.** If a restart is not available and a session
suspects it is stale, at load-bearing steps read the **marketplace-source copy** (the plugin's own
home repo, working tree) or the **freshly-updated cache copy** directly as a file, not from memory -
and remember the loaded **skill catalog itself does not refresh this way**: a skill added, renamed,
or removed since load stays invisible until restart, whichever file you check.

**`autoUpdate` is a choice with both costs - present them, recommend neither.** `true` makes the
mid-session swap above reachable at all; `false` trades that freshness for stability, turning an
update into a deliberate act at a session boundary. Choose it knowingly rather than inheriting a
template's default.

## Project settings resolve from the SESSION ROOT

**A session opened one directory above the repo never reads `<repo>/.claude/settings.json`**, and
every key that file declares silently takes its default; nothing warns you or names the skipped
file. **It does not look like a settings problem**: behaviour matches the *documented default*,
which reads as a harness defect.

**The check** - compare the directory the session resolves from against the location of the settings
file you expect to apply, then confirm the key is present in the **loaded** one, not merely in the
one you meant:

```sh
ls <session-root>/.claude/                                   # the settings that actually load
grep -sn '<the key>' <session-root>/.claude/settings*.json   # no output ⇒ not in effect
grep -sn '<the key>' <repo>/.claude/settings.json            # present ⇒ declared but skipped
```

**Use `-s`, and read the OUTPUT - not the exit code.** With no `settings*.json` in the directory the
glob does not expand and a bare `grep` reports "No such file or directory"; `-s` suppresses that, so
an absent file reads as an absent key. It does **not** normalise the exit status: **2** when nothing
matched the glob, **1** for a clean no-match, **0** when the key was found - so a check keyed to
exit 1 silently misses the no-file case.

There is a **third** layer this two-way comparison does not show: user-level settings
(`~/.claude/settings.json`, `%USERPROFILE%\.claude\settings.json` on Windows), which requirement 4
of *Four load requirements* already treats as its own scope. Check it too before concluding a key is
nowhere in effect. Requirement 2 matches an install record against the repo being opened, so run
both checks from the directory the session actually resolves from, not the one the work is in.

**Do not diagnose this from downstream behaviour.** Observing a worktree on an unexpected ref is
*consistent with* several causes and does not discriminate; reading the loaded settings does.
