# Re-sync (drift check)

The on-demand part of the `adopt-conventions` skill, read when its `SKILL.md` points here; its
§ N and *Section* references point into that `SKILL.md`.

For a repo *already* on fluyt, e.g. after updating the plugin. It only *proposes* changes and lands
as a `chore/` PR (docs/process → PATCH); its four passes follow. What it reaches back into (§2 step
3, the §2 and §5 repo-level steps) is in `SKILL.md`.

**Pass A - Project Facts keys:**

1. Read the consumer's current Project Facts block and `templates/CLAUDE-project-facts.md`.
2. List keys the template defines that the block is **missing**; also surface (as a note, never a
   deletion) any keys the block has that the template no longer defines.
3. For each missing key, propose a value by inspection where inferable (build/test/branch facts),
   and **ask** where it's a design or priority choice - don't guess.
4. Merge in only the confirmed additions; **never overwrite an existing value.**
5. Surface any value recorded as `<pending — …>`: the thing may exist by now, so propose the real
   value. This is one of two cases where a key already has content and still needs revisiting -
   hence `<pending>` rather than `none`.
6. **Detect a defective `version-rules` and offer the correction.** If the consumer's
   `version-rules` value mentions **`single-file`** (or otherwise splits MINOR/PATCH by *file
   count*), it carries a flawed rule: file count is not a versioning axis, so a one-file change
   that alters product behaviour satisfies MINOR and PATCH at once with no precedence rule. **Show
   the current value, explain the ambiguity, and propose the behaviour-axis wording** - then let
   the consumer confirm. Do **not** rewrite it silently: step 4's never-overwrite rule holds, and a
   project's versioning is the project's call. This is the second revisit case: a wrong *default* is
   otherwise indistinguishable from a deliberate choice. **When the
   consumer accepts the key correction, also check the CHANGELOG's Versioning block** - the block
   §2 step 7 seeds and aligns with `version-rules` at onboarding. If it still states the old
   file-count axis, show its current wording and propose the matching behaviour-axis correction,
   same confirm-first posture: the consumer's CHANGELOG is theirs, so propose, never rewrite
   silently. Correcting the key alone would leave two disagreeing statements of the axis.
7. **Re-derive an existing key by its provenance marker, not uniformly.** The one exception to
   step 4's never-overwrite rule; the vocabulary is `templates/CLAUDE-project-facts.md`'s
   "Provenance markers" (absent marker reads as `inferred`):
   - **`inferred`** - re-survey and propose the current recommendation as for a missing key.
   - **`ratified @vX.Y.Z`** - **re-presented, never silently overwritten**, and only when that key's
     definition in the template carries a `<!-- recommendation-changed: vW.Z.Y -->` annotation
     NEWER than the key's `@vX.Y.Z` stamp; show the interview's purpose / options / recommendation
     and let the consumer re-decide. **Bulk-accepting re-stamps `ratified @<new plugin version>` -
     it does NOT become `chosen`**; that happens only when the consumer engages with that one key.
     No newer tell → leave it alone.
   - **`chosen`** - never touched, whatever any `recommendation-changed` tell says.

**Pass B - plugin-owned guidance sections:**

1. Read Project Facts `agent-clients`, the consumer's `CLAUDE.md`, and
   `templates/CLAUDE-skeleton.md`. When `agent-clients` is `codex` or `both`, also read the
   consumer's `AGENTS.md` (if present) and `templates/AGENTS-skeleton.md`.
2. **Work paragraph-by-paragraph, not section-by-section - tell plugin-owned prose from consumer
   content by the skeleton's `<...>` convention.** The skeleton is the source of truth: a paragraph
   it ships with **no `<...>` token** is **plugin-owned** (e.g. the "Agentic process" routing
   paragraph, the precedence pointer under *Deliberate deviations from the shared playbook*, the
   "Otherwise, keep working" autonomy rule); a paragraph it marks `<...>` is a **consumer
   fill-in** (e.g. Project Facts values, the project-specific-skills list, the invariants, the
   code-style rules, the deviations register, the "Ask the human when" trigger list). The two
   interleave inside the same section, so propagate a bracket-free paragraph **even when it sits
   in a section that also has a fill-in**, and never touch the fill-in paragraphs. **One
   qualification to the bracket heuristic:** the `<...>` list under `## Ask the human when` is a
   shipped **default gate list**, not an empty prompt (see §2 step 3). The consumer's adapted
   wording is theirs and is never overwritten - but when the skeleton's default list gains a *new*
   gate, **or an existing gate is materially changed**, surface that as a proposal, exactly as for
   a plugin-owned paragraph. **Test for "materially changed": the trigger condition now fires on
   different situations.** A semantic trigger-condition change surfaces; a stylistic reword that
   leaves the trigger unchanged does not. Either way the proposal shows the semantic change for
   the consumer to adapt into their own wording - it never overwrites what the consumer already
   wrote. Otherwise a gate added or tightened upstream would reach new adopters only, while every
   already-onboarded repo keeps the old trigger forever.
3. For each plugin-owned paragraph, check whether the consumer's `CLAUDE.md` carries it and whether
   it still matches the current skeleton. Propose adding a missing one, or show a diff for a stale
   one - **confirm-first, never automatic** (as throughout this skill). Plugin-owned prose the
   skeleton no longer ships is stale too: propose removing it (e.g. the per-skill routing list
   that v1.17.0 replaced with a short routing paragraph). If the consumer has
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
   `conditions.ref_name.include` covers it, since rulesets are per role. Then
   `gh label list --limit 100` against
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
   `allowed_merge_methods: ["merge"]`. And **never propose `required_status_checks` on the release
   branch** - unset is its end state, not drift; a required context that never reports deadlocks
   the branch consumers pin. If the consumer asks for it, that skill's gate is the only route (a
   repo that has promoted may meet it: read it, never assume). The fast-path re-offer carries that
   skill's obligations unchanged.
4. Apply nothing without an explicit yes. **When the consumer declines, propose recording it** as a
   one-line entry in their `CLAUDE.md` *Deliberate deviations from the shared playbook* register
   (e.g. `Integration-branch ruleset: declined <date> — <reason>`), and **read that register at the
   start of this pass** and skip anything it records. Without that, a decline leaves settings
   byte-identical to a repo never offered anything, so every re-sync re-proposes it and the offer
   becomes a default by attrition. Otherwise as passes A–C: read state, propose, confirm,
   merge.
