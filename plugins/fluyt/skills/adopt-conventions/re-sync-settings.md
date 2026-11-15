# Re-sync Pass C (settings / gitignore / gitattributes fragments)

The on-demand part of the `adopt-conventions` skill, read from `re-sync.md` Pass C; its § N
references point into `SKILL.md`.

1. Read `.gitignore`, `.gitattributes`, and their templates. When `agent-clients` is `claude` or
   `both`, also read the consumer's `.claude/settings.json` and `templates/settings-fragment.json`.
   Codex marketplace installation is client-level and has no consumer settings fragment to merge.
2. List the keys / lines the templates ship that the consumer's files are **missing** (e.g. a newly
   required `.gitignore` line, a new settings key). Surface - never delete - anything the consumer
   added that the template lacks.
3. **Propose** adding the missing keys / lines only - additive, confirm-first, never overwriting a
   consumer's own values or reformatting their file. Merge only the confirmed additions.
4. **Offer the two opt-in context savers**, one at a time, with the wording and consequences of
   `SKILL.md` §2 step 4 (the "two context savers" paragraph) - the unused-tool `permissions.deny`
   and `"autoMemoryEnabled": false`. A repo that adopted before they existed was never offered
   them, and the fragment never carries them (each binds every user of the repo). **Offer each
   only when `agent-clients` is not `codex` and its key is absent from the consumer's
   `.claude/settings.json`**; read the *Deliberate deviations* register first and skip any offer it
   records as declined. Apply nothing without an explicit yes; on a decline, record it per
   `re-sync.md` Pass D step 4, so the offer never becomes a default by attrition.
