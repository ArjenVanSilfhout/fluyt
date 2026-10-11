---
name: backlog
description: >-
  GitHub-Issues backlog conventions — how to pick the next work item, file new issues, re-tier,
  record decisions, and run the hygiene scan. Use whenever you pick work, file / prioritise /
  re-tier / relate a backlog item with `gh`, run a backlog hygiene pass, or the user drops raw
  ideas to be filed. Reads the tier-label scheme and milestones flag from Project Facts — it never
  assumes a label naming convention.
---

# Backlog — GitHub Issues

The backlog lives in **GitHub Issues**. This skill is the *how*; the consumer's `CLAUDE.md` /
Project Facts is the authority on the *which repo* and *which labels*. `gh` needs network + auth; if
it breaks, fix that first — the backlog is unreachable without it.

**When Project Facts `forge` is not `github`**, the `gh`-based steps below translate per that
forge's adapter skill (`forge-azure-devops` for Azure DevOps); the selection order and hygiene
rules here stay authoritative.

## Read the scheme from Project Facts FIRST

Read the `backlog` key in the consumer's Project Facts. It declares:

- the **repo** the issues live on;
- the **tier-label scheme** — the MoSCoW label names in use (default: plain
  `must`/`should`/`could`; e.g. `prio:must`/`prio:should`/`prio:could` on some projects — always the
  project's declared names, never a remembered one);
- whether the project uses **milestones** (`milestones: yes|no`);
- any **auxiliary labels** (`size:S/M/L`, `cluster:*`, `single-file`, `blocked`, `tracking`, …);
- the optional **`not-ready-labels`** key (comma-separated label names; default none) — additional
  labels, beyond the built-in `blocked` skip, whose issues are excluded from selection.

If the `backlog` key is missing or doesn't declare the tier names, STOP and ask — do not guess a
label scheme. Below, `<must>` / `<should>` / `<could>` stand for the project's declared tier names.

## Picking the next work item — selection order

Never cherry-pick below the top of this order:

1. **Skip not-ready issues, before anything else.** An issue carrying `blocked` is NEVER selectable —
   unconditionally, no configuration: the plugin seeds `blocked` as a list-filter aid, so selection
   filters on it. Any `not-ready-labels` issue (see above)
   is excluded too, **unioned with** the `blocked` skip, never in place of it — setting
   `not-ready-labels` must not silently re-enable picking `blocked` items. Absent key ⇒ only the
   `blocked` skip applies. Like the `tracking` epics further down, these are filed, not workable —
   the same idea, not a new mechanism. Excluding happens BEFORE tier ordering.
2. **Snapshot the open backlog:** `gh issue list --state open --limit 200 --json number,title,labels,milestone`
   — **always pass `--limit 200`** (the `gh` default caps at 30, silently hiding the tail).
3. **If the project uses milestones:** the current milestone is the **lowest-numbered milestone that
   still has open issues** — work only within it until it's empty.
4. Within scope: **`<must>` > `<should>` > `<could>`**.
5. At equal tier: a **`bug`-labelled issue jumps to the top of any tier** (bugs before features).
6. Then smallest first (`size:S` before `M` before `L`) unless the user directs otherwise.
7. **`tracking` epics are not directly workable** — they are roadmaps. Take the next unchecked box
   as the task, tick it when the slice lands, and split a box into its own issue when it needs
   discussion or spans multiple commits. **When a split is not 1:1** (one box becomes several
   issues), rewrite that box in the epic body at split time as **one box per filed issue**
   (`- [ ] #18`, `- [ ] #19`, …); thereafter the epic tracks issue *closure* — tick a box when its
   issue closes. Editing an epic's checklist this way is roadmap upkeep, **not** the "never edit a
   tracker" rule under *Completion* below — that rule forbids hand-marking an issue's *completion* in
   place of `Closes #N`, not maintaining an epic's structure.

## Filing a new issue (`gh issue create`)

Write the body to a temp file — multi-paragraph bodies quote badly inline:

```sh
gh issue create --title "<title>" --body-file body.md --label "<must>,size:S"
```

- **Title:** an imperative summary. If the project keeps legacy string ids in titles (declared in
  Project Facts), preserve them so CHANGELOG history resolves; otherwise the **issue number is the
  id**.
- **Body:** goal / scope / `Files:` (repo paths; a commit-pinned permalink for an in-code TODO where
  useful) / every `DECIDED with the user` block **verbatim** (load-bearing — never summarise it
  away) / open questions with proposed defaults / `Depends on:` + `Enables:` / provenance.
- **Labels:** **exactly one tier label** — a new issue is NEVER left unlabelled. Add `size:*` where
  scoped, `bug` for a bug, plus any auxiliary labels the project declares.
- **Routing labels (only if Project Facts `agent-routing: labels`).** Apply one **`agent:<type>`**
  (default `agent:developer`) and, where the item's complexity warrants overriding the implementer's
  default model, one **`model:<tier>`** (`model:opus` / `model:sonnet` / `model:haiku`, `model:fable`
  where provisioned). `ship-work-item` reads `model:*` at spawn time (overriding the frontmatter
  default); `agent:*` is advisory — a filter/marker, not a dispatcher. Values are model aliases + the
  plugin's agent names. Skip entirely when `agent-routing: none` (the default).

## Re-tiering, relations, decisions, completion — all via `gh`

- **Re-tier:** `gh issue edit <n> --add-label <should> --remove-label <could>`.
- **Dependency:** `gh issue edit <blocked> --add-blocked-by <blocker>` — a first-class relation
  GitHub renders on both issues; add a `blocked` label as a list-filter aid. **You do not clear that
  label by hand:** the `ship-work-item` skill's *After the merge lands* unblock step removes it once
  every blocker is closed, so the skip above stops applying on its own. **When the blocker lives in
  a repo Project Facts `pinned-deps` names, also record the consumer's own pin-bump issue as a
  blocker relation** — the upstream close does not unblock, the bump does.
  **The label rides WITH a relation, never alone:** a block with no issue to point at (external
  evidence, a decision, an upstream release) goes in a `not-ready-labels` label instead — the
  unblock step has nothing to observe closing on a bare label, so it can only surface such an item,
  never free it. Build any legacy-id → number map ONCE from a `gh issue list --json` snapshot; never
  loop `gh issue list --search` (the search index lags bulk creation — an empty result means index
  lag, NOT a missing issue — and it rate-limits at ~30/min).
- **Relate (lineage):** before filing or triaging an item, search closed AND open items for the same
  component and adjacent vocabulary, and record any hit as one of three named relations. Record it as
  a **prose `Lineage:` line** (in the filed issue's body, or wherever the tracker records a decision)
  — this is the floor, because the convention must outlive any one tracker. The three are not
  interchangeable — lumping them together as "related" loses the signal:
  - **duplicates / competes-with** (an open item) — reconcile before either is worked, or two changes
    end up fighting over one file. This is the one relation that must be visible from **both** sides,
    since prose in a single comment is one-sided: *if the tracker supports a native duplicate link or
    label, use it as well* — an affordance, never a requirement.
  - **reverses / reopens** (a closed decision) — the dangerous one, because it reads like an ordinary
    feature request. Never tier it silently: route it to the maintainer as a `question`, because a
    prior decision possibly needing revisiting is not an agent's call. Prose is the only form that can
    express this relation at all — no tracker has a "reverses" link.
  - **evolves / continues** (a closed item) — nothing is wrong; recording it makes the *why* legible.
    A capability that keeps needing "evolves" follow-ups is a signal the original shipped
    under-finished.
- **Decision:** `gh issue comment <n> --body "DECIDED with the user <date>: ..."`; the durable
  cross-item log lives in the project's decisions file (Project Facts `decisions`) — decisions only,
  never versions or completion status.
- **Completion:** never edit a tracker — put `Closes #<n>` in the PR body (see the `ship-work-item`
  skill). **Caveat:** GitHub fires closing keywords ONLY on the repo's **default branch**. If the
  integration branch IS the default branch, the merge auto-closes the issue; if it is NOT (Project
  Facts `default-branch != integration-branch`), auto-close will not fire and `ship-work-item`'s
  post-merge manual-close step applies.

## Mid-task discoveries

New work found mid-task becomes a **new issue** (one tier label, plus size/kind), never a
scope-widening of the current item. Design outcomes go to the decisions file and, per-item, as an
issue comment.

## Hygiene scan

`gh issue list --state open --limit 200 --json number,title,labels` → every open issue must carry
**exactly one tier label** — flag any unlabelled or orphaned issue so the backlog never drifts into
an unsorted pile, **except** a `question` issue or an untriaged `from-consumer` issue, which are
sanctioned tier-less states (awaiting a decision / maintainer triage), not drift. **When Project Facts `agent-routing: labels`,** also flag a workable issue (tiered, not `question` / untriaged) that carries no `agent:*` label — a soft gap that keeps the routing reviewable, not a hard drift like a missing tier. Agents without `gh` (e.g. `product-owner`, `scrum-master`, `tech-debt-reviewer`)
can't run this — the orchestrator hands them this JSON snapshot in the spawn prompt.

**Pinned-dependency freshness (only when Project Facts declares `pinned-deps`).** For each declared
`<path> @ <owner/repo>` entry, compare the checked-out pin against the upstream's latest release —
`git -C <path> describe --tags` vs `gh release list --repo <owner/repo> --limit 1`. If the pin is
behind, surface the gap in the scan report (current → latest, and how many releases sit between) and
file/refresh the consumer's pin-bump issue per this skill's filing conventions — ONE issue tracking
the bump, updated in place, not one new issue per missed release. The check itself is read-only;
actually bumping the pin is a normal work item picked by tier, never a hygiene side effect. Absent
key → skip entirely (the usual optional-gate default).

**Plugin self-freshness (no declaration needed — every consumer has a marketplace).** On a full
hygiene pass (not every pick) check the installed plugin is current against its marketplace source.
**Read the installed version first — it is the primary signal.** The Claude manifest is versionless,
but `.codex-plugin/plugin.json` ships in the same installed payload on both clients and its `version`
mirrors the CHANGELOG, so one grep of the installed cache names the release you are actually running.
Then compare that against the release the marketplace source carries. As a fallback — and to answer
the narrower question "is the clone behind its remote?" — compare the marketplace clone's HEAD to its
remote release ref with `git ls-remote` (read-only — no token, no fetch, no cache mutation); on Codex,
compare the installed plugin version to the upgraded marketplace snapshot. Note what `ls-remote`
cannot do on its own: it inspects the **clone**, not the installed **cache**, and it never names a
release — so a cache that has drifted behind an up-to-date clone reads as green. The
per-client state locations and refresh commands live in the `install-refresh-plugin` skill. If
behind, report it to the user with the fix — run the client's marketplace update, then re-sync
conventions — and hand repair to `install-refresh-plugin` when an update doesn't reach the installed
cache.

**Freshness is not the only thing that rots — check the PIN in the same pass.** An install can be
perfectly current and still be tracking the wrong branch, because a marketplace update can drop the
`ref` pin and leave the clone on the repository's *default* branch — the integration branch, for any
repo following `adopt-conventions`. Read the clone's actual branch (`git -C <clone> branch
--show-current`) and compare it to Project Facts `release-branch`. **The version cannot reveal this**:
right after a release the two branches are content-identical, so a drifted pin reads as a perfectly
healthy install. Report a mismatch and hand the repair to `install-refresh-plugin`, which carries the
two-part fix — the entry *and* the clone's fetch refspec.

**Code-health offer (no declaration needed).** On a full hygiene pass, **offer** to run
`fluyt:tech-debt-reviewer` — an offer the user accepts or declines, never a gate and never
automatic. The `release` skill makes the same offer at a cut, but a release is the *hardest* event to
reach: a repo blocked on an open decision cannot promote, so it cannot get a code-health pass either,
and that is exactly the repo most likely to be accumulating debt. Attaching a second offer to the
hygiene pass gives the reviewer a trigger that does not depend on a release ever happening. Cadence
comes from where this sits — a **full** pass, not every pick — so it costs nothing per work item.
`tech-debt-reviewer` has no `gh`: hand it the open-issue JSON snapshot in the spawn prompt, exactly as
the tier-label scan above does, or it reviews blind.
