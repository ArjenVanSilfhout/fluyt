<!-- CLAUDE.md skeleton - merge into an existing CLAUDE.md, don't overwrite. The routing
     paragraph below is load-bearing: the plugin's own prose is NOT auto-loaded, so these pointers must
     live HERE, in the consumer's CLAUDE.md, to make the shared skills trigger. -->

# <Project name> - working agreement

<One or two lines: what this project is, the stack, and the single most important thing to know.>

## Agentic process (fluyt plugin)

This repo uses the **fluyt** plugin for its delivery process. The shared playbooks live in the
plugin; this file stays the compact, client-neutral contract + the routing that points at them.
**Consult the matching skill before working in its area** instead of working from memory. Claude Code
invokes namespaced skills as `/fluyt:<name>`; Codex uses `$fluyt:<name>` (or triggers
from its description). Below, swap `/` for `$` when working in Codex:

- **Starting a working session, or resuming after a context reset** - "run the project", "work the
  backlog", "drive the work", "you are the orchestrator" - the session posture and the ritual chain
  it routes to: `/fluyt:orchestrator`
- **Running ONE cross-project hub session** that coordinates several project sessions (each still the
  orchestrator of its own repo) - the hub repo, the message protocol, relaying decisions, and the
  authority boundary: `/fluyt:hub`
- **Delivering a work item** (branch → PR → merge, version bump, close the issue):
  `/fluyt:ship-work-item`
- **Picking / filing / re-tiering backlog issues**: `/fluyt:backlog`
- **Cutting a release** (integration → release branch): `/fluyt:release`
- **Version + CHANGELOG discipline**: `/fluyt:versioning-and-changelog`
- **Retrospective on the agent team + workflow**: `/fluyt:scrum`
- **Found a bug in / want a feature for the shared plugin itself**: `/fluyt:report-upstream`
- **Starting a brand-new project from scratch** (interview the shape, offer to create the repo and
  branches, then onboard it): `/fluyt:adopt-conventions` (from-scratch mode)
- **After updating the fluyt plugin - re-sync conventions** (pull in new Project Facts keys +
  changed shipped guidance): `/fluyt:adopt-conventions` (re-sync mode)
- **Protecting a branch** (a ruleset or classic protection on the integration or release branch,
  required status checks, which merge methods a branch allows) - or auditing the CI triggers that go
  with it: `/fluyt:branch-protection`
- **Plugin won't load / update on an embedded client, or checking which version is loaded**:
  `/fluyt:install-refresh-plugin`
- **About to dispatch a sub-agent** (detached or blocking? watch it or collect it?), **or a background
  one has gone quiet** - is it working, dead, or already handed back? Resume it or re-dispatch?:
  `/fluyt:agent-liveness`
- **Ending a session, or a context reset is coming** (an auto-compaction threshold, a manual reset, a
  long pause, handing off to another person or agent) - write a hand-over a successor can act on
  without reconstructing state from the transcript: `/fluyt:handover`. On resuming after one,
  read it before acting on anything a prior turn appears to have told you.
- **About to write or change a Claude Code hook** (a `hooks.json` entry, or any event hook that
  writes a file, stamps a time, or resolves a path) - read the authoring discipline BEFORE authoring,
  not once at onboarding: `/fluyt:hook-authoring`
- **Dispatching a canonical specialist role from Codex**: `/fluyt:dispatch-role`
- **The repo lives on Azure DevOps** (Project Facts `forge: azure-devops`) and a ritual step names
  GitHub or `gh` - translate that step, not the ritual: `/fluyt:forge-azure-devops`

Claude Code loads the team subagents directly as `fluyt:developer`,
`fluyt:product-owner`, `fluyt:preflight-reviewer`,
`fluyt:tech-debt-reviewer`, `fluyt:test-writer`, and `fluyt:scrum-master`.
Codex dispatches the same canonical role files through `$fluyt:dispatch-role`. Every role's
substantive report ends with a **"Skills consulted"** line naming what it read; a missing line is
worth questioning ("none" is legitimate only for a trivial mechanical task).

Notation in fluyt skills and agent files: `⇒` = implies (what follows, or what a system does); `→` =
then (the next step, or the action you take).

**Project-specific skills** (if any) stay in this repo under the active client's local skill path
(`.claude/skills/` and/or `.agents/skills/`) - the shared plugin covers PROCESS; stack/domain
knowledge stays local. List them here so the developer role routes to them: <e.g. codebase-map,
add-thing, area skills - or "none yet">.

## Project Facts

<Paste the filled-in Project Facts block here - see CLAUDE-project-facts.md. The shared skills read
these keys by name; a missing key makes a skill stop and ask.>

## Deliberate deviations from the shared playbook

This file **overrides a shared `fluyt` default** - the plugin's skills are the default, not the
authority. It does **not** override a shared **gate**: the stops `ship-work-item` lists under *Surface
mid-scope only for a real decision*, together with the scope-grant guardrails restated under **Ask the
human when** below. Those are what keep an agent from
deciding alone what only the human can decide. **An entry that narrows a gate is not a deviation and
does not belong here** - an agent that meets one honours the gate, surfaces the conflict, and does not
act on the entry. If a project genuinely needs a gate relaxed, raise it upstream via
`/fluyt:report-upstream`.

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
