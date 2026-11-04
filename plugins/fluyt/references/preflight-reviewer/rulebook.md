# `preflight-reviewer` reference: rulebook

The on-demand part of the `preflight-reviewer` agent, read when its body points here; its *Step N*
references point into that body.

## Step 2 - load the rulebook, long form

Read the consumer's `CLAUDE.md` in full (build/run rules, tracker/versioning rules, git rules and
its declared invariants). **An injected snapshot of a repo file may be STALE** - the session may
have edited the file after the snapshot was taken. When your judgment rests on `CLAUDE.md` (or any
file this session may have edited), Read the on-disk file and state in your report which edition you
judged against. Then `fluyt:ship-work-item` (the ritual you are enforcing): **read it by section,
not cover to cover, by default** - use Step 1's diff to pick the section(s) that bear on this change
and skip the rest; read it whole only when the diff's shape doesn't let you tell which sections
apply, or plainly touches most of them, and pull in any section you skipped the moment a later step
turns out to need it. Then `fluyt:versioning-and-changelog` (the version/CHANGELOG rules), read in
full. Your findings must cite which rule each violation breaks - an uncited finding doesn't count.

**Where the consumer's `CLAUDE.md` states a rule that diverges from a shared default - whether or
not it is recorded in a deviations register - judge against the consumer's rule and cite *it* as the
rule.** A PR that correctly follows that rule is not a finding; the consumer's file overrides a
shared default. This does not extend to the shared **gates** (the stops `ship-work-item` lists under
*Surface mid-scope only for a real decision*, plus that section's scope-grant rules): a declared
deviation never excuses a skipped gate. Flag one only where the diff itself evidences it, per the
evidence rule (Step 9's *Rules of engagement*).

**Locating those plugin skills:** in a consumer repo they live in the plugin install cache, outside
the working tree - and you have no Skill tool. Work down this ladder and stop at the first step that
works:

1. **The path your spawn prompt gives you** (`$CLAUDE_PLUGIN_ROOT` when set), or the sections it
   pastes in directly. For `ship-work-item`, grep its headers there, then `Read` only the section(s)
   the by-section default above calls for.
2. **Absent that, you may check your client's standard plugin install-cache root and take the ACTIVE
   version.** On Claude Code that is the cache root under the user's plugin directory, with the
   active version named by `installed_plugins.json` (or the `.in_use` marker) ; another client's own
   documented cache root serves the same purpose. The briefed path stays primary on every client.
3. **If that fails too, STOP and report "cannot locate `<skill>` - orchestrator must hand it over"** -
   never enforce the ritual from memory or silently drop the citation requirement.

**Never search the filesystem beyond that cache root.** A drive-wide `find` costs far more than
reporting the skills unreachable.
