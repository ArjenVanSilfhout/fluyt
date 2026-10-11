---
name: triage-upstream
description: >-
  Maintainer-side: on demand, triage inbound consumer feedback on Fluyt. Finds open
  `from-consumer` issues that have no tier label yet, reads each, inspects the plugin component it
  targets, posts a triage plan as an issue comment, and applies a recommended tier + size label. Use
  whenever you want to work the upstream feedback backlog ("triage the upstream issues", "plan the
  consumer feedback"). Plans and comments only — it never changes plugin code or opens PRs; turning a
  triaged item into a change is the normal ship-work-item flow.
---

# Triage upstream — plan inbound consumer feedback

This is the **maintainer counterpart** to the shipped `report-upstream` skill. Consumers file bugs
and feature requests here (labelled `from-consumer`, with no tier); this skill turns each raw report
into a triaged, planned backlog item you can then deliver with `ship-work-item`.

It is **on demand** — a deliberate choice (no CI secret, no scheduled billed
runs). Run it whenever you want to work the inbound feedback backlog. It uses your existing `gh`
login — no token.

**Guardrail:** this skill *plans*. It reads, comments, and labels. It never edits plugin code, never
opens a PR, never closes an issue. Delivering a triaged item is a separate, deliberate step
(`fluyt:ship-work-item`).

## 1. Find the untriaged inbound issues

An inbound issue is **untriaged** when it has the `from-consumer` label but **no tier label**
(`must` / `should` / `could`). `report-upstream` deliberately leaves tiering to you, so "no tier" is
the reliable "needs triage" signal.

```sh
gh issue list --repo ArjenVanSilfhout/fluyt --label from-consumer --state open \
  --limit 1000 --json number,title,labels,body
```

Keep only those whose `labels` contain none of `must` / `should` / `could`. If there are none, say so
and stop.

## 2. Triage each one

For each untriaged issue, in order:

1. **Read the report AND its full comment thread** — never the body alone
   (`gh issue view <n> --repo ArjenVanSilfhout/fluyt --json title,labels,body,comments`). The body
   carries `From:` (consumer repo), `Component:`, and either an expected-vs-actual with repro (bug) or a
   problem / desired / why-shared (feature). **Comments are load-bearing:** a *second* consumer may have added
   fresh evidence or a competing/hybrid proposal, the maintainer may have recorded a decision, or the
   filer may have clarified — any of which can move the assessment, size, tier, or the open fork. If the
   issue **already carries a prior triage comment, this is a re-triage:** read what changed since and
   post an updated triage when a follow-up shifts the plan — don't leave a stale triage standing.
2. **Inspect the target component.** Open the file(s) it names and read enough to judge the change:
   - a skill → `plugins/fluyt/skills/<name>/SKILL.md`
   - an agent → `plugins/fluyt/agents/<name>.md`
   - the hook → `plugins/fluyt/hooks/hooks.json`
   - a template → `plugins/fluyt/skills/adopt-conventions/templates/<file>`
3. **Check lineage — before assessing.** Search closed AND open issues for the same component and
   adjacent vocabulary. Start cheap: a filer may cite the ancestor, so read the references already in the body first, then
   broaden with a search:

   ```sh
   gh issue list --repo ArjenVanSilfhout/fluyt --state all --search "<component / keyword>" \
     --limit 50 --json number,title,state,labels
   gh search issues --repo ArjenVanSilfhout/fluyt "<adjacent vocabulary>" --state all
   ```

   Classify every hit into exactly one of three relations — they are not interchangeable, and lumping
   them together as "related" loses the signal:
   - **duplicates / competes with** an open item — must be reconciled before either is worked, or two
     changes fight over one file. Apply the two-sided link (step 7) in addition to the prose.
   - **reverses / reopens** a closed decision — the dangerous one, because it reads like an ordinary
     feature request. It routes to the maintainer as `question` (step 7) and is **never** tiered
     silently — a prior decision possibly needing revisiting is not this skill's call to make.
   - **evolves / continues** a closed item — nothing is wrong; note it so the narrative stays legible.
     A component that keeps drawing "evolves" follow-ups is a signal the original shipped
     under-finished.

   No hit is a legitimate outcome too — record `Lineage: none found` rather than dropping the field.
4. **Assess**, and note:
   - **Valid?** Is the bug real, or the feature in scope for a *shared, project-agnostic* process
     asset (not a one-consumer need that belongs in that repo as a local skill)?
   - **Generic? Read the ask critically, not charitably.** The filer writes from inside one repo's
     habits: a request can carry zero literal project facts (so the forbidden-strings grep can't
     catch it) and still transcribe that consumer's local convention as the shared norm. Ask
     separately: is the *generic* version of this problem what the plugin should build, or is the
     proposal one consumer's design? Extract the project-agnostic need; where the proposal over-specifies
     (mandates a cadence, an order, a tool), gate it on Project Facts keys or soften it to a
     default-with-override — and note the generalization in the triage comment when the plan
     deviates from the requested design. Fluyt is a generic library, not the loudest
     consumer's mirror.
   - **Worth it? Validity is not the bar — cost is.** A report can be valid, generic, and
     invariant-clean and still not earn its place. Ask, per item: is the ask **already implied** by a rule the component ships
     (then the fix is at most a pointer, or nothing)? What does it **cost the file
     it lands in** — a shipped skill is read in full on every load, `ship-work-item` is long,
     so every added sentence competes with every existing one? Is there a **standing obligation**
     behind it, or only a habit? Is it **one session's observation** or a
     pattern — does it need a second sighting before it is a rule? Write the answer as one of three:
     **pick up** / **pick up, minimal diff** (state the sentence budget — the implementer is held to
     it) / **decline** (the reasoning goes in the comment; the filer keeps the paper trail). A decline
     is a recommendation, not an act: it routes to the maintainer as `question` (step 7) — this skill
     still closes nothing.
   - **Invariant check.** Would the fix need a project fact in a shared asset (breaks
     zero-project-facts), a `version` field (breaks track-main), or a `../` cross-reference between
     plugins? If so, that reshapes the plan — flag it.
   - **Files to touch**, a **rough size** (`size:S` / `M` / `L`), and any **open questions or design
     forks** that need a human decision.
5. **Post the triage plan as a comment** (write it to a temp file, then comment):

   ```sh
   gh issue comment <n> --repo ArjenVanSilfhout/fluyt --body-file <file>
   ```

   Use this shape:

   ```text
   ## Triage

   **Lineage:** <none found | duplicates #n | reverses #n | evolves #n> — <one line>
   **Assessment:** <valid bug | valid feature | needs-decision | out-of-scope> — <one line>
   **Worth it:** <pick up | pick up, minimal diff (<N> sentences) | decline — why> — <one line>
   **Approach:** <how you'd fix or build it>
   **Files:** <paths that would change>
   **Size:** <S | M | L>
   **Invariants:** <clear, or the concern>
   **Open questions:** <none, or the forks that need the maintainer's call>
   **Recommended tier:** <must | should | could> (applied)
   ```

   The `Lineage:` line carries the classification from step 3, plus its consequence:
   - **duplicates #n** — reconcile before either is worked; do not tier this one independently until
     that happens. Apply the two-sided link (step 7) in addition to this line.
   - **reverses #n** — do not apply a tier here; this goes to `question` instead (step 7), and the
     line states what closed decision it would reopen.
   - **evolves #n** — record the narrative in one line; tier normally.

6. **Append a triage trail to the issue body.** The comment thread is now the decision record — a
   later comment can retier, narrow scope, split part of the issue into a separate one, or record a
   maintainer decision — and the body alone gives no signal that this happened. Keep the body
   pointing at what a reader must read, and treat this as upkeep, not a one-time write:
   - **Build it from the real comment list, never from memory.** Read the thread first —
     `gh issue view <n> --repo ArjenVanSilfhout/fluyt --json comments` — and take each row's
     `createdAt` and `url` from that output. A trail written from recollection is the same defect it
     exists to fix: a confident account of a thread nobody re-read.
   - **Never touch the filer's original text.** Fetch the current body
     (`gh issue view <n> --repo ArjenVanSilfhout/fluyt --json body --jq .body`), append the
     trail to it in a temp file, and write the result back with
     `gh issue edit <n> --repo ArjenVanSilfhout/fluyt --body-file <file>` — never inline
     `--body "…"`, which quotes badly across shells.
   - **Delimit the trail clearly**, below a marker such as `<!-- triage trail — appended below; the
     report above is the filer's original, unedited -->`, so the filer's words stay intact and
     visually separate from what triage adds.
   - **Open with the count**, because that is the reader's actual question — "3 comments, and you
     need all 3." Someone deciding whether to open the thread needs the size of the ask before
     anything else in the trail.
   - **It is an index, not a summary** — one row per comment carrying its permalink, its date, and
     what that comment settled (retier / scope narrowed / split out / maintainer decision). Don't
     restate the decision itself: that would make the trail a second source of truth that drifts
     from the comments it points at. The index only needs to tell a reader which comments they must
     read, and that they must read them, before acting.
   - **Flag every comment a later one corrected** — "five of its claims are corrected in comment 3;
     do not read it standalone." This row carries most of the value. Without it a reader who stops
     partway comes away confidently wrong, which is the failure the trail exists to prevent — an
     index that lists a superseded comment as though it still stands is not merely incomplete, it
     actively misleads.
   - **State the precedence rule** — where comments conflict, the newest wins — so a reader who does
     open the thread knows how to resolve what they find there.
   - **State the current label state and any still-open fork**, so the trail can answer "is this
     workable?" without the reader opening the thread at all.
   - **Keep it current, not written once.** Every later comment that retiers, narrows scope, splits
     work out, or records a decision gets one more line appended to the trail — a stale trail is
     worse than none, because it reads as complete and is trusted as such.

7. **Apply the labels** (this also marks the issue *triaged*, so a later run skips it):

   ```sh
   gh issue edit <n> --repo ArjenVanSilfhout/fluyt --add-label "<tier>,size:<S|M|L>"
   ```

   - Keep the existing `bug` label if present (a bug jumps any tier — see the
     `fluyt:backlog` selection order).
   - If the item is **not actionable as-is** (needs a design decision, or is out of scope), or the
     *Worth it?* answer is **decline**, do **not** apply a tier — add `question` instead and put the
     decision you need in the comment, so it surfaces for the maintainer rather than silently entering the
     backlog. This is mandatory, not optional, for a `reverses` lineage hit: it is never tiered
     silently. A decline that the maintainer ratifies is closed by the maintainer (or by the next
     session on their word), never by this skill.
   - **If lineage found a duplicate**, this relation must be visible from *both* sides — prose in this
     issue's comment alone is one-sided. Add the two-sided GitHub reference and label:

     ```sh
     gh issue comment <n> --repo ArjenVanSilfhout/fluyt --body "Duplicates #<other>."
     gh issue comment <other> --repo ArjenVanSilfhout/fluyt --body "Duplicated by #<n>."
     gh issue edit <n> --repo ArjenVanSilfhout/fluyt --add-label duplicate
     ```

     Reconcile which issue stays open (transfer any unique contributions into it) before either is
     tiered into the workable backlog.

## 3. Report back

Summarise: how many issues you triaged, each with its number, recommended tier, and size; and call
out any you marked `question` (they need a decision before they can be tiered) — separately naming
the ones you recommended **declining** and why, so the maintainer rules on those first. Point out
obvious quick wins versus larger items.

## Turning a triaged item into a change

Triage stops at the plan. To deliver one, switch to the `fluyt:ship-work-item` flow: pick the
issue by the `fluyt:backlog` selection order (tier, `bug` jumps, smallest first), branch off
`dev`, implement, and PR — with the human in the loop for anything triage flagged as a decision.
