---
name: forge-azure-devops
description: >-
  Azure DevOps forge adapter for the fluyt delivery ritual. Use when Project Facts declares
  forge: azure-devops and a core skill's step speaks GitHub or gh - this skill translates that step
  to the az CLI: Azure Boards work items for the backlog (Priority for tiers, tags for labels,
  predecessor links for blocked-by), az repos pr create and update --auto-complete for PR and
  merge, work-item linking in place of Closes #N (with the inverted over-close trap), a
  build-validation branch policy as the CI gate, branch policies plus branch security for
  protection, and an ephemeral Entra ID bearer token for git over HTTPS. Triggers on "Azure
  DevOps", "ADO", "az repos", "az boards", "work item", "branch policy". The canonical rituals stay
  authoritative for the process; this skill supplies only the per-step forge translation.
---

# The Azure DevOps forge adapter

The canonical rituals - `ship-work-item`, `backlog`, `release`, `versioning-and-changelog`,
`report-upstream`, `branch-protection` - stay **authoritative for the process** on every forge - what
to do, in what order, with which stops - unchanged; this skill supplies only the per-step
translation for a consumer whose Project Facts declares `forge: azure-devops`: where a
canonical step names GitHub or a `gh` command, do the Azure DevOps equivalent below, then return to
the canonical skill for the next step. A canonical step with no translation here is forge-neutral -
follow it unchanged (`versioning-and-changelog` is the clean example: CHANGELOG and version live in
the repo, not the forge). Two deliberate non-translations:

- **`report-upstream` files to the PLUGIN's home forge, which is GitHub** - it stays `gh`-shaped
  even for an Azure DevOps consumer. When `gh` is absent on such a consumer, use that skill's own
  web-form fallback rather than translating it to `az`.
- **`branch-protection`'s playbook is GitHub-mechanism-specific** (rulesets, `gh api`); on this
  forge only its principles carry over, through the policy and security sections below.

**Coordinates are placeholders.** Every recipe below writes placeholder coordinates - `<org-url>`,
`<project>`, `<repo>`, `<work-item-id>`, `<pr-id>`, `<branch>`, and the like - because this skill
knows no real organization, project, or repository, and a real name appearing in a shipped recipe
would be a project fact where none may live. Real coordinates come from the consumer's own Project
Facts and environment: set them once per clone (`az devops configure --defaults
organization=<org-url> project=<project>`) or pass `--org` / `--project` per call.

## Verification status: unverified

**No `az` recipe in this file has been executed by this plugin's own validation.** The plugin's home
repo has no `az` CLI and no Azure DevOps organization, so its gate can verify this file's structure,
never that a recipe runs. Treat each recipe as an unverified mapping, not a verified contract: confirm
flags with `az <group> <command> -h` before relying on one, and file every correction via
`report-upstream`. Steps marked **Deferred** below are beyond what the mapping supports and are
deliberately not invented here.

## Backlog: Issues ↔ Azure Boards work items

The `backlog` skill stays canonical for selection order, tiering, atomic filing, and hygiene; its
selection order reads whichever fields this forge exposes. Only the nouns translate:

| Canonical (GitHub) concept | Azure DevOps equivalent |
| --- | --- |
| an Issue | a Boards work item |
| tier labels (`must`/`should`/`could`) | the **Priority** field - declare the value mapping (e.g. 1/2/3) in Project Facts `backlog` |
| other labels (`size:*`, `bug`, `blocked`, …) | **tags** |
| a `blocked-by` relation | a **predecessor link** (the blocker is the predecessor) |
| `gh issue list` / `gh issue view` | `az boards query --wiql "<query>"` / `az boards work-item show --id <work-item-id>` |
| `gh issue close` (manual-close fallback) | `az boards work-item update --id <work-item-id> --state <done-state>` |

Two traps in that last row and the link row:

- **The done-state name is process-template-specific** (`Done`, `Closed`, and `Completed` all exist
  in the wild). Read the project's own states off an existing completed work item before writing
  one; never assume a name.
- **Link direction matters.** `az boards work-item relation add --id <work-item-id>
  --relation-type predecessor --target-id <blocking-work-item-id>` is the recipe shape; confirm
  with `-h` which side the flags treat as the predecessor before linking, because a reversed link
  silently inverts the blocked-by meaning the `backlog` skill reads.

## PR and merge

`ship-work-item` stays canonical for the PR ritual itself - branching, the PR body, review gates,
fire-and-forget. The command translation:

- `gh pr create` → `az repos pr create --source-branch <branch> --target-branch
  <integration-branch> --title "<title>" --description "<body>" --work-items <work-item-id>` (the
  target from Project Facts `integration-branch`). Link the work item at creation -
  on this forge **the link is the closing mechanism** (next section, before arming anything).
- `gh pr merge --squash --auto` (the fire-and-forget arming step) → `az repos pr update --id
  <pr-id> --auto-complete true`. Auto-complete fires when every branch policy passes - the same
  fire-and-forget semantics. Its completion options include **"complete linked work items"**, the
  closing half of the translation; the exact flag spelling for that option is not in this
  mapping - read it off `az repos pr update -h` - and it is armed only after the pre-arm check
  below.
- **Merge-method vocabulary: a plain merge commit is called "no fast-forward" here.** GitHub's
  per-branch merge-method limits translate to a **merge-strategy branch policy** per branch
  (`az repos policy merge-strategy create`), squash → allow squash, merge commit → allow
  no-fast-forward. The `branch-protection` skill's role table stays canonical for which branch
  allows what and why; the split topology lands here as: the integration branch allows **both**
  strategies - squash for work items AND no-fast-forward for the release back-sync / hotfix
  back-merge - while the release branch allows **no-fast-forward only**, the release promotion's
  merge-commit-never-squash rule, policy-enforced.

## Close-linking: the trap INVERTS on this forge

GitHub closes by **keyword**; Azure DevOps closes by **link**. The `Closes #N` machinery maps to
the PR's linked work items plus the "complete linked work items" completion option - and the risk
inverts with the mechanism:

- **GitHub's close-risk is a keyword firing through a negation** - the token pattern does not read
  English, so denying a close can arm one. `ship-work-item` is canonical for that trap and its
  pre-arm body grep; none of it transfers here.
- **Azure DevOps's close-risk is OVER-CLOSE by an unintended link.** Nothing scans the PR body;
  completion fires on every work item LINKED to the PR, however the link arrived - the one passed
  at `--work-items`, one auto-linked from a branch or commit reference, one a teammate or board
  automation attached. Arm "complete linked work items" and every one of them completes on merge,
  including the item this PR never touched.
- **So the pre-arm check changes shape: list the links and read every one.** Before arming work-item
  completion, run `az repos pr work-item list --id <pr-id>`; every returned item must be one this PR
  genuinely finishes - unlink anything else (`az repos pr work-item remove`) first. A body grep
  proves nothing here: the body was never the closing mechanism.

The post-merge verify step keeps its canonical place: confirm the work item actually reached its
done state (`az boards work-item show --id <work-item-id>`), and close it manually (state update
above) when it did not.

## CI gate: the build-validation branch policy

A GitHub required status check maps to a **build-validation branch policy** binding a pipeline to
the target branch - recipe shape: `az repos policy build create --branch <branch>
--build-definition-id <pipeline-id> --blocking true` (plus the repository and queue flags `-h`
lists).

The `branch-protection` skill's required-check rules carry over **verbatim**: gate the steps, never
the job, and never a path filter on a required check - that skill is canonical for the reasoning.
For a path filter the consequence is identical on both forges - a skipped-but-required check
holds a zero-change PR (the release back-sync PR is exactly that) **Pending forever**: here, a
pipeline whose trigger carries a `paths` filter never reports, so the blocking policy never
satisfies and the empty PR hangs with no way through. A condition-skipped job is a different trap:
on GitHub it reports Success and passes a required check with nothing built (`branch-protection`
§6); whether a condition-skipped stage reports here is unverified, and gating steps rather than the
job avoids both.

## Branch protection and security

This forge splits into **two mechanisms** what a GitHub ruleset states in one, and both halves are
needed:

- The ruleset's merge/PR rules map to **branch policies** - the merge-strategy and build-validation
  policies above.
- The ruleset's force-push/deletion denies and `bypass_actors: []` map to **branch security**:
  policies gate only the PR path, while force-push and delete are *permissions*. Deny **Force
  push**, **Delete**, and both bypass permissions - **Bypass policies when pushing** and **Bypass
  policies when completing pull requests** - on the protected branch. One honest limit: an
  organization administrator may not be fully deniable, so this posture binds members, not
  necessarily the org owner.
- **Deferred:** the exact `az devops security permission` invocations for those denies (security
  namespace and token syntax) and any reviewer-count policy mapping are beyond this
  mapping. Apply them through the forge's own UI, or extend the mapping and file it via
  `report-upstream` - do not improvise security-namespace syntax from here.

## Auth: an ephemeral bearer token for git over HTTPS

`gh`'s stored login has no counterpart here; this mapping authenticates git over HTTPS
with an ephemeral Entra ID (AAD) bearer token minted by the `az` CLI:

```sh
git -c http.extraHeader="Authorization: Bearer $(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken --output tsv)" push origin <branch>
```

- **Tokens are short-lived; their lifetime is set by your tenant's policies.** Mint at the point
  of use - never cache one at session start for a push an hour later. A mid-session 401 on a
  previously-working remote is an expired token, not a permissions change.
- **Deferred:** PAT-based auth, credential managers, and non-interactive pipeline identities are
  beyond this mapping, which covers exactly the ephemeral-bearer shape above.
