# Security Policy

## Reporting a vulnerability

**Report privately through GitHub's private vulnerability reporting. Do not open a public issue
for a vulnerability.**

Open the repository's **Security** tab and choose **Report a vulnerability**, or go straight to
<https://github.com/ArjenVanSilfhout/fluyt/security/advisories/new>. This is the only
reporting channel; no email address is published.

## Supported versions

**Only the latest minor release on the release branch (`main`) receives fixes.** Older minors get
no fixes, so update to the latest release before reporting.

## Response

This project is maintained by one person. Reports are handled on a best-effort basis, with **no
guaranteed response time and no guaranteed fix time**.

## Scope

The plugin ships prose instructions (skills and agent roles), Claude Code hooks, and templates.
The hooks (see `plugins/fluyt/hooks/hooks.json`) run local `node -e` one-liners: one logs
subagent completion to a file under the project's `docs/process/` directory, the others inspect a
Bash command about to run and either add a note or deny it.

In scope:

- A hook that can be made to run, or to block, something it should not, or that writes outside
  the project repository.
- Shipped instructions that would lead an agent to leak secrets, run destructive commands without
  confirmation, or load instructions from a remote source.

Out of scope: vulnerabilities in Claude Code, Codex, `gh`, or GitHub themselves. Report those to
their vendors.
