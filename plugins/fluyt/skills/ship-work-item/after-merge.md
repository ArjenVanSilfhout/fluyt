# §4 *After the merge lands*

The on-demand part of the `ship-work-item` skill, read when its `SKILL.md` points here;
its `§N` and *Section* references point into that `SKILL.md`.

1. **Verify the issue closed** (`gh issue view <n> --json state`). If it's still open ~1 min later -
   which is expected when `integration-branch != default-branch`, and possible even when they
   match - **close it manually:** `gh issue close <n> --comment "merged in #<pr>"`. **"After the
   merge lands" means after YOU read `MERGED` off `gh pr view <n> --json state`** - the same
   observed-state gate the branch deletion in step 6 already applies. A watcher's or the post-arm
   wait's clean exit, a timeout, or a green CI run is not that observation, and a manual close
   issued on one of those closes an unmerged item.
2. **Unblock the dependents.** A blocker closing leaves its dependents carrying a `blocked` label
   that `backlog` skips unconditionally and nothing removes - **permanently unpickable**. Clear it
   here, on the same bounded-walk terms the contradicted-sibling write-back below states: the walk
   is `gh issue list --state open --label blocked` - bounded to the label, **never a full-backlog
   sweep**. For each hit, read its blockers off the relation with `gh issue view <m> --json
   blockedBy,url`: each node carries that blocker's `number`, `state` and `url`, so three counts
   decide it - `--jq '.blockedBy.nodes | length'` (total), `--jq '[.blockedBy.nodes[] |
   select(.state == "OPEN")] | length'` (still open) and `--jq '.url as $u | ($u | sub("[0-9]+$";
   "")) as $r | [.blockedBy.nodes[] | select(.url | startswith($r) | not)] | length'` (foreign - a
   blocker in another repo; the node has no repository field, only its `url`). **Remove the label
   only when the relation list is NON-EMPTY and every blocker is closed** (`total > 0` and `open
   == 0`) - `gh issue edit <m> --remove-label blocked` - since an item with two blockers, one of
   them still open, must stay skipped. **A foreign blocker closing means the fix merged upstream,
   not that your pin carries it:** it counts as satisfied only when `foreign < total` (a same-repo
   blocker - the pin-bump issue - is also on the list and closed); otherwise surface "#<m>'s
   blocker <repo>#<n> closed upstream - record the pin-bump issue as a relation, or clear the
   label once your pin carries it" and move on. The total-count half is load-bearing and invisible
   in the jq: **zero** relations give an empty list whose open-count is 0, which passes an
   all-closed test **vacuously**, and label-without-relations is a real state (blocked on external
   evidence, a decision, an upstream release) - without the gate this step frees exactly the items
   whose blocker cannot close. On `total == 0`, don't silently hold either - **surface it**:
   report "#<m> carries `blocked` with no blocked-by relations - record the blocker as a relation,
   or clear the label by hand", and move on. (A non-issue block belongs in `not-ready-labels` per
   `backlog`, but this step must stay correct for the state as found.) **Leave the native relation
   alone:** it is the record of why the item was ever blocked, and only the label is the
   operational signal - a relation still reading "blocked by (closed)" is correct history, not
   staleness.
3. **If the item was a slice of a `tracking` epic, tick its box now that the issue is
   closed** - fetch the epic body (`gh issue view <epic> --json body`) → flip its `- [ ] #<n>`
   line to `- [x] #<n>` → write it back (`gh issue edit <epic> --body-file <file>`). This
   is roadmap upkeep, not a tracker edit - see the `backlog` skill.
4. **When this item's landed decision contradicts a sibling issue's stated approach, write it back -
   don't leave the rot for that sibling's own next pick to re-derive.** §0.1's pick-time
   re-validation catches the rot only when the sibling is next picked; this merge-time step does
   not replace that backstop. **Bound the walk to the relation graph
   already on record - never a full-backlog sweep:** (a) if this item was a slice of a `tracking`
   epic, its sibling boxes (step 3, above); (b) any issue this item's `Lineage:` / `Depends on:`
   records name, wherever they were written - the issue body, a triage comment, a decision comment
   (the `backlog` skill's lineage relations). For each sibling this item's decision actually
   contradicts, `gh issue comment <sibling> --body-file <file>` naming the landed decision and
   what it contradicts - the returned comment URL is the record, per §2's artifact-citation rule,
   not the act of commenting. **No epic and no lineage records ⇒ nothing to walk, and the step is
   a no-op** - say so rather than falling back to a scan.
5. **Capture any friction before moving on - before checkout/pull/delete-branch/pick-next
   below, not after.** If this item snagged - a CI catch that passed the local gate, rework, a
   denied or blocked command, a transient platform error, or something instructive in a
   delegate's **report** that you never acted on - append a one-line note (what snagged + where)
   to `docs/process/retro-log.local.md` so the next retrospective has real evidence. **The
   report half matters because a report is read once and leaves the context**: anything
   instructive in it that is neither implemented nor written down here is gone by the next item.
   The file holds friction notes only (the `SubagentStop` hook's dispatch cadence goes to
   `docs/process/dispatch.local.md`). Create the file and its `docs/process/` directory first if
   absent (`mkdir -p docs/process`) - nothing else creates it. It's git-ignored.
6. `git checkout <integration-branch> && git pull`, then **delete the branch only once `gh pr view
   <n> --json state` returns `MERGED`** - the observed state, read now, not "after the merge step"
   and not "once CI was green"; that check **gates** the deletion. Fire-and-forget auto-merge
   (§4) opens a window where the PR is armed but still open, and **deleting the head branch of
   an open PR closes that PR unmerged** - the issue stays open and the version never lands. This
   applies to the local *and* remote ref. **Read `MERGED` in one tool call and delete in the
   next:** a `PreToolUse` guard (the shipped open-PR branch-delete guard among them) judges the
   WHOLE command before any of it runs, so a combined wait-then-delete call is refused while the
   PR is still open. Recovery, since the commit outlives the ref: `git cat-file -t <sha>` to
   confirm the object survives → re-create the branch at that SHA → push → `gh pr reopen <n>` -
   the closing keyword in the PR body survives intact. For a solo isolated item
   (`worktree-isolation: default`, one spawn), the lane branch the developer committed on is a
   *different* branch from the PR head above - `parallel-work.md` step 5's cherry-pick lands its
   commits onto a fresh branch that becomes the PR head - so delete that lane branch too, at this
   same observed-`MERGED` gate. Then pick the next item.
