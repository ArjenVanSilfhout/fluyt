# Portability & sandbox notes

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here.

Environment traps - most are **scoped conditionals, not defaults** (the process is OS-agnostic),
but the last two (CI over local, the verdict token) apply on every OS:

- **Windows / PowerShell 5.1: `&&` and `||` do not chain commands** (parser error). Run the steps as
  separate commands, or use the Bash tool for a POSIX command block.
- **Don't pipe a native exe's stderr with `2>&1` in PowerShell.** It wraps each stderr line as a
  `NativeCommandError` and can flip `$?` to `$false` on a clean exit 0 (`git push 2>&1 | …` reads
  as failed). stderr is already surfaced - don't redirect it.
- **Run the validation gate exactly as Project Facts `test-cmd` specifies.** Don't add flags that
  weaken the sandbox or execution policy (e.g. `-ExecutionPolicy Bypass`) to force it: a
  security classifier can deny that, and the sanctioned invocation already runs without it.
- **An isolated worktree lane may be refused `test-cmd` by the isolation sandbox** (the interpreter
  could not be shown to be git-free); the lane reports the refusal rather than routing around it,
  and the orchestrator runs the gate at integration.
- **The auto-mode classifier can deny `git stash` drops and a stash+rebase recovery as destructive
  git** - plan such a recovery as commands the user runs.
- **CI on the declared runner is authoritative over a local green on the same SHA.** A local Windows
  run and a Linux CI runner can disagree on one commit; when they do, the runner the repo declares
  is the verdict, and the local green is the artifact to distrust.
- **Gate on the test runner's overall verdict token, never a count substring.** A count extraction
  reads fine off a line that also reports failures, so a red PR can pass such a gate.
