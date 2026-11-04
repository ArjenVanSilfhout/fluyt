---
name: adopt-conventions
description: >-
  Adopt the fluyt process in a repo. Use after installing the plugin, or on "adopt the
  conventions", "set up fluyt here", "onboard this repo", "start a new project", or "re-sync the
  conventions".
---

# Adopt fluyt conventions

You are onboarding THIS repo (the consumer) to the fluyt process. Work **non-destructively** -
merge into what exists, never clobber - and land the result as a normal `chore/` PR. The templates
live under this skill's `templates/` directory; read each one before applying it.

**Everything here is proposed to the user and applied with their confirmation.** Onboarding edits a
repo's contract files - do it in the open.

## Three modes: from scratch, first-time adopt, re-sync

- **From scratch (greenfield)** - a project that does not exist yet, or an empty repo: it adds the
  steps *before* the flow below, then runs that flow unchanged. **Offer to create the repo - never
  create one unasked**: state the exact command and account, wait for an explicit yes, and `cd` into
  the clone before §1 (`gh` calls resolve the repo from the current directory). Read
  `from-scratch.md` in this skill's directory when the project does not exist yet or the repo is
  empty - the interview, the load-bearing `gh repo create` flags, seeding the first commit and the
  branch model, then the flow from §1.
- **First-time adopt** - the full flow below (survey → instantiate → retire shadows → verify → land).
- **Re-sync (drift check)** - for a repo *already* on fluyt, e.g. after updating the plugin: the
  Project Facts template, the shipped **guidance** (the routing paragraph, the autonomy rule in "Ask
  the human when") and the settings / gitignore / gitattributes **fragments** gain content over
  time, and an instantiate-once copy silently lacks it. It only *proposes* changes - non-destructive
  per the opening rule - lands as a `chore/` PR (docs/process → PATCH), and skips the survey /
  instantiate / retire / protection-offer steps below except two reaches back: Pass B's *offer* of
  the §2 step 3 interview and Pass D, which re-offers the §2 and §5 **repo-level** steps that only
  ever ran at onboarding. Read `re-sync.md` in this skill's directory when you are checking such a
  repo for drift; it runs four passes (A Project Facts keys, B plugin-owned guidance, C fragments,
  D repo and branch settings).

## 1. Survey the repo

Before writing anything, understand what's already here:

- **`CLAUDE.md`** - does it exist? What conventions does it already state (build/test/run commands,
  branch model, invariants)? It remains Fluyt's single contract file on both clients; MERGE into
  it, never replace it. **Note any rule that contradicts a shared default** - each is a
  candidate for the deviations register rather than something to argue out of existence, unless it
  narrows a shared **gate**, which the register does not accept: surface that one to the user instead
  of recording it.
- **`AGENTS.md`** - does Codex already have repo guidance? Merge the Fluyt routing into it;
  never replace it or duplicate Project Facts there.
- **Client setup** - inspect `.claude/settings.json` (Claude Code) and `codex plugin list` (Codex),
  per the intended `agent-clients` value.
- **Trackers** - is there a CHANGELOG? A decisions log? Where do they live? (They become the
  `changelog` / `decisions` Project Facts keys.)
- **Backlog** - `gh issue list --limit 200` and `gh label list --limit 50`: does the repo use GitHub
  Issues yet, and what label scheme (plain `must/should/could`, `prio:*`, milestones or not)?
- **Local process components** - inspect `.claude/skills/`, `.claude/agents/`, and `.agents/skills/`
  as applicable. Note any whose job the plugin now covers (§3).
- The stack, so you can fill `build-cmd` / `test-cmd` / `run-cmd` / `test-dir` by inspection.

## 2. Instantiate the templates (non-destructive)

Merge each template:

1. **Project Facts** (`templates/CLAUDE-project-facts.md`) - this step is an **interview, not a
   fill**. Asking only where a value is ambiguous never fires for an inferable key, so a
   defaulted key can silently decide orchestrator behaviour, and a wrong default reads identically
   to a chosen one to every later reader. Survey the repo as before, then **present, don't silently
   apply.**

   **Open with the single-action escape hatch - non-negotiable.** State that you've surveyed the repo
   and pre-filled every key with your recommendation, then offer exactly one choice: accept every
   recommendation as presented, or walk through the keys one at a time. Keep the first branch
   the widest door: an interview that becomes a chore gets routed around.

   **Stamp provenance as you merge**, per `templates/CLAUDE-project-facts.md`'s "Provenance markers"
   comment (read it - the single-sourced vocabulary). Accepting the bulk
   offer stamps every key you actually presented `<!-- provenance: ratified @v<the PLUGIN's
   version at merge time - the version in the plugin payload's .codex-plugin/plugin.json, never
   this repo's own CHANGELOG> -->`. Anything filled straight from the survey and never shown to
   the user is `inferred` - leave it unmarked (absent reads as `inferred`).

   **Walking per-key (only when the user asks to choose):** for every key, including `agent-clients:
   claude | codex | both`, present three things - its **purpose** (what it governs and which
   rituals/skills read it), the **realistic options with their consequences**, and which option your
   survey recommends. Draw the purpose/consequence text from `templates/CLAUDE-project-facts.md`'s own
   annotation for that key - its inline comment plus the trailing `<!-- Guidance -->` block where one
   exists - not from here; the template is the single-sourced key reference. The user **chooses**;
   don't hand them a value you picked and call it confirmed. Stamp each key the user personally
   decides `<!-- provenance: chosen -->` (no version - a `chosen` key is never re-presented, so
   there is nothing to compare against later).

   **Two keys need this treatment even when the survey makes the value look obvious**, because both
   are inferable and an ask-on-ambiguity rule would never surface them: `delegation` is the
   **who-implements** decision (`default` → `ship-work-item` spawns the `developer` agent to
   implement; `on-demand` → the main agent implements inline) and `worktree-isolation` is the
   **where-it-implements** decision (`on-demand` → the shared checkout; `default` → an isolated `git
   worktree` per product-code item). Present both AS those decisions, not as settled config lines.

   Merge the completed block into `CLAUDE.md`: the shared skills read these keys by name and
   stop-and-ask on a missing one. **A fact that does not exist YET is not
   `none`.** `none` means *this project has no such thing* - a settled answer, and since re-sync
   never overwrites an existing value a premature `none` is permanent and invisible. Where the thing
   is merely not built yet, record `<pending — set when it exists>` instead. **A pending value reads
   exactly like `none` to every skill that consumes the key** - a "skip if `none`" step skips it,
   and it is never run as a command, written to as a path, or guessed at. The only difference is at
   re-sync: `none` is left alone, a pending value is chased.
2. **Client routing** - if `CLAUDE.md` is missing, seed it from the skeleton; if it exists, merge in
   the **"Agentic process (fluyt plugin)" routing paragraph and its notation line** (what makes the
   shared skills discoverable; a plugin's own prose is not auto-loaded) and list any
   project-specific local skills. For `agent-clients: codex | both`, also merge
   `templates/AGENTS-skeleton.md` into `AGENTS.md`; it makes Codex auto-load the pointer to the same
   `CLAUDE.md` contract and routes specialist work through `dispatch-role`.
3. **The consumer-owned sections** (`templates/CLAUDE-skeleton.md`) - the skeleton ships these as
   `<...>` fill-ins, and they are load-bearing: `preflight-reviewer`, `tech-debt-reviewer`,
   `developer`, `test-writer`, and `product-owner` all enforce *whatever the `CLAUDE.md` declares*.
   An unfilled **Invariants** block leaves five components checking almost nothing, and the pre-PR
   gate still returns PASS. **Interview for them.**

   The condition is **present and filled**, not "no placeholder survives": step 2 seeds the skeleton
   only when `CLAUDE.md` is *missing*, so a repo that already had one never receives these sections
   and a placeholder-absence test would pass vacuously on it. Check each is there - **under the
   skeleton's heading or the repo's own equivalent** - then that it says something. When a section
   is **absent**, propose adding it with the interviewed content, merged non-destructively; when
   present but bracketed, replace the `<...>` with the answers. Never add a second section beside an
   equivalent the repo already has - propose pointing or renaming instead; the reviewers also read
   the skills a `CLAUDE.md` routes to, so a section saying where the rules live counts as filled.

   - **Invariants** - the architecture rules the code must keep true: layering, single-source-of-truth
     objects, determinism or purity contracts where applicable, public-API / compatibility surfaces,
     security and data-handling rules - whichever of those classes apply. Push for specifics: two or
     three real ones make the reviewers useful from day one; an aspiration ("keep it clean") gives
     them nothing to enforce.
   - **Code style** - match-the-surrounding-code rules, doc-comment density, the boy-scout rule.
     Present **documentation posture** as an explicit decision, like
     `delegation`/`worktree-isolation`: **(a) lean/agent-facing (recommended)** - document only
     what isn't directly clear from the code, for the agent working it, applied forward + boy-scout;
     costs discoverability for a human reader who expects in-code reference. **(b) dense/reference
     style** - API documentation on most public members, for a project whose consumers genuinely
     read IDE/API reference; costs restatement-rot (comments that drift once the code they restate
     changes) and a per-read context tax on every agent. Recommendation: (a). The skeleton's Code
     style fill-in ships (a)'s wording and the boy-scout rule in its named-clause form as starting
     text - point at those, don't restate them.
   - **Deliberate deviations** - any rule from the survey that contradicts a shared default, recorded
     **with its reason**. An empty register is a valid answer; don't manufacture divergence. Where a
     Project Facts key already governs the choice **on its own documented trigger**, set the key
     instead - a key whose trigger is a different axis is not that key. **A rule that narrows a
     shared gate is not recordable here**: surface it and leave it out of the register.
   - **Project-specific skills** - the local skills the `developer` role should route to.
   - **The H1 title and the description + stack line** at the top of the file (the skeleton ships
     `# <Project name> — working agreement` as a fill-in too).
   - **Ask the human when** - different: its `<...>` block is a substantive **default gate list**,
     not an empty prompt, and blanking it empties the gate that makes a long scope grant safe.
     **Adapt it and drop the brackets - never replace it with `none`.** Once adapted the wording is
     the consumer's and re-sync never overwrites it - but a gate later added to the shipped default,
     or an existing one **materially changed** (`re-sync.md` Pass B step 2 has the exact test), is
     still surfaced as a proposal.

   `none` is a legitimate answer for Invariants, Code style, the deviations register, and the skills
   list; never for *Ask the human when*.

4. **Claude settings** (`templates/settings-fragment.json`) - when `agent-clients` is `claude` or
   `both`, merge its keys into `.claude/settings.json` (create the file if absent). Preserve
   existing keys; only add missing ones. The fragment ships `worktree.baseRef: "fresh"`, which is
   correct for the recommended `default-branch == integration-branch` topology: a worktree then
   branches from the remote default branch - the integration branch, on this topology.
   **Conditional:** the client resolves that via the local `origin/HEAD` symref, a clone-time
   snapshot that never auto-updates - `ship-work-item` §1's worktree hygiene carries the mechanism,
   the re-sync, and the mandatory base-check backstop. A consumer whose `default-branch` differs
   from its `integration-branch` should set `"head"` instead and follow that §1's spawn discipline
   for every isolated spawn.

   **Then land the load-bearing marketplace pin.** The shipped fragment carries only local client
   config (`worktree` base-ref and `autoCompactEnabled: true`, which makes the client's default
   threshold auto-compaction explicit), NOT the marketplace source - a shared template must stay
   slug-free. But consumers must track the plugin's **release branch**, not the marketplace's
   default branch: a bare `/plugin marketplace add` omits the `ref` and silently tracks the default.
   Confirm the consumer's **committed** `.claude/settings.json` has an `extraKnownMarketplaces`
   entry for this plugin's marketplace pinned with `"ref": "<release-branch>"` (Project Facts
   `release-branch`) plus the matching `enabledPlugins` entry - discover the marketplace's actual
   name/source from the installed marketplace config at runtime rather than hardcoding it. If the
   pin is missing or unpinned, **propose** adding the block (see `docs/consumer-integration.md` in
   the marketplace root for the exact shape). Skip this step for `agent-clients: codex`; verify its
   marketplace ref through the Codex install flow instead.

   **Then offer, never apply, the sibling-repo trust.** When Project Facts `pinned-deps` is declared
   or the repo has a `.gitmodules`, offer a user-level `autoMode.environment` entry in
   `~/.claude/settings.json` (keeping `"$defaults"`) such as `"Source control: github.com/<owner>
   and all repos under it"` - it is machine-wide, so scope it to the owner's org, no wider - because
   the auto-mode classifier trusts only the working repo and its remotes by default and can refuse
   integrating code from the owner's own sibling repo (e.g. a submodule) as untrusted. **The user
   makes the edit** (or accepts `/auto-mode-setup`'s draft) and checks it with `claude auto-mode
   config`; the project fragment cannot carry it - the classifier never reads `autoMode` from
   `.claude/settings.json` or `.claude/settings.local.json`.
5. **gitignore** (`templates/gitignore-additions.txt`) - APPEND the missing lines to `.gitignore`
   (skip any already present). The `docs/process/*.local.md` glob is required - it keeps the
   friction notes (`retro-log.local.md`) and the `SubagentStop` hook's dispatch feed
   (`dispatch.local.md`) local and covers any future local feed; the hook writes to
   `dispatch.local.md` only, never to the friction file.
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
   release**; per-PR `--delete-branch` already cleans work-item branches safely. **Verify and
   offer**: read the current setting, and when `integration-branch != release-branch` and it is
   enabled, offer to turn it off, naming the consequence. Enable it only for a trunk-based repo
   (`integration == release`). Branch protection is a later step (§5, after §4). Skip this entirely
   for repos that merge manually.
10. **Branch model** (`git`) - every shared ritual assumes the declared `integration-branch` and
    `release-branch` already exist, but a fresh repo has only its initial branch. Verify and fill
    the gap: `git ls-remote --heads origin <integration-branch> <release-branch>` - for any branch
    that is **absent**, **offer** to create it from the repo's current default branch and push
    (`git push origin <default-branch>:refs/heads/<missing-branch>`). If the model wants
    `integration-branch` to be the GitHub **default** (so `Closes #N` auto-fires on work-item merges),
    set the default too - and mind the default-branch / auto-close interaction
    (`docs/consumer-integration.md` in the marketplace root, §6). Do this **before** §4's verify,
    which runs `ship-work-item` and fails outright if the integration branch doesn't exist. A
    trunk-based repo where `integration-branch == release-branch ==` the default has nothing to
    create - skip.

## 3. Propose retiring shadowed local components

Same-named local process skills can shadow the plugin, and local Claude agents can duplicate its role
contracts. List every `.claude/skills/`, `.claude/agents/`, or `.agents/skills/` component whose job
the plugin now covers and **propose deleting it** - but let the USER verify each deletion. **Keep
every project-specific local skill** (stack/domain knowledge, area maps, codebase orientation) - the
plugin only replaces PROCESS assets, never domain ones. Codex does not load Claude agent manifests;
its supported path is the plugin's `dispatch-role` skill, not copied `.codex/agents/*.toml` files.

## 4. Verify

- Reload the active client. On Claude Code, use `/plugin` reload or restart when settings changed. On
  Codex, reinstall/refresh the plugin, then start a **new task** so the skill catalog reloads.
- Confirm `ship-work-item` and `adopt-conventions` resolve on every declared client. On Claude Code,
  confirm `fluyt:developer` is listed. On Codex, run `dispatch-role` smoke mode for
  `developer` and confirm the report names its canonical file and ends with `Skills consulted: ...`.
- **If the `fluyt:*` agents won't spawn** ("agent type 'fluyt:…' not found") even though the skills
  already resolve, **restart the client fully** (`install-refresh-plugin`, *Four load requirements*,
  owns why a reload is not enough). Interim fallback until you can restart: run a `general-purpose`
  agent with the target agent file's mandate pasted into the prompt.
- **Confirm the Claude marketplace pin is committed** when applicable - the consumer's
  `.claude/settings.json` pins this plugin's marketplace source to the `release-branch` via `ref`
  (step 2.4); without it the repo tracks the default branch and drifts off released work.
- **Confirm every consumer-owned section is present AND filled** - the H1 title, the description/stack
  line, Invariants, Code style, the deviations register, the project-skills list, and *Ask the human
  when*. No `<...>` **fill-in prompt** may survive into the landed `CLAUDE.md`. Two things look like
  prompts and are not: a value whose canonical form *is* a bracketed format string
  (`commit-subject`), and a deliberate `<pending — …>` marker - leave both. And no section may be
  missing either, **under the skeleton's heading or the repo's own equivalent** (§2 step 3: a
  placeholder scan alone would report clean).
- **Run one trivial work item end-to-end** through `/fluyt:ship-work-item` (e.g. this onboarding
  chore) to prove the ritual works against the freshly-filled Project Facts.

## 5. Offer branch protection and audit CI

**An offer, not a mandate** - applies only on an explicit yes. It runs after §4 because the
ruleset's required status check needs a context CI has already reported at least once - the API will
happily accept a context that never arrives, which deadlocks the branch permanently.

Ask whether the consumer wants protection offered at all. On a yes, **run the `branch-protection`
skill and follow it end to end** - the whole playbook lives there, including the
never-`required_status_checks`-on-the-release-branch rule, the trigger audit and its docs-only
fast-path offer.

## 6. Land it

Land the onboarding as a normal `chore/` PR per `/fluyt:ship-work-item` (a tooling/process change →
PATCH). The PR carries an explicit "no issue - fluyt onboarding" note if there's no tracking issue.

## Notes on updates

Manual Git-backed installs ride the user's existing credentials. **Never persist a token on the
user's behalf.** For a private fork's authentication and for load / refresh / diagnosis use
`/fluyt:install-refresh-plugin`; `docs/consumer-integration.md` in the marketplace root has the full
client-specific notes.
