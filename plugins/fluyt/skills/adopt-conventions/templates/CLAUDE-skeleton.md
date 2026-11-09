<!-- CLAUDE.md skeleton - merge into an existing CLAUDE.md, don't overwrite. The short routing
     paragraph below is load-bearing: it sends every session to the plugin before work starts; each
     skill then loads from its own description in the skill listing. -->

# <Project name> - working agreement

<One or two lines: what this project is, the stack, and the single most important thing to know.>

## Agentic process (fluyt plugin)

This repo uses the **fluyt** plugin for its delivery process. **Consult the matching skill before
working in its area**, not memory. Start or resume a session with `/fluyt:orchestrator`; it routes
the ritual chain. Each skill loads from its description: `orchestrator`, `hub`, `ship-work-item`,
`backlog`, `release`, `versioning-and-changelog`, `scrum`, `report-upstream`, `adopt-conventions`,
`branch-protection`, `install-refresh-plugin`, `agent-liveness`, `handover`, `hook-authoring`,
`dispatch-role`, `forge-azure-devops`. In Codex, swap `/` for `$`.

Team roles load as `fluyt:<role>` subagents in Claude Code and through `$fluyt:dispatch-role` in
Codex. Every role's report ends with a **"Skills consulted"** line naming what it read; a missing
line is worth questioning ("none" is legitimate only for a trivial mechanical task).

Notation in fluyt skills and agent files: `⇒` = implies (what follows, or what a system does); `→` =
then (the next step, or the action you take).

**Project-specific skills** (if any) stay in this repo under the active client's local skill path
(`.claude/skills/` and/or `.agents/skills/`) - the shared plugin covers PROCESS; stack/domain
knowledge stays local. List them here so the developer role routes to them: <e.g. codebase-map,
add-thing, area skills - or "none yet">.

## Project Facts

<Paste the filled-in Project Facts block here - see CLAUDE-project-facts.md. The shared skills read
these keys by name; a missing key makes a skill stop and ask. Optionally keep only the inline core
here and put the other keys in the file `facts-file` names; the contract states the core and the
lookup.>

## Deliberate deviations from the shared playbook

Precedence - what this file may override and what it may not - is `ship-work-item`, *Precedence*: a
shared **default** bends to this file; a shared **gate** never does, and an entry that narrows one is
not a deviation (honour the gate, surface the conflict, raise it upstream via
`/fluyt:report-upstream`).

Record each deliberate divergence below **with its reason**, so an agent that meets the contradiction
can resolve it instead of guessing, and a future maintainer can re-evaluate it rather than deleting it
as noise. Where a Project Facts key already governs the choice on its own documented trigger, set the
key instead of writing prose here. If you keep an equivalent register under a heading of your own, keep
it there - don't duplicate.

<Each entry: the shared default you diverge from, what this project does instead, and why. An
explicitly empty register is a valid answer - write "none" rather than inventing divergence.>

## Invariants (project-specific - the shared plugin does NOT carry these)

<The architecture rules the code must keep true - preflight-reviewer, tech-debt-reviewer, developer,
test-writer and product-owner ALL work from "whatever the CLAUDE.md declares", so an empty block means
five components enforce nothing. List them here (`none` is a legitimate answer). E.g. layering rules,
single-source-of-truth objects, determinism contracts, public-API/compatibility surfaces,
data-handling rules - whichever apply.>

## Code style

<Golden rule: only document what is NOT directly clear from the code - the default is no comment, and
the intended effect is less in-code documentation. A comment or doc comment must carry something the
signature and body cannot say; never restate what the code plainly does. The allowance that survives
the rule: documenting what an agent needs to understand on top of the code as built is legitimate - a
constraint, a contract or invariant, a cross-system seam, a trap, a non-obvious consequence, the why.
That knowledge is what comments are for. The audience is the agent working the code, never a generic
end-user reader: no API-reference prose, no boilerplate summaries that merely rephrase a signature.
The rule applies forward and boy-scout-style: trim a self-evident comment while already touching its
file; historical heavy density is history, not a target - no mass strip unless the maintainer asks
for one. **The boy-scout rule only fires for agents when stated as named clauses that narrow what to
NOTICE in a touched file - never what may be touched** (that scope bound is what keeps sprawl
impossible); stated as a bare aspiration ("leave it better than you found it") it lies dormant while named riders on other rules keep firing. Adapt clauses like these: **exclusivity-word check** - a comment near your diff stating a
checkable fact ("only", "never", "all", "nothing does X", a status claim - the highest-rot class)
gets verified before you move on; **line anchors die on touch** - a comment citing a file:line number
loses the number the moment its file is touched, so cite the symbol instead; **TODO reconciliation on
touch** - before working near a TODO, check whether it already shipped, then annotate or delete per
the golden rule above; **stamp refresh on skill edits** - an item editing a local skill file
refreshes any verified-at-version stamp the project keeps in it. A project whose consumers genuinely
read IDE/API reference may choose the dense/reference-style option instead - see the interview's
two-option framing for the trade-off.>

## Ask the human when

<ADAPT this default gate list to your project and drop the brackets - never replace it with `none`.
This is a shipped default, not an empty prompt: the autonomy rule below keys off it, so blanking it
empties the gate. Irreversible design forks, an unsourced design or tuned-value decision - sourced
meaning a written record of the human's decision states the value actually used - any
destructive or irreversible operation on data or history (deletions, data migrations,
schema/format rewrites, force-pushes, mass regeneration), work only possible in an external tool
or console - file as a `question` issue and/or ask in-session; log durable outcomes in the decisions file.>

**Otherwise, keep working.** When none of the above applies, an authorized scope of work - "work the
backlog", a named tier, "do these N" - is a standing mandate to proceed item-to-item; agents do
**not** re-confirm between backlog items. Guardrails: a scope never widens (one tier does not roll
into the next; a named set does not grow into the backlog), "keep going" resumes the scope already in
flight rather than opening a wider one, and a grant is live only for the continuous stretch it opened -
re-confirm after a context reset, an intervening instruction, or a long gap. Landing items to the
integration branch is in-scope; **cutting a release is not** - that keeps its own confirm step
(`/fluyt:release`), as does filing upstream (`/fluyt:report-upstream`). Full doctrine:
`/fluyt:ship-work-item`.
