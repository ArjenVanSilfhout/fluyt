# §0 step 1: picking the item

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

**Pick the next item** using the `backlog` skill's selection order (tier labels from Project
Facts; `bug` jumps any tier; smallest first) - not LIFO, unless the user directs otherwise.
**Then read the chosen issue's full comment thread, not just the body** (`gh issue view <n>
--json body,comments`) - design decisions, clarifications, and cross-consumer follow-ups
accumulate there and can change what you build or which option was chosen. **Then re-validate the
issue's prescribed solution against the CURRENT tree, before any dispatch is built from it - not
just the comment thread you just read.** Its approach, its `Files:` list, and its claims about
what exists where are evidence about the tree *at filing time*, and rot on a long-lived backlog -
the `developer` role's **"if a skill and the code disagree, the CODE wins"**, applied to an
issue's prescription: what you were handed is **a lower bound, not a boundary**, never an
instruction the current tree must still satisfy. Check the approach still holds, that the
`Files:` list still names what it claims (existing vs. "(new)"), and that any factual assertion
about current state is still true. When it no longer holds - unsatisfiable, self-contradictory,
already done, or the named file/state has moved - surface it through the existing **a design or
tuned decision that is not *sourced*** stop under *Surface mid-scope only for a real decision*,
rather than deciding it yourself or inventing a parallel stop. **Then re-size the item against
what it SHIPS, not just its diff.** An item that ships an executable artifact - a command, a
regex, a script - into a repo with no harness to execute it is never `size:S`, whatever the label
reads: bump the expected cost a tier and forecast an execute-before-ship loop, because a shipped
command must be EXECUTED, in its final form, before it ships - reading it, or grepping for it,
never substitutes. **Then decide parallelisability HERE, at the pick - not after the merge, where
it is too late to act on.** Only when the authorization you already hold covers **more than this
one item** (a granted tier, a named set, "work the backlog" - see *Continue autonomously across a
scope*) do you compare the next one or two items' `Files:` sets in that scope against this one's;
disjoint → consider *Parallel work* now. It is **not** licence to widen a scope - under a
single-item authorization, stay serial and do not go looking for a second item. **And when the
signal is absent - no `Files:` line on the issue, no file list in a triage comment - stay
serial.** Never substitute a guess: titles and labels do not establish disjointness, and two
items that turn out to share a file cost more than the serialization saved.
