# From scratch (greenfield)

The on-demand part of the `adopt-conventions` skill, read when its `SKILL.md` points here; its
§ N and *Section* references point into that `SKILL.md`.

For a project that does not exist yet, or an empty repo. The adopt flow in `SKILL.md` assumes a repo
with content to survey; on greenfield there is none, so this mode adds the steps *before* it and
then runs it unchanged. It owns the pre-repo shape only and **duplicates nothing**.

1. **Interview for the project shape** - everything the pre-repo steps consume, none of which is
   inferable on greenfield: name, **owner/account** (personal or org), a one-line description, the
   stack, intended **visibility**, **licence**, and the **branch model** (`integration-branch`,
   `release-branch`, and which of them is the GitHub default). The first six seed step 2's command;
   the branch model is what step 3 creates. The rest of Project Facts is filled at §2.1 - record
   anything not built yet as `<pending — set when it exists>`.
2. **Offer to create the repo - never create one unasked.** State the exact command the answers
   imply and the account it will create under, then wait for an explicit yes:

   ```sh
   gh repo create <owner>/<name> --<public|private> --description "<one-liner>" --license <key> --clone
   ```

   This is the only step in this skill that **creates something new under the user's account** -
   every other repo-level step (§2's labels, merge settings and branch pushes, and the protection
   offer) changes a repo they already own - so it gets the same explicit confirmation as any other
   outward-facing step. Ask about visibility and licence rather than defaulting to either:
   a repo created public cannot be un-published from anyone who has cloned it, and
   `--internal` exists only for org-owned repos on plans that offer it.

   **Both flags are load-bearing.** Without `--clone` the repo is created remote-only: no working
   tree and no `origin`. Without `--license` (or `--add-readme` / `--gitignore`) it is not
   initialised at all and has **zero refs**, so there is nothing for step 3 to branch from. Then
   **`cd` into the clone before anything below** - §1 onward, and every `gh` call in §2.8, §2.9 and
   the `branch-protection` playbook §5 routes to, resolve the repo from the current directory's git
   remote; run them from anywhere else and they silently target a *different* repository. If the
   user would rather create it themselves, that is the normal path: wait for the URL, clone it, and
   `cd` in.
3. **Seed the initial commit, then the branch model.** A PR cannot be the first commit -
   `ship-work-item` starts by checking out the `integration-branch` and fails outright if it does
   not exist (step 2.10 says so), so "land the onboarding PR first" would be circular. Get one
   commit onto the default branch directly: let `gh repo create` seed it via `--license` /
   `--add-readme` as above, or commit locally and `git push -u origin <default-branch>`. **Only
   then** run step 2.10 - `git ls-remote --heads origin <integration-branch> <release-branch>`,
   **offer** to create each missing branch from the default, and set the default branch. The
   `chore/` PR of §6 is **not** this commit: it is the §4 verify work item and lands last, once the
   branches exist.
4. **Then run the flow from §1.** Two things differ on greenfield. The survey finds nothing, so
   Project Facts come from the interview rather than inspection - and step 2.1's `<pending — …>`
   rule carries most of the weight here, because the build and test facts genuinely do not exist
   yet. And a brand-new repo usually has **no CI at all** - this plugin scaffolds none - so there is
   nothing to wait for at §5's protection offer: say so, take the `branch-protection` skill's
   no-reporting-CI path (drop the `required_status_checks` rule; the other three still bind), and
   note that once the consumer adds a workflow and it has reported on a PR into the integration
   branch, `re-sync.md` **Pass D** re-offers the required-check half.
