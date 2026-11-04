# The process check - when mtimes are structurally silent

The on-demand part of the `agent-liveness` skill, read when its `SKILL.md` points here; its *A
returned agent is not a running one* and *What death actually looks like* references point into
that `SKILL.md`.

Mtimes answer only once the agent has started writing. A slice whose long pole runs *before* its
first write - a baseline test run during recon, a measurement its brief told it to take, a long
build to establish a starting point - leaves the mtime signal nothing to report while that command
lasts. That window is when a slow agent is most likely to be mistaken for a dead one.

There, and only there, a second signal exists: **is the long command the brief named actually running?**

```sh
pgrep -af "<the agent's worktree path>" | grep -v pgrep   # drop the row for this query itself
```

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*<worktree path>*' -and $_.ProcessId -ne $PID }
```

Use `-like` rather than `-match` above: `-match` is a regular expression, and a Windows path's
backslashes are read as escapes - `<drive>:\Repos\...` fails outright on `\R`, and a path whose
segments start with `s`, `w`, `d`, `b` or `a` silently matches nothing at all.

Four constraints, all load-bearing:

- **Match the worktree path, never the program name.** In a parallel drain every lane runs the same
  program - and so do you. A match on the program name finds a sibling lane, or your own test run,
  and reports it as the lane you asked about. The path in the command line is what attributes a
  process to a lane - but only when the invocation carries the path (an absolute path, or a
  `-C`-style path argument). An agent that changes directory into its lane and runs a bare command
  leaves nothing to match, and the check is silent. Where your lanes share one checkout there is
  nothing to attribute against: skip this signal.
- **Discount your own query.** The check contains the path, so the shell running it matches - a
  naive command reports itself as proof of life every time, even where nothing of the agent's is
  running. Exclude the querying process, and discard any row that is your own shell or editor; only
  the long command the brief named counts.
- **It proves the command is alive, not the agent.** A command an agent launched detached outlives
  that agent's return, so a parked lane can still show a running process. A match ends the enquiry
  only once you have confirmed no report arrived - per *A returned agent is not a running one* (`SKILL.md`).
- **Its absence proves nothing** - the command may have finished a second ago, or never been reached.
  Absence returns you to the pair in *What death actually looks like* (`SKILL.md`); it does not
  substitute for it.

The signal answers for **the command the brief named**, not a fixed list: plenty of projects declare
no build and no test runner, and the long pole is as often a script from the brief.
