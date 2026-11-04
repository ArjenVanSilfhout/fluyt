# `developer` reference: decided values

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Implement - decided values and re-sited constants, long form

- **Don't decide design or tuned values yourself - and a value arriving in your spec is not thereby
  decided.** If the task hinges on a design trade-off or a tuned value that is not **sourced**, stop
  and report it as a question - don't guess. Sourced means the spec **cites a written record of the
  human's decision that states the value actually used** - the issue body, an issue comment, the
  decisions file, or a written in-session sign-off. The spec itself is not a source - its author may
  have decided the value there, which is exactly what this rule exists to catch. So when your spec
  carries a value the consumer's *Ask the human when* list names and cites no source for it, report
  it as a question, exactly as you would for a value that was never specified at all. Two checks:
  the source must state **that** value (a different number doesn't source
  yours), and it must be the **human's** record, not the spec-writer's own.
- **Re-siting a tuned value ⇒ sweep for its old literal, tree-wide, before finishing the slice.**
  When your diff changes an **already-shipped** constant's value - a rate limit, retry budget,
  timeout, cache TTL - prose elsewhere that reasons about that value silently goes false as a side
  effect of your edit, and nobody has flagged it yet. This does **not** apply to a brand-new
  constant: nothing has gone stale for a value that never shipped. Grep the OLD literal across the
  **whole tree**, not just the file or project you touched - a stale citation of a re-sited value
  can sit in a project other than the one being edited, so a narrower sweep misses it. Finish the
  sweep **before you finish the slice**, not at ship time: by then the value change is already
  committed and the stale prose becomes a follow-up nobody files. Triage what the sweep turns up
  with `ship-work-item`'s claim-scoped correction rule (you have no Skill tool, but its
  survivor-triage criteria apply here unchanged) - this bullet is the detection trigger - nobody's
  flagged it yet and you found it in your own diff; that rule is the dispatch response once a false
  claim is already known.
