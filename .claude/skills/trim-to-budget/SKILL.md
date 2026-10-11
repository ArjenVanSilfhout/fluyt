---
name: trim-to-budget
description: >
  Maintainer-side, Fluyt only: trim a shipped skill or agent file under plugins/ until it fits its
  byte budget in scripts/component-size-budget.txt (gate check [12]), with wording-only cuts that
  change no instruction a consumer follows. Use when a budget is lowered, when a file fails [12],
  or when asked to "trim", "shrink", "fit the budget" or "cut bytes" from a skill or agent. Not
  shipped; consumers never load it.
---

# Trim to budget — cutting bytes without cutting behaviour

Repo-local (`.claude/skills/`), never shipped. The budget file's header owns the ratchet formula
and the raise/lower rule. This skill covers only how to cut a file down to its line.

**The goal is a smaller file that tells the reader exactly the same thing.** If a cut changes what
a consumer is told to do, it is not a trim. Stop and raise it as a decision. Either the
behaviour change goes in as MINOR with its own reason, or the budget stays where it was.

## 1. Measure the way the gate measures

- Size = UTF-8 bytes with CR (0x0D) removed, which is what `[12]` counts. In Bash:
  `tr -d '\r' < <file> | wc -c`. Never use characters, lines or the size Explorer shows.
- An em dash, arrow or curly quote is 3 bytes. **Em dashes go**: write ` - ` instead. An em dash
  that starts a wrapped line must be reworded, because a line that starts with a hyphen and a
  space is a list item.
  **Arrows stay** (`⇒`, `→`). They are notation, not decoration.
- Work out the target first: **2% under the budget**, i.e. `floor(budget * 0.98)`. That headroom
  lets the next improvement to the skill land without reopening the budget.
- Everything directly in the skill directory is budgeted (`SKILL.md` plus the reference files it
  splits out), each file on its own line. A split is not a trim: see §2a.

## 2a. Splitting into a reference file: when to and when not to

A split moves bytes and never removes them. What it buys is **load cost on the common path**:
`SKILL.md` loads in full on every invocation, but a reference file loads only when its pointer
says to read it. So judge a split by what a typical run stops reading, not by the budget line.

**Split when ALL of these hold:**

- **The content is off the common path.** It is needed only in one mode, on one platform, or on
  one failure: a recipe for parallel lanes, portability notes, a catalogue of known failures.
- **It stands alone.** It reads correctly without the surrounding `SKILL.md` text.
- **It is big enough to pay for itself**, about 1.5 KB or more. The pointer, the new file's
  heading and the extra read cost bytes and a tool call.
- **The pointer states the trigger.** "Read `parallel-work.md` when two items run at once", not
  "see also".

**Do not split when ANY of these hold:**

- **Every run needs it.** A split on the main path adds a read per run and makes the total larger.
- **It is a gate, stop condition, or safety rule.** A rule behind a link is skipped at the moment
  it matters. It stays in front of the reader.
- **The only reason is the budget line.** The new file needs its own line, so the skill's total
  rises. A split never counts toward a budget cut.
- **The target is `templates/`** and the text is not a template. That directory is unbudgeted, so
  moving prose there is a loophole.
- **The file is an agent role.** Roles are single files with no on-demand reference mechanism.
- **Other files cite the section by name.** The split must update every pointer (grep `plugins/`).

**Accounting:** after a split, the skill directory's summed budget lines must not rise. The new
file's line comes out of `SKILL.md`'s line.

## 2. What to cut, cheapest-risk first

1. **Restatements.** Per *State once, point thereafter* (CLAUDE.md, Code style), a fact repeated
   later in the same file becomes a pointer ("see §2"). Keep any repeat the text marks as
   deliberate (safety repetition, point-of-use duplication).
2. **Duplication of another component.** When a sibling skill or role owns a rule, replace the
   restated body with a pointer to the owner. Check that the owner really says it before you
   delete your copy.
3. **Filler.** "In order to" → "to"; "it is important to note that" → nothing; "make sure that"
   → imperative; "note that", "basically", "simply", "actually", "really" usually go. Double
   hedges ("may possibly") collapse.
4. **Over-long examples.** Shorten an example to the smallest one that still shows the point.
   Drop a second example that teaches nothing the first did not.
5. **Wordy constructions.** Passive → active where shorter; "there is X that does Y" → "X does Y";
   nominalisations ("perform a check of") → verbs ("check").
6. **Prose rationale that no instruction depends on.** Shipped files carry little rationale by
   design. Rationale that justifies a non-obvious rule stays, because removing it invites a later
   "simplification" that breaks the rule.

## 3. What never to cut

- **An instruction, step, output, condition or default** a consumer follows. That includes
  qualifiers: "only", "never", "unless", "at least", "before", "every". Dropping one changes the
  rule.
- **Negations.** "Do not X" shortened to "X" is the classic trim bug.
- **Bold load-bearing clauses** (CLAUDE.md, Code style): shorten around them, not through them.
- **Section headings and anchor phrases other files cite.** Grep for the heading text across
  `plugins/` before renaming or removing one, or a pointer elsewhere dangles.
- **Frontmatter `name`.** The `description` may be tightened, but it is what triggers the skill, so
  keep every trigger phrase, and keep it under the 1024-character cap (`[4]`/`[5]`).
- **Version citations** (`until v1.2.0`) and the reasoning a citation-audience rule requires.

## 4. How to work

- One file at a time, smallest overrun last (the big ones teach you the file's habits).
- Re-wrap edited paragraphs to ~100 columns (CLAUDE.md, Code style). Re-wrapping alone saves
  nothing, so do not count on it.
- After each file, run `git diff --word-diff <file>` and read every removed span. For each one,
  ask: "Did this span carry an instruction, condition or qualifier that is not still present?"
  If yes, put it back.
- Re-measure, then run the gate (`pwsh -NoProfile -File scripts/validate-local.ps1`, from the repo
  root). `[12]` must pass. A WARN that a budget sits above the ratchet for the new size is expected
  after a deep trim, and its suggested number is the next line value only when the budget is being
  lowered on purpose.

## 5. Ship it

- Version class: **PATCH**. A trim that needed a behaviour change is not this skill's work (see the
  goal above).
- The CHANGELOG entry lists the files trimmed and the budget lines changed. The Codex manifest
  mirror moves in the same commit (gate `[3]`).
- A delegate doing the trimming gets this file's path in its brief and reports the before/after
  byte count per file. Verify those numbers yourself with the measure command above, never from the
  report alone.
