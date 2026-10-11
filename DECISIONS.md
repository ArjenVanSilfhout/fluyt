# Decision log

Short entries, newest first. Format: date · decision · why · reversibility.

---

**2026-10-11 · Release notes are a written summary, never pasted CHANGELOG sections · reversible.**
The user's call in the session chat: the v1.0.0 "Maiden Voyage" notes are concise and clear, while
the v1.3.1 and v1.6.0 notes "just show the changelog for each version". Notes now summarise
everything since the previous release, grouped by area, and point to the CHANGELOG for detail.
`scripts/publish-release.ps1` takes the summary as `-NotesFile` and has no CHANGELOG fallback, so a
verbose paste cannot slip back in. The v1.3.1 and v1.6.0 notes were rewritten by hand the same day.

**2026-10-11 · Budgets cut 5%, trims land 2% under, prose em dashes leave `plugins/` · reversible.**
The user's call in the session chat: "reduce all budgets by 5%", then "Cut and trim"; a 2% target
under each new budget so a later improvement fits "without having to debate budget"; em dashes
swapped in `plugins/` only ("plugins/ only"), arrows kept. Em dashes inside code spans and fenced
blocks stay: they are literal formats a consumer writes or a re-sync matches (the CHANGELOG heading,
the `<pending — …>` placeholder). The ratchet formula itself is unchanged; this was a one-off cut.
Not taken: cutting only the budgets that already fit; a byte-floor margin instead of 2%.

**2026-10-11 · Correction: the installed payload carries no CHANGELOG; a version citation resolves
through the payload manifest and the public CHANGELOG · reversible.**
The citation entry below says "the CHANGELOG ships". The payload consumers install holds the two
manifests, skills, agents, hooks, README and LICENSE only; the 1.1.0 CHANGELOG entry recorded that
and redirected the three plugin-version reads to `.codex-plugin/plugin.json`. A version still
resolves for a consumer: the manifest `version` names the installed release, and the public
CHANGELOG explains it. The rule stands; its rationale is corrected in CLAUDE.md (Invariants).

**2026-10-11 · The three Project Facts marked `provenance: chosen` are ratified by the user ·
reversible.**
The nautical-codename release titles, the git-ignored hand-over at `docs/process/HANDOVER.local.md`,
and the `<type-or-id>: <summary> (vX.Y.Z)` commit subject: the user's call ("Keep all three"),
relayed by the hub. The markers in CLAUDE.md stay `chosen` until the user confirms that edit in the
session chat; when flipped they read `ratified @v<the installed payload's .codex-plugin/plugin.json
version at that moment>`. `agent-routing` was not part of the call and stays `chosen`.

**2026-10-11 · The consumer `.gitignore` fragment no longer ignores `.mcp.json` · reversible.**
On Claude Code a root `.mcp.json` is the project-scoped, shareable MCP configuration; ignoring it hid
a new consumer setup from teammates and CI, since a plain `git add` skips an ignored file. The
fragment keeps a comment that secrets never go into a committed one (environment-variable expansion,
or a plugin's `userConfig` with `sensitive: true`). Not taken: keep ignoring it and document the
trade-off; a Project Facts key letting each consumer choose. The user's call (option 1), relayed by
the hub, recorded on issue #4. This repo's own gate check [13] still forbids tracking one here.

**2026-10-11 · One marketplace repo holds one plugin, shipped to Claude Code and Codex from a single
payload · irreversible once consumers install — splitting the plugin changes every install.**
Both clients install from this repo, each with its own manifest and marketplace file pointing at the
same `plugins/fluyt/` directory. Skills, agent roles and the hook live once, at plugin root; the
manifests carry only metadata. Why: two payloads would drift, and the process is the product, so it
must read the same on both clients.

**2026-10-11 · The plugin name `fluyt` is permanent · irreversible once published.**
The plugin ID is recorded in every consumer's settings (`fluyt@fluyt`), their caches and their
enablement records, so a rename orphans installs. It is treated as fixed from 1.0.0. If a rename were
ever forced, a renames map would be published with it.

**2026-10-11 · The Claude manifest carries no `version` field (track-main) · reversible, but a
mistaken version silently blocks consumer auto-updates.**
Consumers pin the `main` branch tip through the marketplace `ref`. A stale explicit version in
`.claude-plugin/plugin.json` makes the client believe it is up to date. The validator's "No version
specified" warning is therefore expected, and is the one warning CI tolerates (see the
strict-validation entry below). Do not add a version field to quiet it.

**2026-10-11 · The Codex manifest carries a strict-semver `version` that mirrors the CHANGELOG ·
reversible.**
Codex requires one. It moves in the SAME edit as `CHANGELOG.md`'s `Current version:`, and the local
gate fails on drift (check `[3]`, with `[8]` checking the CHANGELOG's own consistency). A version
bump that touches only one of the two is the failure this prevents.

**2026-10-11 · `dev` is the integration and default branch; `main` is the release branch ·
reversible.**
Consumers pin `main` through the marketplace `ref`, so `dev` being the default branch does not
expose it to them. Making `dev` the default means `Closes #N` in a work-item PR closes its issue on
merge. Risky work goes through `dev` plus a PR; `main` moves only by release promotion. Flipping the
default branch is a design fork that needs the maintainer.

**2026-10-11 · Zero project facts under `plugins/`; gate check `[7]` enforces it by shape ·
reversible.**
Shared assets reference a consumer's Project Facts by key name and stop to ask when a key is
missing. Check `[7]` flags anything that looks like a project fact (slug-shaped identifiers, framework
and build-tool names, absolute paths) and subtracts `scripts/plugin-vocabulary-allowlist.txt`, the
plugin's own vocabulary. The allowlist is maintained when the plugin's vocabulary changes, never
when a consumer adopts: a forgotten entry is a false red, which is the safe direction. Identifying
terms are kept out of the repo entirely; the optional
`scripts/hooks/pre-push` blocks a push containing any term from a denylist file kept outside the
tree, so publishing the hook never publishes the terms. There is no CI scan for them.

**2026-10-11 · A citation in a shipped asset must resolve for whoever receives it · reversible.**
A consumer gets the plugin payload and their own repo, not this tracker or this file. So a bare issue
number or a "see DECISIONS.md" pointer inside `plugins/` dangles for its actual reader. Cite a
version (the CHANGELOG ships) or state the reasoning without the pointer. Illustrative placeholders
such as `- [ ] #18` in a template are exempt. Repo-side files may cite DECISIONS dates freely.

**2026-10-11 · `CHANGELOG.md` is the single source of truth for completed work and version numbers;
MINOR versus PATCH follows behaviour, not file count · reversible.**
Every component change updates the CHANGELOG and bumps `Current version:`. MINOR means a shipped
skill, agent, hook or template gained or changed an instruction, step or output a consumer follows;
PATCH is wording, scripts, CI, docs and housekeeping, even across many files; MAJOR is a breaking
change to a consumer's setup. The test is whether what a consumer loads and follows changed. This
repo's product is its process assets, so it mirrors the axis the shipped `versioning-and-changelog`
skill teaches.

**2026-10-11 · Component byte budgets are a ratchet, check `[12]` · reversible.**
Every lane that loads a skill or role file pays for all of it on every load, and nothing else
prevents regrowth. `scripts/component-size-budget.txt` gives each Markdown file directly in a skill
directory (and each agent file) a budget of its measured size times 1.05, rounded up to the next
100 bytes, counted without CR bytes so Windows and Linux agree. Growth past it fails the gate; the
fix is to trim or, deliberately, to raise the budget in the same change. It is a ratchet against
silent growth, not a target to shrink to.

**2026-10-11 · Release mechanics: merge-commit promotion, tags, GitHub Releases, nautical codenames,
release-version milestones · reversible.**
`dev` is promoted to `main` by a merge commit, never a squash, so per-item history survives. Each
release is tagged `vX.Y.Z` and published as a GitHub Release whose notes are the CHANGELOG sections
new in that release, titled `vX.Y.Z "Name"` with a nautical codename that is not reused. Each
release also stamps a `vX.Y.Z` milestone holding the issues it shipped. Planning milestones stay
off: work is picked by tier. Consumers pin the branch tip; the tag is a human-facing marker, not the
pin. A session that cannot push tags hands off to `scripts/publish-release.ps1`.

**2026-10-11 · Hand-overs are git-ignored by default · reversible.**
A session hand-over is working state, not history. The `handover` Project Facts key points at a
`*.local.md` path, covered by the `docs/process/*.local.md` ignore glob, and gate check `[13]` fails
if any such file is ever tracked. A consumer that wants a tracked hand-over (for example a hub
repo, where state must survive a fresh clone) opts in by naming a tracked path.

**2026-10-11 · Per-plugin and marketplace `claude plugin validate` both run `--strict`, tolerating
only the version-unspecified warning and the Advice block · reversible.**
Because the Claude manifest is deliberately versionless, `--strict` would promote its one expected
warning to an error. CI instead tolerates exactly that warning (and the verdict-neutral Advice
block), so any other warning or any error still fails the build. Dropping `--strict` outright would
stop catching other manifest-level warnings. The validator checks manifests only, never skill or
agent frontmatter, so the local gate's own checks stay necessary.

**2026-10-11 · Locked-down GitHub Actions · reversible.**
The workflow sets `permissions: {}` at the top, so the token starts with no scopes and each job opts
in to exactly what it needs. Only `pull_request` triggers it (never `pull_request_target`), so a
fork PR runs with a read-only token and no secrets. A gitleaks scan of the full history runs in CI,
installed from a checksum-verified release tarball rather than a third-party action. Gate check
`[15]` fails if the workflow drifts from this posture.

**2026-10-11 · No co-author trailers; solo maintainer with `pr-approvals: none` · reversible.**
Commits carry the maintainer identity only, with no `Co-Authored-By` lines; a shipped hook blocks
them where a consumer forbids them, and gate check `[11]` checks commit identity. With a single
maintainer, requiring an approving review would deadlock, so branch protection relies on required
status checks instead.
