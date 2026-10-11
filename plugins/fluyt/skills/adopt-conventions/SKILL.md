---
name: adopt-conventions
description: >-
  Scaffold a Claude Code, Codex, or dual-client repo to adopt the fluyt process - instantiate
  the Project Facts block, client routing, settings/gitignore/gitattributes fragments and the
  CHANGELOG/DECISIONS skeletons non-destructively, interview for the repo's own invariants and other
  consumer-owned sections, then propose retiring shadowed local process components.
  Use right after installing the plugin in a new consumer repo, or
  when the user says "adopt the conventions", "set up fluyt here", or "onboard this repo".
  Also the **from-scratch** entry point (repo does not exist yet - "start a new project", "from
  scratch", "greenfield") and the **re-sync** (drift-check) entry point for a repo ALREADY on
  fluyt - "re-sync the conventions", "check for convention drift", "after updating the fluyt
  plugin".
---

# Adopt fluyt conventions

You are onboarding THIS repo (the consumer) to the fluyt process. Work **non-destructively** -
merge into what exists, never clobber - and land the result as a normal `chore/` PR. The templates
you instantiate live under this skill's `templates/` directory; read each one before applying it.

**Everything here is proposed to the user and applied with their confirmation.** Onboarding edits a
repo's contract files - do it in the open.

## Three modes: from scratch, first-time adopt, re-sync

- **From scratch (greenfield)** - for a project that does not exist yet, or an empty repo. The adopt
  flow below assumes a repo with content to survey and infer from; on greenfield there is neither, so
  this mode adds the steps that come *before* it and then runs it unchanged. It owns the pre-repo
  shape only and **duplicates nothing** - everything else is the flow below.

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
     every other repo-level step here (§2's labels, merge settings and branch pushes, and the
     protection offer) changes a repo they already own - so it gets the same explicit confirmation as
     any other outward-facing step. Ask about visibility and licence rather than defaulting to either:
     a repo created public cannot be un-published from anyone who has already cloned it, and
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
     branch, re-sync **Pass D** re-offers the required-check half.

- **First-time adopt** - the full flow below (survey → instantiate → retire shadows → verify → land).
- **Re-sync (drift check)** - for a repo *already* on fluyt. The Project Facts template, the
  plugin's shipped **guidance** (the routing paragraph, the autonomy rule in "Ask the human when"),
  and the settings / gitignore / gitattributes **fragments** all gain content over time, and an
  instantiate-once copy silently lacks anything added later. Run a re-sync to catch that drift. It
  only *proposes* changes (adds a missing block, updates a stale one) - non-destructive per the
  opening rule - lands as a `chore/` PR (docs/process → PATCH), and skips the survey / instantiate /
  retire / protection-offer steps below - the two reaches back into them are Pass B's *offer* of the
  §2 step 3 interview and Pass D, which re-offers the §2 and §5 **repo-level** steps that only ever
  ran at onboarding. Four passes:

  **Pass A - Project Facts keys:**
  1. Read the consumer's current Project Facts block and `templates/CLAUDE-project-facts.md`.
  2. List keys the template defines that the block is **missing**; also surface (as a note, never a
     deletion) any keys the block has that the template no longer defines.
  3. For each missing key, propose a value by inspection where inferable (build/test/branch facts),
     and **ask** where it's a design or priority choice - don't guess.
  4. Merge in only the confirmed additions; **never overwrite an existing value.**
  5. Surface any value recorded as `<pending — …>`: the thing may exist by now, so propose the real
     value. This is one of two cases where a key already has content and still needs revisiting -
     which is why "not yet" is written that way rather than as `none`.
  6. **Detect a defective `version-rules` and offer the correction.** If the consumer's
     `version-rules` value mentions **`single-file`** (or otherwise splits MINOR/PATCH by *file
     count*), it carries a flawed rule: file count is not a versioning axis, so a one-file change
     that alters product behaviour satisfies MINOR and PATCH at once with no precedence rule. **Show
     the current value, explain the ambiguity, and propose the behaviour-axis wording** - then let
     the consumer confirm. Do **not** rewrite it silently: step 4's never-overwrite rule holds, and a
     project's versioning is the project's call. This is the second revisit case, and it exists
     because a wrong *default* is otherwise indistinguishable from a deliberate choice. **When the
     consumer accepts the key correction, also check the CHANGELOG's Versioning block** - the block
     §2 step 7 seeds and aligns with `version-rules` at onboarding. If it still states the old
     file-count axis, show its current wording and propose the matching behaviour-axis correction,
     same confirm-first posture: the consumer's CHANGELOG is theirs, so propose, never rewrite
     silently. Correcting the key alone would leave two disagreeing statements of the versioning axis
     in the repo.
  7. **Re-derive an existing key by its provenance marker, not uniformly.** A key that already has
     content is normally step 4's territory (never overwritten) - this step is the one exception,
     applying `templates/CLAUDE-project-facts.md`'s "Provenance markers" vocabulary verbatim. Read the
     key's trailing `<!-- provenance: ... -->` marker (absent reads as `inferred`, same as the
     template states):
     - **`inferred`** (or unmarked) - freely re-derivable. Re-survey it and propose the current
       recommendation exactly as you would a missing key; confirm and merge as usual.
     - **`ratified @vX.Y.Z`** - **re-presented, never silently overwritten**, and only when that key's
       own definition in `templates/CLAUDE-project-facts.md` now carries a
       `<!-- recommendation-changed: vW.Z.Y -->` annotation NEWER than the key's own `@vX.Y.Z` stamp -
       that annotation is the cheap tell; no plugin-history diff needed. When it fires, show the same
       purpose / options / recommendation the interview would and let the consumer re-decide.
       **Bulk-accepting the re-presentation re-stamps `ratified @<new plugin version>` - it does NOT
       become `chosen`** (no silent marker upgrade: the state ratchets to `chosen` only when the
       consumer specifically engages with that one key). No `recommendation-changed` tell newer than
       the key's own stamp → leave it alone, exactly like any other already-filled key.
     - **`chosen`** - never touched, by this step or by anything else, regardless of any
       `recommendation-changed` tell. The consumer decided this key specifically; re-sync does not
       revisit it.

  **Pass B - plugin-owned guidance sections:**
  1. Read Project Facts `agent-clients`, the consumer's `CLAUDE.md`, and
     `templates/CLAUDE-skeleton.md`. When `agent-clients` is `codex` or `both`, also read the
     consumer's `AGENTS.md` (if present) and `templates/AGENTS-skeleton.md`.
  2. **Work paragraph-by-paragraph, not section-by-section - tell plugin-owned prose from consumer
     content by the skeleton's `<...>` convention.** The skeleton is the source of truth: a paragraph
     it ships with **no `<...>` token** is **plugin-owned** (e.g. the "Agentic process" routing
     paragraph, the precedence paragraphs under *Deliberate deviations from the shared playbook*, the
     "Otherwise, keep working" autonomy rule); a paragraph it marks `<...>` is a **consumer
     fill-in** the consumer replaces with their own (e.g. Project Facts values, the
     project-specific-skills list, the invariants, the code-style rules, the deviations register, the
     "Ask the human when" trigger list). **Plugin-owned and fill-in paragraphs interleave inside the
     same section** - `## Agentic process` holds the routing paragraph (plugin-owned) *and* a `<...>`
     skills list; `## Ask the human when` holds a `<...>` trigger list *and* the autonomy rule
     (plugin-owned); `## Deliberate deviations from the shared playbook` holds the precedence
     paragraphs (plugin-owned) *and* a `<...>` register prompt. So propagate a bracket-free paragraph
     **even when it sits in a section that also has a fill-in**, and never touch the fill-in
     paragraphs. **One qualification to the bracket heuristic:** the `<...>` list under
     `## Ask the human when` is a shipped **default gate list**, not an empty prompt (see §2 step 3).
     The consumer's adapted wording is theirs and is never overwritten - but when the skeleton's
     default list gains a *new* gate, **or an existing gate is materially changed**, surface that as a
     proposal, exactly as for a plugin-owned paragraph. **Test for "materially changed": the trigger
     condition now fires on different situations.** A semantic trigger-condition change surfaces; a
     stylistic reword that leaves the trigger unchanged does not. Either way the proposal shows the
     semantic change for the consumer to adapt into their own wording - it never overwrites what the
     consumer already wrote. Otherwise a gate added or tightened upstream would reach new adopters
     only, while every already-onboarded repo keeps the old trigger forever.
  3. For each plugin-owned paragraph, check whether the consumer's `CLAUDE.md` carries it and whether
     it still matches the current skeleton. Propose adding a missing one, or show a diff for a stale
     one - **confirm-first, never automatic** (as throughout this skill). If the consumer has
     deliberately edited a plugin-owned paragraph, surface the difference and let them decide;
     don't clobber their wording.
  4. Merge in only the confirmed additions/updates. For Codex, apply the same paragraph rule to
     `AGENTS-skeleton.md`: its bracket-free routing is plugin-owned, while existing consumer guidance
     remains untouched. `AGENTS.md` points to the single Project Facts block in `CLAUDE.md`; never
     copy that block into both files.
  5. **Surface - never fill - an unfilled consumer section.** If a `<...>` fill-in prompt survives in a
     consumer-owned **section** of the `CLAUDE.md`, or a section the skeleton defines is absent
     altogether (under its heading or the repo's own equivalent), report it and offer the §2 step 3
     interview - that interview only; re-sync still skips the rest of §2. Project Facts *values* are
     out of scope here: a `<pending — …>` marker is Pass A step 5's business, and a canonical format
     value such as `commit-subject` is not a prompt at all. Do **not** author the content yourself:
     these are the consumer's to declare, and a guessed invariant is worse than a missing one because
     five shipped components will then enforce it.

  **Pass C - settings / gitignore / gitattributes fragments:**
  1. Read `.gitignore`, `.gitattributes`, and their templates. When `agent-clients` is `claude` or
     `both`, also read the consumer's `.claude/settings.json` and `templates/settings-fragment.json`.
     Codex marketplace installation is client-level and has no consumer settings fragment to merge.
  2. List the keys / lines the templates ship that the consumer's files are **missing** (e.g. a newly
     required `.gitignore` line, a new settings key). Surface - never delete - anything the consumer
     added that the template lacks.
  3. **Propose** adding the missing keys / lines only - additive, confirm-first, never overwriting a
     consumer's own values or reformatting their file. Merge only the confirmed additions.

  **Pass D - repo and branch settings drift:**
  1. The §2 and §5 steps that touch the *repo* rather than its files - merge settings, the
     `delete_branch_on_merge` topology check, the labels bootstrap, and everything §5 routes to the
     `branch-protection` skill for (the protection offer, the CI-trigger audit, the docs-only
     fast-path offer) - run at onboarding only, so a repo that adopted before any of them existed has
     never been offered them. This pass closes that gap. (Step 2.10's branch bootstrap stays
     onboarding-only: a repo running the ritual already has its branches.)
  2. Read the current state - `gh api repos/{owner}/{repo}` for `allow_auto_merge` and
     `delete_branch_on_merge`; **both** `gh api "repos/{owner}/{repo}/rulesets"` and
     `gh api "repos/{owner}/{repo}/branches/<integration-branch>/protection"` for protection (a
     classically-protected repo has zero rulesets and would otherwise read as unprotected). **On a
     split topology, read the release branch's protection too** -
     `gh api "repos/{owner}/{repo}/branches/<release-branch>/protection"` plus the rulesets whose
     `conditions.ref_name.include` covers it. The `branch-protection` skill instantiates one ruleset
     **per role**, so a pass that reads the integration branch only reports the ref consumers pin as
     covered when nothing covers it. Then `gh label list --limit 100` against
     `templates/github-labels.ps1`; and the consumer's workflow triggers and step-level gating **if
     its CI is GitHub Actions** - the file read for the CI-trigger audit already shows whether the
     expensive jobs gate their steps by the consumer's protected prefixes, so this is a read you
     already have.
  3. **Propose** each gap exactly as its onboarding step would, with the same wording and the same
     consequences stated - auto-merge off, `delete_branch_on_merge` enabled on a split topology, no
     protection by *either* mechanism on the integration branch **or on the release branch**, label
     families the bootstrap has gained since they ran it (it is idempotent -
     `gh label create --force`), double-running CI triggers, and a docs-only fast path for any job
     whose expensive steps still run unconditionally. **Make the protection, CI-trigger and
     fast-path proposals by running the `branch-protection` skill** - re-sync detects the gap, that
     skill owns the offer, so its rules bind here unchanged. For the release branch, a ruleset that
     **exists but allows squash** is as much a gap as an absent one: propose the `release` role's
     `allowed_merge_methods: ["merge"]`, which is what makes the release ritual's never-squash rule
     enforceable rather than a habit. And carry that skill's release-branch rule intact - **never
     propose `required_status_checks` on the release branch.** Unset is its end state, not drift, so
     its absence is not a gap to close here; a required context that never reports deadlocks the
     branch consumers pin. If the consumer asks for it, that skill's gate is the only route: a
     context they have *watched* report on a PR into the release branch (unlike at onboarding, a repo
     that has promoted before may be able to satisfy that - read it, never assume it). The fast-path
     re-offer carries the same obligations the `branch-protection` skill states for it (show the
     diff, never edit a workflow you did not parse successfully, one confirmation buys one file, scope
     by path not extension) - re-offering at re-sync does not relax them.
  4. Apply nothing without an explicit yes. **When the consumer declines, propose recording it** as a
     one-line entry in their `CLAUDE.md` *Deliberate deviations from the shared playbook* register
     (e.g. `Integration-branch ruleset: declined <date> — <reason>`), and **read that register at the
     start of this pass** and skip anything it records. Without that, a decline leaves settings
     byte-identical to a repo never offered anything, so every re-sync re-proposes it and the offer
     becomes an applied default by attrition. Otherwise as passes A–C: read state, propose, confirm,
     merge.

## 1. Survey the repo

Before writing anything, understand what's already here:

- **`CLAUDE.md`** - does it exist? What conventions does it already state (build/test/run commands,
  branch model, invariants)? This remains Fluyt's single contract file on both clients; you'll
  MERGE into it, not replace it. **Note any rule that contradicts a shared default** - each is a
  candidate for the deviations register rather than something to argue out of existence, unless it
  narrows a shared **gate**, which the register does not accept: surface that one to the user instead
  of recording it.
- **`AGENTS.md`** - does Codex already have repo guidance? Merge the Fluyt routing into it;
  never replace it or duplicate Project Facts there.
- **Client setup** - inspect `.claude/settings.json` for Claude Code and `codex plugin list` for
  Codex, according to the intended `agent-clients` value.
- **Trackers** - is there a CHANGELOG? A decisions log? Where do they live? (These
  become the `changelog` / `decisions` Project Facts keys.)
- **Backlog** - `gh issue list --limit 200` and `gh label list --limit 50`: does the repo use GitHub
  Issues yet, and what label scheme (plain `must/should/could`, `prio:*`, milestones or not)?
- **Local process components** - inspect `.claude/skills/`, `.claude/agents/`, and `.agents/skills/`
  as applicable. Note any whose job the plugin now covers (see §3 - *Propose retiring shadowed local
  components*).
- The stack, so you can fill `build-cmd` / `test-cmd` / `run-cmd` / `test-dir` by inspection.

## 2. Instantiate the templates (non-destructive)

Work through the templates, merging each:

1. **Project Facts** (`templates/CLAUDE-project-facts.md`) - this step is an **interview, not a
   fill**. Asking only where a value is ambiguous never fires for a key whose value IS inferable, so
   a defaulted key can silently decide orchestrator behaviour with nobody ever asked. A wrong default
   reads identically to a chosen one to every skill and agent that later reads the block, so survey
   the repo as before, but then **present, don't silently apply.**

   **Open with the single-action escape hatch - non-negotiable.** State that you've surveyed the repo
   and pre-filled every key with your recommendation, then offer exactly one choice up front: accept
   every recommendation as presented, or walk through the keys one at a time. Most onboardings take
   the first branch - an interview that becomes a chore gets routed around, so keep that the widest
   door.

   **Stamp provenance as you merge**, per `templates/CLAUDE-project-facts.md`'s "Provenance markers"
   comment (read it - it is the single-sourced vocabulary; don't re-derive it here). Accepting the
   bulk offer stamps every key you actually presented `<!-- provenance: ratified @v<the PLUGIN's
   version at merge time - the version in the plugin payload's .codex-plugin/plugin.json, never
   this repo's own CHANGELOG> -->`. Anything filled straight from the survey and never shown to
   the user as part of what you presented is `inferred` - leave it unmarked, which reads identically
   to an explicit `inferred` marker.

   **Walking per-key (only when the user asks to choose):** for every key, including `agent-clients:
   claude | codex | both`, present three things - its **purpose** (what it governs and which
   rituals/skills read it), the **realistic options with their consequences**, and which option your
   survey recommends. Draw the purpose/consequence text from `templates/CLAUDE-project-facts.md`'s own
   annotation for that key - its inline comment plus the trailing `<!-- Guidance -->` block where one
   exists - rather than re-deriving or duplicating it here; the template is the single-sourced key
   reference. The user **chooses**; don't hand them a value you already picked and call it confirmed.
   Stamp each key the user personally decides `<!-- provenance: chosen -->` (no version - a `chosen`
   key is never re-presented, so there is nothing to compare against later).

   **Two keys need this treatment even when the survey makes the value look obvious**, because both
   are inferable and an ask-on-ambiguity rule would never surface them: `delegation` is the
   **who-implements** decision (`default` → `ship-work-item` spawns the `developer` agent to
   implement; `on-demand` → the main agent implements inline) and `worktree-isolation` is the
   **where-it-implements** decision (`on-demand` → the shared checkout; `default` → an isolated `git
   worktree` per product-code item). Present both AS those decisions, not as settled config lines.

   Merge the completed block into `CLAUDE.md`. This block is load-bearing: the shared skills read
   these keys by name and stop-and-ask on a missing one. **A fact that does not exist YET is not
   `none`.** `none` means *this project has no such thing* - a settled answer, and since Pass A never
   overwrites an existing value a premature `none` is permanent and invisible. Where the thing is
   merely not built yet (a young repo with no build or no suite), record
   `<pending — set when it exists>` instead. **A pending value reads exactly like `none` to every
   skill that consumes the key** - any step that says "skip if `none`" skips it too, and it is never
   run as a command, written to as a path, or guessed at. The only difference is at re-sync: `none`
   is left alone, a pending value is chased.
2. **Client routing** - if `CLAUDE.md` is missing, seed it from
   the skeleton; if it exists, merge in the **"Agentic process (fluyt plugin)" routing
   paragraph** (this is what makes the shared skills discoverable - a plugin's own prose is not
   auto-loaded) and list any project-specific local skills. For `agent-clients: codex | both`, also
   merge `templates/AGENTS-skeleton.md` into `AGENTS.md`; it makes Codex auto-load the pointer to the
   same `CLAUDE.md` contract and routes specialist work through `dispatch-role`.
3. **The consumer-owned sections** (`templates/CLAUDE-skeleton.md`) - the skeleton ships these as
   `<...>` fill-ins, and they are load-bearing: `preflight-reviewer`, `tech-debt-reviewer`,
   `developer`, `test-writer`, and `product-owner` all enforce *whatever the `CLAUDE.md` declares*. A
   repo that onboards with an unfilled **Invariants** block gets five components checking almost
   nothing - and the pre-PR gate still returns PASS, so nobody finds out. **Interview for them.**

   The condition is **present and filled**, not "no placeholder survives": step 2 seeds the skeleton
   only when `CLAUDE.md` is *missing*, so a repo that already had one never receives these sections
   at all, and a placeholder-absence test would pass vacuously on exactly that repo. Check each is
   there - **under the skeleton's heading or the repo's own equivalent** - then that it says
   something. When a section is **absent**, propose adding it with the interviewed content, merged
   non-destructively; when it is present but bracketed, replace the `<...>` with the answers. Never
   add a second section beside an equivalent the repo already has - propose pointing or renaming
   instead; the reviewers also read the skills a `CLAUDE.md` routes to, so a section that says where
   the rules live counts as filled.

   - **Invariants** - the architecture rules the code must keep true: layering, single-source-of-truth
     objects, determinism or purity contracts where applicable, public-API / compatibility surfaces,
     security and data-handling rules - whichever of those classes apply. Push for specifics: two or
     three real ones make the reviewers useful from day one, and an aspiration ("keep it clean") gives
     them nothing to enforce.
   - **Code style** - match-the-surrounding-code rules, doc-comment density, the boy-scout rule.
     Present **documentation posture** as an explicit decision, like
     `delegation`/`worktree-isolation`: **(a) lean/agent-facing (recommended)** - document only
     what isn't directly clear from the code, for the agent working it, applied forward + boy-scout; costs discoverability for a human
     reader who expects in-code reference. **(b) dense/reference-style** - reference-style API
     documentation on most public members, for a project whose consumers genuinely read IDE/API
     reference; costs restatement-rot (the comment class that drifts once the code it restates
     changes) and a per-read context tax on every agent. Recommendation: (a). The skeleton's Code
     style fill-in ships (a)'s reusable wording as the starting text to adapt, and the boy-scout rule
     in its named-clause form with example clauses - point at those, don't restate them here.
   - **Deliberate deviations** - any rule from the survey that contradicts a shared default, recorded
     **with its reason**. An explicitly empty register is a valid answer; don't manufacture divergence
     to fill it. Where a Project Facts key already governs the choice **on its own documented
     trigger**, set the key instead - a key whose trigger is a different axis is not that key. **A rule
     that narrows a shared gate is not recordable here**: surface it and leave it out of the register.
   - **Project-specific skills** - the local skills the `developer` role should route to.
   - **The H1 title and the description + stack line** at the top of the file - the skeleton ships
     `# <Project name> — working agreement` as a fill-in too.
   - **Ask the human when** - this one is different. Its `<...>` block is a substantive **default gate
     list**, not an empty prompt: the autonomy doctrine keys off it, so blanking it empties the gate
     that makes a long scope grant safe. **Adapt it and drop the brackets - never replace it with
     `none`.** It is a shipped *starting* default that the consumer then owns: once adapted, the
     wording is theirs and re-sync never overwrites it - but a gate later added to the shipped
     default, or an existing one **materially changed** (see Pass B step 2 for the exact test), is
     still surfaced as a proposal.

   `none` is a legitimate answer for Invariants, Code style, the deviations register, and the skills
   list; never for *Ask the human when*.

4. **Claude settings** (`templates/settings-fragment.json`) - when `agent-clients` is `claude` or
   `both`, merge its keys into `.claude/settings.json` (create the file if absent). Preserve existing
   keys; only add missing ones. The fragment ships `worktree.baseRef: "fresh"`, which is correct for
   the recommended `default-branch == integration-branch` topology: a worktree then branches from the
   remote default branch - the integration branch, on this topology. **Conditional, not
   unconditional:** the client resolves "the remote default" via the local `origin/HEAD` symref, a
   clone-time snapshot that never auto-updates - `ship-work-item` §1's worktree hygiene carries the
   mechanism, the `git remote set-head origin --auto` re-sync, and the mandatory base-check backstop.
   A consumer whose `default-branch` differs from its `integration-branch` should set `"head"`
   instead and follow `ship-work-item` §1's spawn discipline (freshly-synced branch, captured SHA,
   fail-fast base check) for every isolated spawn.
   **Then land the load-bearing marketplace pin.** The shipped fragment carries only local client
   config (`worktree` base-ref and `autoCompactEnabled: true`, which makes the client's default
   threshold auto-compaction explicit), NOT the marketplace source - a shared template must stay
   slug-free. But consumers must track the plugin's **release branch**, not the marketplace's
   default branch: a bare `/plugin marketplace add` omits the
   `ref` and silently tracks the default. Confirm the consumer's **committed** `.claude/settings.json`
   has an `extraKnownMarketplaces` entry for this plugin's marketplace pinned with
   `"ref": "<release-branch>"` (Project Facts `release-branch`) plus the matching `enabledPlugins`
   entry - discover the marketplace's actual name/source from the installed marketplace config at
   runtime rather than hardcoding it. If the pin is missing or unpinned, **propose** adding the block
   (see `docs/consumer-integration.md` in the marketplace root for the exact shape). This pin
   decouples the consumer from the integration/default branch. Skip this step for
   `agent-clients: codex`; verify its marketplace ref through the Codex install flow instead.

   **Then offer, never apply, the sibling-repo trust.** When Project Facts `pinned-deps` is declared
   or the repo has a `.gitmodules`, offer a user-level `autoMode.environment` entry in
   `~/.claude/settings.json` (keeping `"$defaults"`) such as `"Source control: github.com/<owner>
   and all repos under it"` - it is machine-wide, so scope it to the owner's org, no wider - because
   the auto-mode classifier trusts only the working repo and its remotes by default and can refuse
   integrating code from the owner's own sibling repo (a submodule is one of its named examples) as
   untrusted. **The user makes the edit** (or accepts `/auto-mode-setup`'s draft) and checks it with
   `claude auto-mode config`; the project fragment cannot carry it, since the classifier never reads
   `autoMode` from `.claude/settings.json` or `.claude/settings.local.json`.
5. **gitignore** (`templates/gitignore-additions.txt`) - APPEND the missing lines to `.gitignore`
   (skip any already present). The `docs/process/*.local.md` glob is required - it keeps the
   friction notes (`retro-log.local.md`) and the `SubagentStop` hook's dispatch feed
   (`dispatch.local.md`) local, and covers any future local feed without another ignore migration;
   the hook writes to `dispatch.local.md` only, never to the friction file.
6. **gitattributes** (`templates/gitattributes.txt`) - if the repo has none, create it; otherwise
   leave the existing one and only suggest additions.
7. **CHANGELOG / DECISIONS** (`templates/CHANGELOG-skeleton.md`, `templates/DECISIONS-skeleton.md`) -
   create **only if missing**. Never overwrite an existing log. When you DO seed a fresh CHANGELOG from
   the skeleton, **align its "Versioning" block with the `version-rules` you filled** in Project Facts
   (step 1) - don't ship the skeleton's default axis when the project defined a different one (e.g. a
   plugin/library that treats a changed component as MINOR).
8. **Labels** (`templates/github-labels.ps1`) - **offer** to run it (it's idempotent -
   `gh label create --force`). Only run it if the repo wants the canonical plain scheme; if the repo
   already has a different scheme it wants to keep, declare that scheme in Project Facts instead. When
   Project Facts `agent-routing: labels`, run it with `-AgentRouting` to also seed the `model:*` /
   `agent:*` routing families.
9. **Repo merge settings** (optional, `gh`) - **offer** to enable auto-merge so the
   `ship-work-item` `--auto` path works: `gh api repos/{owner}/{repo} -X PATCH -f allow_auto_merge=true`.
   That flag is the only hard prerequisite for `--auto`, and a **just-created repo** (`gh repo create`)
   always starts with it off - set it here so the first armed PR doesn't error. **Do not
   blanket-enable `delete_branch_on_merge`:** when `integration-branch != release-branch`, GitHub
   would delete the merged **promotion PR's head branch - the integration branch itself, on every
   release**; per-PR `--delete-branch` already cleans work-item branches safely. Don't just warn -
   **verify and offer**: read the current setting, and when `integration-branch != release-branch`
   and it is enabled, offer to turn it off, naming the consequence. Enable it only for a trunk-based
   repo (`integration == release`). Branch protection is a separate, later step - see *Offer branch
   protection and audit CI* (§5), which runs after §4 because a required status check needs a job
   that has already reported. Skip this entirely for repos that merge manually.
10. **Branch model** (`git`) - every shared ritual assumes the declared `integration-branch` and
    `release-branch` already exist, but a fresh repo has only its initial branch, so nothing downstream
    can run. Verify and fill the gap:
    `git ls-remote --heads origin <integration-branch> <release-branch>` - for any branch that is
    **absent**, **offer** to create it from the repo's current default branch and push
    (`git push origin <default-branch>:refs/heads/<missing-branch>`). If the model wants
    `integration-branch` to be the GitHub **default** (so `Closes #N` auto-fires on work-item merges),
    set the default too - and mind the default-branch / auto-close interaction
    (`docs/consumer-integration.md` in the marketplace root, §6). Do this **before** §4's verify: that
    step runs `ship-work-item`, which checks out the integration branch and fails outright if it
    doesn't exist. A trunk-based repo where `integration-branch == release-branch ==` the default has
    nothing to create - skip.

## 3. Propose retiring shadowed local components

Same-named local process skills can shadow the plugin, and local Claude agents can duplicate its role
contracts. List every `.claude/skills/`, `.claude/agents/`, or `.agents/skills/` component whose job
the plugin now covers and **propose deleting it** - but let the USER verify each deletion. **Keep
every project-specific local skill** (stack/domain knowledge, area maps, codebase orientation) - the
plugin only replaces PROCESS assets, never domain ones. Codex does not load Claude agent manifests;
its supported path is the plugin's `dispatch-role` skill, not copied `.codex/agents/*.toml` files.

## 4. Verify

- Reload the active client. On Claude Code, use `/plugin` reload or restart when settings changed. On
  Codex, reinstall/refresh the plugin, then start a **new task** so the installed skill catalog reloads.
- Confirm `ship-work-item` and `adopt-conventions` resolve on every declared client. On Claude Code,
  confirm `fluyt:developer` is listed. On Codex, run `dispatch-role` smoke mode for
  `developer` and confirm the report names its canonical file and ends with `Skills consulted: ...`.
- **If the `fluyt:*` agents won't spawn** ("agent type 'fluyt:…' not found") even though the skills
  already resolve, **restart the client fully** - a `/plugin` reload refreshes skills but does not
  always register newly-added agents; only a full restart does. Interim fallback until you can
  restart: run a `general-purpose` agent with the target agent file's mandate pasted into the prompt.
- **Confirm the Claude marketplace pin is committed** when applicable - the consumer's
  `.claude/settings.json` pins this plugin's marketplace source to the `release-branch` via `ref`
  (see step 2.4). Without it the repo tracks the default branch and silently drifts off released
  `<release-branch>`.
- **Confirm every consumer-owned section is present AND filled** - the H1 title, the description/stack
  line, Invariants, Code style, the deviations register, the project-skills list, and *Ask the human
  when*. No `<...>` **fill-in prompt** may survive into the landed `CLAUDE.md`. Two things look like
  prompts and are not: a value whose canonical form *is* a bracketed format string
  (`commit-subject`), and a deliberate `<pending — …>` marker - leave both as they are. And no
  section may be missing either, **under the skeleton's heading or the repo's own equivalent**: a
  repo that already had a `CLAUDE.md` never received them from the skeleton, so absence is the
  likelier failure and a placeholder scan alone would report clean.
- **Run one trivial work item end-to-end** through `/fluyt:ship-work-item` (e.g. this very
  onboarding chore) to prove the ritual works against the freshly-filled Project Facts.

## 5. Offer branch protection and audit CI

**An offer, not a mandate** - applies only on an explicit yes. It runs here, after §4, because the
ruleset's required status check needs a context CI has already reported at least once - and the API
will happily accept a context that never arrives, which deadlocks the branch permanently.

Ask whether the consumer wants protection offered at all. On a yes, **run the `branch-protection`
skill and follow it end to end** - the whole playbook lives there and nothing of it is restated here:
the plan/visibility check, ruleset versus classic protection, the per-role ruleset template and its
filling rules, the never-`required_status_checks`-on-the-release-branch rule, the bypass
consequence, and the GitHub-Actions trigger audit with its docs-only fast-path offer.

## 6. Land it

Land the onboarding as a normal `chore/` PR per `/fluyt:ship-work-item` (it's a
tooling/process change → PATCH). The PR carries an explicit "no issue - fluyt onboarding"
note if there's no tracking issue.

## Notes on updates

Manual Git-backed installs ride the user's existing credentials. For a private fork, Claude Code
background auto-update may need a `GITHUB_TOKEN` / `GH_TOKEN` (the public repo needs none); Codex
marketplace refresh uses its configured Git source.
Never persist a token on the user's behalf. Point them at `docs/consumer-integration.md` in the
marketplace root for the full client-specific notes and use `/fluyt:install-refresh-plugin`
for load / refresh / diagnosis.
