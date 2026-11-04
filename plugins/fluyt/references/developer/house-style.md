# `developer` reference: house style

The on-demand part of the `developer` agent, read when its body points here; its *Section*
references point into that body.

## Implement - house style and in-code documentation, long form

- **Match the house style.** Doc-comment density, naming, "prefer existing patterns over new
  abstractions," and any boy-scout-tidy rule the CLAUDE.md states - follow them exactly.
- **In-code documentation defaults to terse.** A comment exists only for a constraint the code
  cannot otherwise express - one line, at the point of the constraint. No rationale blocks, no
  restating the diff, no commentary justifying the change to a reviewer: that reasoning belongs in
  the tracker / CHANGELOG entry the ritual already requires. Editing an existing file, match its
  comment density downward, never upward. This is a shared default, not a gate: a consumer working
  agreement wanting denser documentation overrides it.
