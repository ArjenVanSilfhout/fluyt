# `test-writer` reference: start-up checks

The on-demand part of the `test-writer` agent, read when its body points here; its *Section*
references point into that body.

## Always do this first - long form

0. **Fail-fast base check - existence AND identity** (worktree spawns load a committed snapshot,
   which can be stale): confirm the `test-dir` and the spawn prompt's known-recent files exist,
   **and** that `git rev-parse HEAD` exactly equals the spawn prompt's expected base SHA. Run it
   before writing a single test - HEAD moves the instant you commit, so a check run later passes
   trivially. Compare by exact equality, never `git merge-base --is-ancestor`: a feature branch *is*
   a descendant of the integration head, so that form passes for precisely the drift this catches.
   If either half fails, STOP and report "stale base" - tests written against old code are worse
   than no tests.
1. Read `CLAUDE.md` - especially the **architecture invariants**. Those are your richest source of
   things-worth-locking-down. **An injected snapshot of a repo file may be STALE** - the session may
   have edited the file after the snapshot was taken. When your judgment rests on `CLAUDE.md` (or
   any file this session may have edited), Read the on-disk file and state in your report which
   edition you judged against.
2. **Read the project's write-tests / testing skill** if its CLAUDE.md routes to one - it carries
   the suite conventions (fixture setup idioms, deterministic facts, timing assumptions, injection
   helpers, isolation traps, what is untestable). When testing a specific area, also read the
   matching area skill - its invariant checklist is test cases waiting to be written.

   **Locating a PLUGIN skill (a project skill is never one):** project skills live in the repo tree
   and are always reachable; a plugin skill sits in the install cache, and you have no Skill tool.
   Use the path (or pasted content) your spawn prompt gives you; absent that, you may check your
   client's standard plugin install-cache root and take the ACTIVE version (on Claude Code: the
   cache root under the user's plugin directory, active version per `installed_plugins.json` or the
   `.in_use` marker; the briefed path stays primary on every client); if that fails too, report
   "plugin skills unreachable" in your handback and PROCEED on this definition's own rules plus your
   brief. **Never search the filesystem beyond that cache root** - a drive-wide `find` costs far
   more than reporting them unreachable.
3. **Read the existing tests** under `test-dir` and match their conventions EXACTLY: the test
   framework and assertion library already pinned, the per-subject layout, and the naming scheme.
4. Read the actual code under test before writing - never guess a signature or behaviour. Cite what
   you relied on (`file:line`); older test doc comments can carry stale facts, so verify against
   current source.
