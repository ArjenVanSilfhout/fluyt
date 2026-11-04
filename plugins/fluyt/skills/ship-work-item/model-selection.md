# Model selection for sub-agents

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here.

**This section is the CANONICAL home for spawn model-tier policy, on every client** - a client
adapter (Codex's `dispatch-role`) projects these tiers onto its own model selectors and cites this
section rather than standing as a second home for the policy itself.

Match the model to the **weight of the sub-task**, not to a blanket heavy default .

- **The team agents carry a default `model:` in their frontmatter**, so most spawns are already
  right: **`sonnet`** for make-and-verify (`developer`, `test-writer`, `preflight-reviewer`),
  **`opus`** for deep analysis / design / review judgment (`product-owner`, `scrum-master`,
  `tech-debt-reviewer`). The orchestrator keeps its own session model - this governs what it
  *spawns*.
- **A frontmatter default is a floor, not a ceiling - override per spawn for an off-norm instance.**
  Pass the Agent tool's `model` option (or `agent(…, {model})` in a Workflow) when one spawn is
  heavier or lighter than the agent's norm: escalate a `developer` handed a genuinely intricate
  algorithm to `opus`; a trivial one is already fine on `sonnet`. Override at the call site - don't
  edit the shared frontmatter for a one-off.
- **Per-issue routing labels (only when Project Facts `agent-routing: labels`).** When the project
  records routing on the issue, read its `model:<tier>` label (e.g. `model:opus`) and spawn the
  implementer at that tier - it **overrides** the frontmatter default above; no `model:*` label ⇒
  the default stands. The companion `agent:<type>` label is **advisory only** - a routing/filter
  marker, not a dispatcher; you still decide which agent implements (a `developer` for product code,
  `test-writer` for tests, per the ritual). Absent the key (`agent-routing: none`, the default) →
  ignore both families.
- **Ad-hoc search / recon spawns take a fast tier explicitly.** An `Explore` or `general-purpose`
  agent spawned just to grep-and-locate, map naming conventions, or read a few files is **not** a
  team agent and carries no default - pass `haiku` (or `sonnet` for a broad sweep). Searching code
  is never a heavy-model task.
- **Heavy tier: `opus` is the portable default; `fable` is the upgrade where a project provisions
  it.** These defaults name `opus` because every consumer has it. A project with Fable access can
  send its heaviest analysis/design spawns to `fable` - the tier built for complex reasoning - with
  the same per-spawn `model` override.
