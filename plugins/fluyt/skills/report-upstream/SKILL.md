---
name: report-upstream
description: >-
  File a bug or feature request UPSTREAM about the fluyt plugin itself - a shared skill, agent,
  hook, or template - rather than the consumer's own backlog. Use whenever a shared component is
  broken, crashes, contradicts its own docs, assumes a Project Facts key that isn't in the contract,
  or is missing a capability that would help more than one project. Files to the plugin's home repo
  with the right labels, provenance stripped by default and only after the user approves the draft;
  main session only; refuses when Project Facts `report-upstream` is `off`; falls back to the web
  issue form when `gh` cannot reach it.
---

# Report upstream - file a bug or feature request against fluyt

This skill files feedback about the **shared plugin itself** (a skill, agent, hook, or template) to
the plugin's home repo, `ArjenVanSilfhout/fluyt`, so the fix lands once for every project.

## When to use this vs the `backlog` skill

- **`report-upstream`** - the bug or gap is in a **shared** component (a skill, agent, the
  `SubagentStop` hook, or a scaffolding template): the fix changes a plugin file.
- **`backlog`** - a work item for your own project: the fix changes a file in *this* repo.

## The upstream target (a deliberate constant)

This skill targets `ArjenVanSilfhout/fluyt` - the plugin's own home, the **one** repo slug a
shared asset may name: the plugin's identity, not a consumer project fact.

**This stays `gh`-shaped regardless of Project Facts `forge`** - filing targets the plugin's own
GitHub home, not the consumer's forge (a deliberate non-translation the `forge-azure-devops`
adapter records), so even a `forge: azure-devops` consumer uses `gh` here.

## Who may file, and when it is off

- **Main session only.** A session running as a dispatched sub-agent or an isolated worker **never
  files** (no `gh issue create`, no web form): it drafts the report and hands it back to its
  orchestrator, which shows the user and files.
- **Project Facts `report-upstream: off`** (absent = `on`): **refuse to file and say why** - the
  repo has opted out.

## Prerequisites

- **`gh` must be authenticated.** The repo is public; filing needs only a GitHub account.
  Check `gh auth status`. If `gh` cannot reach `ArjenVanSilfhout/fluyt`, skip to
  **"No `gh`? Use the web form"** below.
- **Be on the latest plugin first.** Run `/plugin marketplace update fluyt` - the bug may
  already be fixed on current `main`. Note the installed release version (step 2).

## 1. Decide: bug or feature

- **Bug** - a shared component misbehaves, contradicts its docs, or assumes a key outside the
  contract.
- **Feature** - a shared component lacks a capability, or a new shared asset would help several
  projects.

## 2. Gather the report

Collect before filing:

- **Provenance - stripped by default.** The public-facing text (title, body, repro, comments)
  carries **no consumer repo name or slug, no local paths, no machine names, no person names, and no
  project facts**; generalize or drop them from the repro and quoted output. Add the origin repo
  (`gh repo view --json nameWithOwner -q .nameWithOwner`, else `git remote get-url origin`) **only
  if the user opts in for this filing** after seeing the draft.
- **Component** - the exact shared asset: the skill / agent / hook / template name (e.g.
  `ship-work-item`, `preflight-reviewer`, `hooks.json`, `CLAUDE-project-facts.md`).
- **The substance:**
  - *Bug:* expected vs actual, plus the **smallest repro** (the command / step / prompt that
    triggers it, and any message).
  - *Feature:* the problem it solves, a sketch of the desired behaviour, and **why it belongs in the
    shared plugin** (which other project benefits) rather than as a local skill.
- **Version note - state the installed release; you can always determine it.** The Claude manifest is
  versionless, but `.codex-plugin/plugin.json` ships in the same payload on both clients and its
  `version` mirrors the package CHANGELOG:
  `grep '"version"' <installPath>/.codex-plugin/plugin.json`. Give that version, plus the date and
  installed commit if known. "On latest `main`" alone cannot be triaged against a release.

## 3. De-dupe (lightly)

Scan for an existing report:

```sh
gh issue list --repo ArjenVanSilfhout/fluyt --state all --label from-consumer \
  --limit 1000 --json number,title,state
```

**If the count returned equals the limit, the list was cut** - raise the limit and re-run.

Scan the titles for the same component + symptom. On a clear match, add your detail as a
**comment** instead of a new issue and stop:

```sh
gh issue comment <n> --repo ArjenVanSilfhout/fluyt --body-file <file>
```

Do **not** rely on `gh issue list --search` for a freshly-filed duplicate - the index lags; the
`--label from-consumer` list above is the reliable scan.

## 4. Confirm before filing

Filing **publishes outside the consumer's own repo** - a durable, public record on
`ArjenVanSilfhout/fluyt`. Treat it like any outward-facing
action: **propose first, then send.**

- **Strip first, then show:** apply the provenance rules from step 2 *before* the draft appears, so
  the user sees what will actually be published.
- Show the user the exact **title**, **labels**, and **full body**, verbatim as they will appear.
- Offer the opt-in: adding the origin repo (a `**From:**` line) is the user's per-filing choice.
- Get explicit confirmation. If the user wants changes, revise and re-show before filing.
- Only after they confirm, run the `gh issue create` in step 5.

This is the `scrum` / `adopt-conventions` propose-first posture, and matters most here: this is the
one skill writing to a repo *other* than the one you're in.

## 5. File it

Write the body to a temp file (inline quoting breaks multi-paragraph bodies), then:

```sh
gh issue create --repo ArjenVanSilfhout/fluyt \
  --title "[bug] <component>: <one-line summary>" \
  --label "bug,from-consumer" \
  --body-file <file>
```

- **Label** - `bug` for a defect, `enhancement` for a feature request, **always plus
  `from-consumer`** (all three must exist on the repo). Do **not** apply the tier labels
  (`must` / `should` / `could`) - tiering is the maintainer's triage call.
- **Title** - prefix `[bug]` or `[feat]`, then `<component>: <summary>`.
- **Body** - use this shape (it mirrors the repo's issue-form templates):
  - **From:** `<consumer repo>` - **only on the user's opt-in** (step 4); otherwise **omit the
    line** (`from-consumer` already marks consumer feedback).
  - **Component:** `<skill / agent / hook / template name>`
  - *Bug:* **Expected vs actual** + **Repro** - or *Feature:* **Problem** + **Desired behaviour** +
    **Why it belongs in the shared plugin**
  - **Version:** the installed release version (step 2), plus `<date>` (+ commit if known)

## 6. After filing

- Give the user the issue URL and a one-line summary.
- The maintainer triages it on Fluyt (adds a tier label, schedules it). You do **not** manage its
  lifecycle from the consumer side.
- If it is blocking you *now*, record the local workaround in the consumer's decisions file and, if
  it changes local behaviour, file an item in the consumer's **own** backlog (`backlog` skill) to
  remove it once the upstream fix ships.

## No `gh`? Use the web form

If `gh` is unavailable or unauthenticated, file in the browser (same structured fields, as GitHub
issue forms):

```text
https://github.com/ArjenVanSilfhout/fluyt/issues/new/choose
```

Pick **Bug report** or **Feature request** and fill the form with the **same stripped, user-approved
draft** (leave any From field blank unless the user opted in). The main-session-only and `off` rules
above apply here too.

## Filing from Fluyt itself

In the Fluyt repo, "upstream" is this repo - use the `backlog` skill directly. `report-upstream` is
for the **downstream → upstream** direction.
