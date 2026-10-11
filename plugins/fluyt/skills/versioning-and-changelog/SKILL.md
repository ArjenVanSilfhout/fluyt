---
name: versioning-and-changelog
description: >-
  The CHANGELOG-as-single-source-of-truth discipline and the MINOR-vs-PATCH version-bump rule. Use
  whenever you add a CHANGELOG entry, pick a version bump, write a version-stamped commit subject, or
  need to settle whether a change is MINOR or PATCH.
---

# Versioning & the CHANGELOG

`CHANGELOG.md` is the **single source of truth** for completed work AND version numbers. Never
duplicate versions or completion status anywhere else (see *What NEVER carries a version* below).
Read the consumer's **Project Facts** for `changelog` (the CHANGELOG path) and `version-rules` (the
project's own MINOR/PATCH definition); this skill is the shared shape. If either key is missing,
STOP and ask - don't guess the path or the rule.
**`changelog: none` (an unversioned repo) is a declared value, not a missing key: this skill does
not apply - no entry, no bump, and no version in the commit subject.**

## The CHANGELOG entry (newest first)

**Match the CHANGELOG's existing header and entry style exactly** (heading format, date style,
section grouping like Keep-a-Changelog's Added/Changed/Fixed) - never reformat history or fork the
format mid-file. The anatomy below is only for a *fresh* file with no entries to match.

Add a new entry at the TOP of the file, on the branch, so it rides in the work item's commit -
insert it **above** the existing top heading, never over it: a heading written over the previous one
reattributes that entry's whole body to the new version while every check still reads as satisfied.
After inserting, confirm the previous top heading survives below the new one (re-grep `^## \[`).

```text
## [X.Y.Z] — YYYY-MM-DD
**<Category> (<id or short tag>):** <bold one-line summary>

<A sentence or two of why.>
- <bullet only if a consumer needs it>
```

Then bump the `Current version:` line at the top of the file to the same `X.Y.Z`.

- **Date** is the **UTC** date (`date -u +%F`), not local - near midnight the two disagree, landing
  the entry on the wrong side of its own commit.
- **Category** is the change class the project uses (e.g. Feature / Fix / Tooling / Docs / Process).
- **Lean, for new entries: the diff says what, the entry says why.** Name the component or area
  changed; never list every file touched or restate the diff. Bullets only for what a consumer must
  act on (a behaviour change, a migration step, a breaking change).
- Close each entry with the project's completion convention if it has one (Project Facts `notes`
  may declare one - e.g. a test-count bullet for behaviour changes, or a "no product code changed"
  line for tooling/docs). Follow it; don't invent your own.

**An issue body or comment is NOT a primary source.** It is a filer's report or a triage assessment -
both secondary retellings. Before you write any **specific factual claim** into an entry, verify it
against the tree: a measured number, a quoted prior text, or an assertion about what a sibling file
or tool does. Where a claim's only source is the issue, either **attribute it** ("as recorded on
issue #N") or **narrow it** to what the repo's own record supports.

The claim is *usually* true, which lets it survive review; a false claim in the CHANGELOG is
corrected by nothing downstream.

**Before citing a rule, decision, or policy by name, confirm it resolves in the tree** - one grep.
When one item *applies* a policy and a different item *records* it, **the recording item lands
first**: an application that ships ahead of its record publishes a citation to something that does
not exist yet. The claim is true in intent and false in the tree, so verifying the claim itself does
not catch it. If it does not resolve while you are writing, either land the recording item first, or
describe the rule inline and cite the issue that will record it - never assert a home it does not
have. The entry is not finished until every named cross-reference is findable; once released, only
the project's amendment policy corrects it.

## The bump rule (MINOR vs PATCH while pre-1.0)

Use the consumer's `version-rules` from Project Facts. The **canonical shape** it follows:

- **MINOR** (`0.X.0`) - a change to **product behaviour**: a new capability, or a changed
  instruction/output the product's users follow.
- **PATCH** (`0.x.X`) - a change that alters **no** behaviour (a wording / formatting / typo fix),
  **OR any tooling / docs / process / CI change** even across many files.

**Tie-breaker:** when in doubt, ask *did the product's behaviour change?* No → PATCH, so scaffolding
churn does not inflate the version.

**What counts as "product" vs "tooling" is project-specific.** For an application the product is its
runtime, and its skills / agents / CI are tooling (PATCH). For a **plugin or library whose product IS
its shipped components**, those components are the product - a changed skill instruction or agent
behaviour is a *product-behaviour* change (MINOR). The consumer's `version-rules` declares which axis
applies, and if it defines the split differently, follow THAT - it wins over this canonical shape.

## Crossing 1.0 (MAJOR)

The MINOR/PATCH split above is the whole rule **while pre-1.0** (`0.y.z`): even a breaking change
ships as a MINOR. Once a project cuts **1.0** a third class turns on:

- **MAJOR** (`X.0.0`) - a **breaking / incompatible** change to the product's contract: a removed or
  renamed capability, or a changed instruction / output / format that existing consumers cannot adopt
  without changing their own setup.
- **MINOR** stays backward-compatible (a new capability, an additive change); **PATCH** stays a
  behaviour-neutral fix.

What counts as "breaking" is **project-specific** - the MINOR rule's axis, escalated to "consumers
must change to keep working" - and the consumer's `version-rules` may spell it out (for a
plugin/library whose product IS its shipped components: removing or renaming a shipped component, or
an incompatible change to a Project Facts key's contract). A project still at `0.y` can ignore this
section until it plans its 1.0.

## Version-stamped commit subjects

The completed-work version is stamped into the commit subject, using the consumer's
`commit-subject` format from Project Facts (canonical: `<type-or-id>: <summary> (vX.Y.Z)`). It MUST
match the CHANGELOG entry and the `Current version:` line - a mismatch is a release bug.

**A subject is at most 72 characters by default**, counting the version stamp and any suffix the
forge's squash merge appends (GitHub adds `(#<PR>)`); aim shorter. Write an imperative summary with
no trailing period. To fit, **trim the summary, never the version stamp**. A `commit-subject` in
Project Facts may declare a different cap, and it wins.

## What NEVER carries a version

- **Decision logs** record decisions (date · decision · why · reversibility), never version numbers
  or completion status. Those live only in the CHANGELOG.
- **Issue trackers** record work items and their state; completion is signalled by the issue
  closing (see `ship-work-item`), not by a version written into the issue.

## Releases don't bump

A release does not invent a version - it **tags what the integration branch already is**: the
`Current version:` line at release time. See the `release` skill.
