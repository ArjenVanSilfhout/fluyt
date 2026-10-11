---
name: arrow-notation
description: >
  Maintainer-side, Fluyt only: apply the arrow-notation legend (⇒ implies, → then) to a
  skill or agent file, converting only sequences, condition→action lines and failure chains, and
  rewording prose so more of it converts safely without losing a qualifier. Use when asked to
  "apply the legend", "arrow-ify", "make this skill more formulaic", or "convert to arrows" for a
  file under plugins/. Not shipped; consumers never load it.
---

# Arrow notation — applying the legend to a skill or agent

Repo-local (`.claude/skills/`), never shipped. It records how to apply the notation to
`ship-work-item`-style files so the next file gets the same treatment without re-deriving the
rules.

**The goal is skimmability, not bytes.** Each glyph is 3 bytes in UTF-8, so an arrow only saves
bytes against a word of four or more letters, and the legend costs ~100 B. Promise the reader
faster scanning, never a smaller file.

## The legend

Put it **once per file**, near the top (after the intro, before the first numbered section):

```text
Notation: `⇒` = implies (what follows, or what a system does); `→` = then (the next step, or the
action you take).
```

- **One per file, not one per plugin.** A consumer loads a single skill; a legend in a sibling file
  is a dangling pointer for that reader.
- `⇒` = an outcome nobody chooses (GitHub closes the issue, the agent commits on the wrong branch).
  `→` = a step the reader takes. Mixing them up is easy — check every glyph.
- **No new glyphs.** Add a glyph to the legend only when a converted line actually uses it.

## What converts — three shapes only

| Shape | Before | After |
| --- | --- | --- |
| Sequence | "fetch the epic body, flip its box, and write it back" | fetch the epic body → flip its box → write it back |
| Condition → action | "If any of the three fails, dispatch." | Any of the three fails → dispatch. |
| Failure chain | "Moving `HEAD` under a live agent means its next commit lands on…" | Moving `HEAD` under a live agent ⇒ its next commit lands on… |

Convert only the **linking words**: if / when / means / then / "so" before an action / a comma
between steps. Every other word stays.

## What never converts

- **A sentence whose qualifier gates when or whether it applies**: only, only when, unless,
  regardless, always, never, at least, until, before, once, not (as a condition). Leave it prose
  even when the word would survive — the arrow re-scopes it.
- **A rule that carries its reason.** The why is the substance; an arrow drops "because".
- **Bold load-bearing clauses**, fenced blocks (byte-identical), **code spans** (payload — never
  rewrite `!=` as `≠`), Project Facts keys, headings, step numbers, `§N` cites, *Section* anchors.
- **Gate and precedence text**: the scope-grant rules, the stops list, a fail-fast check, a jq
  filter's explanation. A misread there costs more than any skim saves.
- **The frontmatter `description`** — it is matched for triggering, not skimmed.
- **A parallel list where only some items qualify.** Converting half a list makes it harder to
  scan, not easier — leave the whole list prose.

A negation that is simply part of an **outcome** may sit inside a chain
(`⇒ GitHub will NOT auto-close → you MUST close it manually`), because it limits nothing.

## Rewording so more of it converts (substance kept)

The prose was not written for arrows. These rewrites make a line convertible without dropping
anything — apply one, then convert:

1. **Hoist the qualifier into its own prose sentence, then chain.**
   "Only when a review is outstanding, open it as a draft, let it report, then mark it ready" →
   "Only when a review is outstanding: open a draft → let it report → `gh pr ready`." The gate
   stays a sentence; only the steps chain. Check the hoisted qualifier still scopes **every** step.
2. **Split rule from reason.** "Do X, because Y" → "Do X." (prose) plus "Skip it ⇒ Y." (chain).
   Only when the reason is a consequence; a reason that is a principle stays one prose sentence.
3. **Name the actor when the arrow would hide it.** "→ close it" after a system outcome reads as the
   system acting; write "→ you close it".
4. **Break a long chain.** More than four steps on one line → split at a natural seam, each line
   its own chain.
5. **Keep temporal words as prose.** "once CI is green", "after the merge", "before you arm" gate
   timing; keep them attached to the exact step they gated, no comma moved.
6. **Don't invent structure.** If the original was one judgment ("use judgment, but…"), it is not a
   sequence — leave it.
7. **The left side must still read as a condition.** "Project prefers X → follow it" reads as a
   statement of fact; keep "If the project prefers X, …" as prose.
8. **An arrow means only what the legend says.** "decision → issue comment" uses `→` as "goes
   into"; write "decision → record it as an issue comment" so it is an action.

## Procedure

1. Read the whole target file and the repo CLAUDE.md Code style. Branch per `ship-work-item`.
2. Measure before: CR-excluded bytes (`tr -d '\r' < F | wc -c`), the qualifier counts, the fenced
   block hashes and the code-span set (commands below).
3. Add the legend; convert line by line; record a **ledger**: before text → after text → every
   qualifier/negation and where it survives.
4. Measure after with the same commands. **Qualifier counts must match exactly** (the legend adds none); fenced hashes identical; the code-span diff adds only
   the legend's own two spans. Read that diff rather than its hash: the per-line `grep -o` pairs
   backticks across prose too, so a few pairing artifacts (prose fragments such as a lone em dash
   between two spans) appear on both sides and are not changes.
   A count that moved is a lost or invented qualifier — find it before going on.
5. Gate (`pwsh -NoProfile -File scripts/validate-local.ps1`, redirect to a file): `[12]` budget,
   `[7]` invariants. MD038 has no local check — scan spans yourself.
6. Preflight with an **independent qualifier audit of every changed hunk**: same qualifiers on the
   same clause, meaning unchanged, one of the three shapes, `⇒` vs `→` per the legend. Paste the
   ledger into the brief only as a claim to check, never as the answer.
7. CHANGELOG: **PATCH** — notation changes no instruction a consumer follows. Lean entry; give the
   byte delta and the converted-sentence count, measured. Count re-glyphed existing arrows
   separately, and only claim "every qualified line stays prose" if no converted chain keeps a reason
   in a parenthetical.

```sh
F=plugins/fluyt/skills/<name>/SKILL.md
# qualifier counts (run on `git show HEAD:$F` and on $F)
for w in only unless regardless always never 'at least' until before once must not no nothing any; do
  printf '%s %s\n' "$w" "$(grep -oiw -- "$w" "$F" | wc -l)"; done
# fenced blocks, hashed
awk '/^[[:space:]]*```/{f=!f; next} f' "$F" | md5sum   # list-nested fences are indented
# code-span list: once from `git show HEAD:$F` into spans.before.txt, once from $F into
# spans.after.txt, then: diff spans.before.txt spans.after.txt
grep -o '`[^`]*`' "$F" | sort -u > spans.after.txt
```

## Where it pays off

- **Clear win:** real command sequences — the §4 arm → read-back flow, *After the merge lands*
  steps 3 and 6, a three-step visual-evidence check.
- **Modest:** plain if/then branches (the auto-close pair).
- **Wash:** short sentences that were already one clause — the arrow only swaps a verb for a glyph.

Prefer files with long procedural steps. A file that is mostly rules-with-reasons (most agent
contracts) will convert little; say so and stop rather than forcing shapes onto it.
