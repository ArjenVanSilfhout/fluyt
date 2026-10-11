---
name: branch-protection
description: >-
  Use when offering, auditing or repairing branch protection on a GitHub repo — a ruleset or classic
  protection on the integration or release branch, required status checks, merge-method restrictions
  (squash for work items, merge-commit-only on the release branch), or the bypass posture. Routed to
  from adopt-conventions onboarding and its re-sync Pass D, and usable standalone when the user says
  "protect the branch", "set up a ruleset", "require CI to pass before merge", or "nobody can merge
  this any more". Carries the traps: a ruleset POSTed on an unpaid private repo is accepted and
  silently unenforced, a required check that never reports deadlocks the branch forever, and a second
  POST mints a duplicate. Also audits GitHub Actions triggers for double runs and offers a docs-only
  fast path.
---

# Branch protection and the CI audit that rides with it

This is the repo-configuration half of adopting the process: protecting the `integration-branch` and
`release-branch`, deciding what CI must report before a merge, and auditing the workflow triggers
while you are in there. Onboarding routes here from `adopt-conventions` §5; drift-checking, from its
Pass D. A consumer can also invoke it directly whenever a branch needs protecting or an existing rule
needs reading. Every `gh` call below resolves the repo from the **current directory's** git remote —
run from inside the target clone, or it silently targets the wrong repo.

**When Project Facts `forge` is not `github`, only the principles below carry over.** Per the
`forge-azure-devops` adapter's own deliberate non-translation, this playbook's rulesets / `gh api`
mechanics stay GitHub-specific; consult that adapter's policy and security sections for the forge's
actual mechanism.

**An offer, not a mandate** — the posture is the maintainer's call, and this playbook *proposes* and
applies only on an explicit yes. **Sequencing: it runs only once CI has reported at least once** (at
onboarding, that is after `adopt-conventions` §4), because you cannot **read** the real status-check
context names before then — and the API will happily accept a context that never arrives, which
deadlocks the branch permanently.

## 1. Check plan and visibility first

**Neither mechanism is free on a private repo.** Rulesets and classic protection have the **same**
plan gating: public repos on the free tier, public *or* private on paid tiers. On a free account a
private repo enforces **neither**, and a ruleset POSTed there is **accepted and silently unenforced**
— worse than an error. Read `gh api repos/{owner}/{repo} --jq '{private, visibility}'` and say so
plainly rather than applying a rule that will not bind.

Independent of plan: `GET /repos/{owner}/{repo}/branches/{branch}/protection` returning **404** means
*not protected* — not *unsupported*. Reading that as "nothing to do here" is how a branch ends up
unprotected with nobody noticing.

## 2. Prefer a ruleset over classic protection

For one decisive reason and one convenience:

- **`allowed_merge_methods` is per-branch; the repo-wide `allow_squash_merge` / `allow_merge_commit`
  toggles are not.** A repo whose `integration-branch != release-branch` therefore **cannot** express
  "squash onto the integration branch" the repo-wide way, because merge-commit has to stay enabled for
  the promotion PR. Only a ruleset can scope a merge method to one branch.
- Bypass is explicit and inspectable (`bypass_actors: []`).

## 3. Read the current state, then propose

`templates/branch-ruleset.json` is **one shape parameterised over a role** — `integration`,
`release`, or `trunk` — so a split topology
(`integration-branch != release-branch`) offers **two** roles — each filled, POSTed, and confirmed
on its own explicit yes; a trunk-based repo has the single `trunk` role.
Copy the template to `branch-ruleset.<role>.json`, fill the placeholders *there*, and POST that copy —
never the shipped path:

```sh
gh api "repos/{owner}/{repo}/rulesets" --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
gh api "repos/{owner}/{repo}/branches/<integration-branch>/protection" --jq '.required_status_checks.contexts'
gh api "repos/{owner}/{repo}/commits/<integration-branch>/check-runs" --jq '.check_runs[].name'
gh api "repos/{owner}/{repo}/commits/<integration-branch>/status" --jq '.statuses[].context'
gh api -X POST "repos/{owner}/{repo}/rulesets" --input "branch-ruleset.integration.json"
# Split topology — do the release role too: read
# repos/{owner}/{repo}/branches/<release-branch>/protection, then POST
# branch-ruleset.release.json. Do NOT reuse a context name read above for it: see
# "Never put required_status_checks on the release branch" below.
```

**Read both protection mechanisms, not just rulesets.** A repo protected the classic way has *zero*
rulesets, so a rulesets-only read reports it as wide open. If classic protection already covers the
branch, that is a deliberate posture, not drift: report what it already enforces and offer the ruleset
only as an explicit migration the consumer asks for — **never layered alongside**, or the two
required-check sets union and nobody can tell which rule to edit.

**The POST is not idempotent — and this check is per role.** Before applying a role's copy, look for a
ruleset whose `conditions.ref_name.include` already covers **that role's branch**; if one exists, show
its diff against your filled copy and **update it** with
`gh api -X PUT "repos/{owner}/{repo}/rulesets/<id>" --input "branch-ruleset.<role>.json"`. A second
POST silently creates a second enforcing ruleset on the same branch, and a split topology that checks
only the integration branch mints a duplicate **release** ruleset on every re-sync.

## 4. Fill the template — pick the role first

The three roles differ in exactly three places; everything else in the template
(`enforcement: active`, `bypass_actors: []`, `deletion`, `non_fast_forward`, the
`pull_request` rule itself, `required_approving_review_count`) is identical across all of them:

| Role | Use when | Branch placeholder | `allowed_merge_methods` | `required_status_checks` |
| --- | --- | --- | --- | --- |
| `integration` | `integration-branch != release-branch` | Project Facts `integration-branch` | `["squash", "merge"]` | keep — once a context has reported on a PR into that branch |
| `release` | `integration-branch != release-branch` | Project Facts `release-branch` | `["merge"]` — **merge commit only, never squash** | **omit the rule entirely** (see below) |
| `trunk` | `integration-branch == release-branch` | the single branch (both keys hold it) | `["squash"]` — may drop `"merge"`, there is no promotion | keep — once a context has reported on a PR into that branch |

**The `release` role carries a `pull_request` rule too, and that is the point of this step.** The
`/fluyt:release` ritual's *one rule that matters* — the release PR merges with a regular
**merge commit, never squash** — is unenforceable any other way: GitHub's default button is squash,
repo-wide toggles can't forbid it on one branch, and that per-branch gap is exactly §2's reason to
prefer a ruleset at all. Leave it out and the single mistake the release
skill exists to prevent is guarded by nothing but human vigilance, on the ref consumers pin. The
release ruleset covers both the **auto-delete** hazard (the back-sync PR's head *is* the release
branch, answered by the `deletion` rule) and the merge method.

**Never put `required_status_checks` on the release branch until you have watched a context report on a
PR *into the release branch*.** At onboarding no such PR has ever existed — the first one is the
promotion PR of the first release — and transplanting a context observed on an integration PR is
exactly the guess this step forbids: a workflow triggered on `push` to the integration branch never
runs on the release PR, GitHub holds the never-arriving check as **Pending forever**, and with
`bypass_actors: []` there is no way through. That deadlocks the release permanently, on the ref
consumers pin. **So the safe default is explicit: on the release branch `required_status_checks` stays
unset** — the `release` row omits the rule, and `deletion` + `non_fast_forward` + `pull_request` still
bind. Its absence there is a deliberate end state, **not** a gap for a later re-sync to close.

- `<integration-branch | release-branch>` — the branch **this role** targets, in both the `name` and
  the `ref_name` include. The `name` ships as `<branch>: PR-only`, and the branch in it is what tells
  two rulesets apart in the UI — append `, CI-green` on a role that keeps the `required_status_checks`
  rule. **When `integration-branch != release-branch`, never let one
  ruleset's include cover both branches** — the promotion and hotfix PRs must stay free to merge as
  merge commits, and a later narrowing to squash-only would silently brick the promotion. Give the
  release branch the `release` role's **own separate ruleset** instead — it is the ref consumers pin
  and (the auto-delete hazard above) the head of every back-sync PR. On a trunk-based repo the single
  branch is both and one ruleset covering it is correct — there is no promotion PR.
- `<ci-job-name>` — a context from either read above. In GitHub Actions, the string GitHub reports is
  derived from **the job's `name:` field** — not the workflow's `name:`, and not the job id (the key
  under `jobs:` in the YAML) — except that the job id is what's used when the job declares no `name:`
  of its own. That derivation rule is not licence to type the string from the workflow source instead
  of reading it: **read the real names; do not guess**, and never require a context that has never
  reported — a required check that never arrives blocks every PR forever. Two gaps to watch: CI that
  reports through the commit **Statuses** API (many non-Actions providers) appears only in the
  `status` call, never in `check-runs`; and if the workflow triggers on `pull_request` only, the
  branch head has no runs at all — read the contexts off a recent PR head instead (`gh pr list --base
  <integration-branch> --state merged --limit 1 --json headRefOid`, then the same two calls against
  that SHA). The context must be one you have seen report **on a PR into the very branch this role's
  ruleset targets** — which is why the `release` role omits the rule, and why a context read off an
  integration PR may never be reused for it. It must also report unconditionally: a `paths:`-filtered
  workflow is *skipped* on a zero-change PR, and GitHub holds a skipped-but-required check as Pending
  forever, which is exactly what the release back-sync PR is. Once required, treat the name as an API
  surface and keep it stable: renaming whatever it derives from (per above) changes the string and
  breaks the rule.
- `required_approving_review_count` — ships as `0`. Map Project Facts `pr-approvals`: `none` → `0`,
  `N` → `N`, in **every** role's copy — a split topology asks the same approvals of the promotion PR
  as of a work-item PR. **`0` is right for a solo maintainer** — requiring one approval deadlocks a
  repo with nobody to give it.
- `<merge-methods-per-role>` — fills the `pull_request` rule's `allowed_merge_methods` array;
  take the value from the role's row. The template ships a **placeholder token inside a
  single-element array**, not a default, precisely so the `release` role cannot inherit squash by
  accident. **Replace the WHOLE ARRAY, not just the token string** —
  `["<merge-methods-per-role>"]` becomes `["squash", "merge"]` (or `["merge"]` for `release`), never
  `["squash, merge"]`: substituting only the string inside the array still ships a single-element
  array, which GitHub's API 422s. Squash is for work items on the integration branch. **Merge is
  load-bearing whenever `integration-branch != release-branch`**: the release ritual's back-sync and
  the hotfix back-merge both have to land on the integration branch as merge commits — squashing
  either one collapses the release history into a new commit and *diverges* the integration branch
  from the release branch instead of re-aligning it. On the release branch merge is the *only*
  method, for the reason above. A trunk-based repo (`integration == release`) has no promotion at
  all and may safely drop `"merge"`.
- **If neither read returns anything**, the branch has no reporting CI — drop the
  `required_status_checks` rule entirely; the other three still buy real enforcement.

**State the bypass consequence in the offer, before applying.** With `bypass_actors: []` the rule binds
the maintainer too, for every push and merge — that is a good default, but it should not be a surprise.
Bypass only gates getting **past** the rule; it does not gate **administering** it, so an admin can
still edit or clear a broken one. If a required context turns out never to report, or CI otherwise
breaks in a way that blocks its own fix, recovery is the same `gh api -X PUT
"repos/{owner}/{repo}/rulesets/<id>" --input "<file>"` call used to update a ruleset above (`-X DELETE`
on the same URL removes it outright) — not a force-push, which was never a route past a check that
never arrives. Say so.

## 5. Audit the CI triggers while you are here

Skip this unless the consumer's CI runs on GitHub Actions. A workflow triggered on both an
unfiltered `push` and an unfiltered `pull_request` runs every job **twice** on every PR, which
doubles CI minutes. The two runs are not identical, which is what decides the fix: `pull_request`
builds GitHub's synthetic merge commit — what the integration branch will actually become —
while `push` builds the branch head in isolation. So keep `pull_request` unfiltered and **scope
`push` to the branches no PR covers**:

```yaml
on:
  push:
    branches: [<integration-branch>, <release-branch>]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

`cancel-in-progress` is deliberately expression-gated: superseding an in-flight **PR** run is free,
whereas cancelling an integration- or release-branch run would leave a merged commit unverified.

Also flag a workflow that authenticates a private-submodule checkout with a token through a
global `git config url.<tokenised-url>.insteadOf <prefix>` rewrite whose `<prefix>` is the whole
host: every git operation the job runs against that host then carries the token — the main repo's
remotes and any other clone or fetch in the job, not just the submodule fetch. **Make `<prefix>`
the submodule's own URL, never the whole host.**

## 6. Offer a docs-only fast path for the expensive steps

The `<ci-job-name>` bullet above already covers the Pending-forever trap a `paths:`-filtered
workflow springs; what it doesn't cover is the cost of avoiding it blind: a workflow that installs
a toolchain on every push pays that cost even for a one-line docs edit, tempting the
batch-unrelated-changes workaround this ritual exists to prevent. Two rules carry the remedy, and
both are non-obvious enough that a consumer inventing this locally is likely to get one wrong in a way
that reopens a skip trap (Pending forever, or a silent pass):

- **Rule 1 — gate the STEPS, never the JOB.** A job-level `if:` that evaluates false makes the job
  *skipped*, and GitHub reports a skipped job as Success — a required check then **passes with
  nothing built**, which is how a draft-skip `if:` on a required job merges unbuilt code. Only a
  workflow skipped by a `paths:`, branch or commit-message filter leaves its check Pending, so
  job-level `if:` is only safe on a job no ruleset requires, a set that drifts over time. Gate the
  expensive **steps** inside the job instead: the job itself still runs, reports success in seconds,
  and stays safe under any required-set.
- **Rule 2 — scope the fast path by PATH, not by file extension.** For a prose-asset plugin, markdown
  IS the product — a `.md` file under the plugin payload is the artifact, not documentation about it —
  so an extension-based "only `.md` changed → do less" rule would disable validation on the highest-risk
  changes in the repo. Docs-only means: nothing under the consumer's **declared protected path
  prefixes** changed — the paths that hold whatever this consumer ships (for a plugin repo, its own
  plugin-payload and manifest directories). Stated generically: the fast path is defined by what the
  change can break, not by its file type. The consumer names the protected prefixes; this step supplies
  the rule and the trap.

Offer it the same way as the ruleset above — proposed here, applied only on an explicit yes — but
editing a consumer's existing workflow file is a materially bigger intervention than POSTing a ruleset,
so it carries obligations the ruleset offer does not:

1. **Show the diff before asking** — the actual proposed change to the actual workflow file, not a
   description of it; the consumer approves a diff, not a summary.
2. **Never edit a workflow file this audit did not parse successfully** — if you cannot confidently
   locate the job and trigger blocks you would modify, report the recommendation and stop. A
   partially-understood workflow is not a candidate for automated editing at any confidence level.
3. **One confirmation buys one file** — the yes covers the workflow shown, not "workflows" generally;
   a repo with several jobs worth gating this way gets several diffs and several yeses.
4. **Scoped by path, not extension** — the substance above, unchanged by the offer/document choice.

**This is an audit, not a scaffold.** The plugin ships no CI workflow and deliberately does not write
one — a workflow is stack- and provider-shaped, which is exactly what a shared asset must not carry.
Read what the consumer already has, show the diff, let them apply it. The fast-path offer above is the
same posture applied to an existing job: it edits what is there, on confirmation, and never invents a
job the consumer doesn't have.
