# `developer` reference: start-up checks

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Always do this first - long form

0. **Fail-fast base check - existence AND identity** (worktree spawns load a committed snapshot,
   which can be stale): confirm the known-recent files the spawn prompt names exist **and** that
   `git rev-parse HEAD` is exactly equal to the expected base SHA the spawn prompt states. Run it
   first, before any edit or commit - HEAD moves the instant you commit, so a check run later either
   misreads your own work as drift or passes trivially. Compare by exact equality, never `git
   merge-base --is-ancestor`: a feature branch *is* a descendant of the integration head, so that
   form passes for precisely the drift this catches. If either half fails, STOP immediately and
   report "stale base" - do no work on old code.
1. **Read `CLAUDE.md` in full** - it is the working agreement the *Precedence* rule above defers
   to, and its own *Ask the human when* list is a gate on top of the ones listed there. Internalise
   its build/run workflow, its **architecture invariants**, its code style, and its "reason deeply /
   confirm design changes" rules. Read its **Project Facts** block (and the `facts-file` it names,
   if any - lookup per the Project Facts contract) - you'll use `build-cmd` / `test-cmd` / `run-cmd`
   / `test-dir` from it. **An injected snapshot of a repo file may be STALE** - the session may have
   edited the file after the snapshot was taken. When your judgment rests on `CLAUDE.md` (or any
   file this session may have edited), Read the on-disk file and state in your report which edition
   you judged against.
2. **Read the matching project skills** the CLAUDE.md routes to (one `Read` each):
   the orientation/codebase-map skill first if the project has one, then the area skill(s) the task
   touches. These are fact-checked checklists - trust them over memory; **if a skill and the code
   disagree, the CODE wins** - note the drift in your report.

   **Locating a PLUGIN skill (a project skill is never one):** project skills live in the repo tree
   and are always reachable; a plugin skill sits in the install cache, and you have no Skill tool.
   Use the path (or pasted content) your spawn prompt gives you; absent that, you may check your
   client's standard plugin install-cache root and take the ACTIVE version (on Claude Code: cache
   root under the user's plugin directory; active version via `installed_plugins.json`/`.in_use` -
   briefed path stays primary on every client); if that fails too, report "plugin skills
   unreachable" in your handback and PROCEED on this definition's own rules plus your brief. **Never
   search the filesystem beyond that cache root** - a drive-wide `find` costs far more than
   reporting them unreachable.
3. Read the exact files the task touches and their neighbours, so your change matches the
   surrounding code and you don't break a caller.
4. **Checkpoint before your first edit - a backgrounded or large-slice run is invisible until you
   report.** Dispatch is **backgrounded by default** (`ship-work-item`'s *Dispatch in the
   background*), so treat this as standing: once the reading block (steps 1–3) is done and before
   your first `Edit`, emit a one-line progress checkpoint as plain output - e.g. `Recon done: base
   confirmed, N files + M skills read; editing A → B → C now`. **Skip it only when the spawn prompt
   told you you are running synchronously *and* the slice is not a large multi-file one** - a
   blocking orchestrator is already waiting on your return, but a long slice still benefits from the
   signal. Without it, a slow-but-working run looks like a stall - the orchestrator sees only your
   terminal *Report back*. Then, for a set of independent files, you may interleave read→edit per
   file rather than deferring every edit until all are read - but this never trims coverage: still
   read each file's neighbours first (step 3 holds), and when a later file could change an earlier
   edit, read those first. (This is the emitting half; the orchestrator's half - telling a working
   agent from a dead one, resuming vs re-dispatching - is the `agent-liveness` skill.)
