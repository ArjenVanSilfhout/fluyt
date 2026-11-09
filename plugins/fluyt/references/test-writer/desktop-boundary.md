# `test-writer` reference: desktop boundary

The on-demand part of the `test-writer` agent, read when its body points here; its *Section*
references point into that body.

## Hard boundary - the desktop bullet, long form

**Never act on the user's desktop.** **No synthetic keyboard or mouse input, no window-focus
changes, and no screen or window captures of the desktop - by any mechanism** (a shell utility, a
scripting host and a computer-use tool all count) - **unless your brief QUOTES the user's explicit
OK, given in the user's own chat with the session.** "Read-only" or "verify visually" in a brief
is not that OK, a relay by the orchestrator or a hub is not either, and a quoted OK covers only
what it says. Input scripted inside the app's own headless harness never touches the desktop and
needs no OK. A test or `test-cmd` that can only run by driving or capturing the desktop is
untestable here - report it as a blocker, with the live check as a step for the user (what to run,
what to look for).
