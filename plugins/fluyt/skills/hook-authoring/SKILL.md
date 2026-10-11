---
name: hook-authoring
description: >-
  Use when adding a new Claude Code hook, editing a hooks.json entry, or designing any event hook
  that writes a file, stamps a timestamp, or resolves a path - before you author it, not at onboarding.
  Covers four recurring failure modes: a hook-written file sharing a path with a human-authored
  one, a timestamp stamped in the wrong timezone for what it gets compared against,
  `$CLAUDE_PROJECT_DIR` resolving to the session root rather than the repo root, and silent failure
  swallowing a real break unnoticed. Also settles async vs blocking, which event can BLOCK a tool
  call, whether a hook counts a tripwire or a metric, and the trust boundary a shipped hook keeps
  (no session-entry network or credentials, no runtime fetch, every hook disclosed).
---

# Hook authoring - four failure modes and a trust boundary, read before you write one

A per-authoring read, not a one-time onboarding: read it every time you **author** or edit a hook.
The trust boundary after the four failure modes is binding on any hook other people install.

## The four failure modes

### 1. A hook that writes must own its output file

A machine-appended file and a human-authored file must never share a path. A shared filename makes a
feed unrotatable, untrustable (a reader cannot tell which lines are which), undiffable, and can produce two same-named files - one
per session root - with only one git-ignored.

The shipped hook writes its own `docs/process/dispatch.local.md`, separate from the hand-written
friction log at `docs/process/retro-log.local.md`. Generalise: before a hook writes anything, give
its output a name no human process ever appends to, and git-ignore it if its content is derived and
disposable rather than a record worth keeping.

### 2. Stamp in the timezone of whatever the output will be compared against

A hook that stamps timestamps in UTC while everything a reader compares them against (a local
`git log`, a local-dated backup name) is local-dated makes comparisons across zones silently
mismatch near midnight, with no clue that a timezone mismatch is the cause.

Pick the timezone your comparisons actually live in - usually local, since that is what a human-dated
artefact in the same repo uses - and state it in the output itself (an explicit offset, not a bare
instant), so a reader never has to guess.

### 3. `$CLAUDE_PROJECT_DIR` is the session root, not the repo root

A session rooted one directory above the repo makes a hook that assumes `$CLAUDE_PROJECT_DIR` is the
repo write outside the repo entirely - to a same-named file the repo's own `.gitignore` never covers,
because that file isn't inside the repo at all.

The rule: a hook that must write **inside the repo** resolves upward from `$CLAUDE_PROJECT_DIR` to
the directory containing `.git` and verifies it found one before writing. A hook that writes to the
session root **by design** documents that choice, including what happens when the session root and
repo root differ. This is independent of a worktree spawn's stamp surviving cleanup (it lands in the
session's project dir): that does not help when the session root isn't the repo root.

### 4. Silent failure is a design choice, not a safe default

`2>/dev/null || true` (or any hook wrapped the same way) correctly keeps a broken hook from breaking
the session it's attached to - a hook error must never block a user's work. But the same wrapper
makes a broken hook indistinguishable from a quiet one: nothing tells you whether the hook ran,
failed, or was never wired up at all.

Swallow errors deliberately, not by default, and pair every silent-failure hook with something that
would notice its absence. This generalises past hooks: any check whose useful answer can legitimately
be "absent" needs a control case that must come back "present" - otherwise a check that always
reports absent and a check that never ran look identical.

What that control looks like for a hook, and the trap that makes it necessary, on Windows hosts.
First: **a hook script must contain no doubled backslash.** In a shell-to-runtime argv hand-off (`bash`
invoking `node`, or any equivalent), `\\` collapses to a single `\` before the runtime sees it, so a
pattern assembled from *strings* carrying `\\` arrives malformed, its construction throws, and the
hook's own fail-open `catch` swallows the throw - leaving a hook that allows everything, wearing
exactly the disguise this failure mode is about. Pattern **literals** with single backslashes
survive the hand-off intact; where a backslash is genuinely needed inside a string, build it from
its character code rather than typing it. A POSIX-only consumer may never hit this collapse - but
the control it implies is platform-independent, and is the half that matters: **the control is
executing the saved command string through the production path.** Reading the hook, grepping it, or
running its script straight through the runtime all report green on a hook that is dead in
production. Load the command from the settings/manifest file **on disk** - never a pasted copy of
it - run it the way the client runs it, with a case that must come back *blocked*.

The same collapse defeats the **verification**: a one-liner check invoked through the same
hand-off, itself containing `\\`, silently tests a different pattern than the one on the page. So
**a backslash-sensitive check runs from a script file, never an inline one-liner**,
and carries a control that would fail if the check had gone blind. **And the rule covers EDITS, not
only checks** - any inline command whose *payload* carries backslash-bearing content (a file splice,
a heredoc, a `-e` one-liner writing prose) crosses the same hand-off: an inline edit can collapse a
`\b` into a literal backspace in the written file. Backslash-bearing content is written through a
script file or a file-editing tool. The collapse also reaches fixture scaffolding: Node's
`NODE_OPTIONS` parser strips backslashes in a quoted `--require` path, so a preload stub given a
native Windows path throws before the hook runs and the fail-open swallow presents it as a silent
allow - pass forward slashes, and probe the stub.

The collapse has a sibling that survives every backslash discipline above: **spawning a child regex
engine at all.** A hook that shells out to `grep` hands its pattern through the same layered
quoting - on Windows hosts the pattern's `\b` can reach grep as a literal backspace via the
shell-string path, AND via the args-array path (the MSYS2 grep mangles it independently). Where the
hook runtime has a native regex engine, use it - an in-process literal crosses zero hand-offs, and
there is no child exit status for a fail-open `catch` to misread.

## Trust boundary of a shipped hook

A **shipped** hook - one in a plugin's `hooks.json` that other people install - runs unattended on
the installer's machine, so these rules bind it.

1. **A session-start (or other session-entry or every-prompt) hook never touches credentials or the
   network** - it runs before the user has asked for anything.
2. **No runtime instruction fetch.** A hook never downloads text, instructions or scripts and feeds
   them to the model or executes them; **everything it does is in the shipped `hooks.json`**.
3. **A network or credential call is allowed only when triggered by a tool call that already does
   the same kind of thing**, scoped to it, fail-open, and bounded by a timeout. Precedent: the plugin
   README's *Hooks* section.
4. **Every shipped hook is disclosed** in the plugin README's hooks section: event, trigger, what it
   reads and writes, whether it blocks, and whether it uses the network or credentials. A hook added
   without that is incomplete work.

## Operational notes

- **`async: true`** unless the hook must genuinely block the event it attaches to. A hook fires on
  every matching event, so keep its work O(1) - anything heavier belongs in a command the user runs
  deliberately, not something that runs unattended on every qualifying event.
- **Never interactive.** Nobody is present to answer a prompt a hook raises; design it to proceed,
  fail, or record - never to wait.
- **`PreToolUse` is the only event that can block a TOOL CALL.** A tool-use guardrail goes there and
  nowhere else - it is also the most expensive place for a bug, since a misfiring `PreToolUse` hook
  blocks legitimate work, not just its own. Other events are not all write-only: several gate their
  OWN flow (a prompt, a stop, a compaction), so check what your event can block or alter first. A
  mistake in an observational hook costs a bad log line; in a flow-gating event, blocked work.

## Tripwire, not metric

An event hook counts **events**, not the thing you actually care about - decide tripwire vs metric
before you write it, and put the caveat in the artefact itself, because a reader of the output
cannot tell the difference after the fact. For why this plugin's own dispatch feed is a tripwire and
never a metric, read the `scrum` skill's *Dispatch feed* bullet and the `scrum-master` role's
*Dispatch feed* bullet, which own that text.

## What this is not

This skill does not claim hook definitions are snapshotted at session start, or that a mid-session
edit has no effect until a restart - unverified, not asserted. A worktree-isolated agent loads the
**committed** definition and settings, so a hook change must be committed before an isolated spawn
can pick it up - see the `ship-work-item` skill's worktree-agent hygiene rule.
