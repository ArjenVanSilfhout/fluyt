# Contributing

Fluyt is a small, solo-maintained plugin marketplace shipping one plugin, `fluyt`:
process assets (skills, agent roles, Claude Code hooks, scaffolding templates) for Claude Code and
Codex. Thanks for considering a contribution.

## Scope

Welcome:

- Bug reports and fixes for existing skills, roles, hooks and templates.
- Documentation corrections.
- Reports that a shipped instruction is wrong, unclear or contradicts another one.

**New skills are generally not accepted.** The plugin stays small on purpose: every skill is a
maintenance cost and a context cost for everyone who installs it.

## Issue before PR

**Open an issue first** (use the bug or feature template) and wait for a go before writing a PR.
Small typo fixes may skip this.

- Questions go to GitHub Discussions (Q&A), not issues.
- Security problems: see [`SECURITY.md`](SECURITY.md). Never file them as a public issue.
- If you use the plugin, you can file from your own repo with the `report-upstream` skill.

## Response expectation and time budget

This is a solo-maintainer project. **Best effort, no SLA.** Issues are usually triaged within two
weeks. A few hours a month go to outside contributions.

## Making a change

- Branch off `dev` (the integration and default branch) and open the PR against `dev`. `main` is
  the release branch; changes reach it only through a release.
- Run the local gate before opening the PR: `pwsh -NoProfile -File scripts/validate-local.ps1`.
  Windows PowerShell 5.1 refuses to run it only because of its execution policy. CI is authoritative.
- Read the "Invariants" section of `CLAUDE.md` before touching anything under `plugins/`. In
  particular:
  - **No project-specific facts under `plugins/`** (project, framework or repo names, paths, build
    commands).
  - **A citation in a shipped file must resolve for the person who installs it.** Cite a version,
    not an issue number.
  - **Never add a `version` field to `.claude-plugin/plugin.json`.**

## Licence

Contributions are accepted under the repository's MIT licence (see `LICENSE`), the same licence
that covers the skills, roles and templates.

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
