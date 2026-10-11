# <Project name> - Changelog

A log of completed/changed work, newest first. Each entry has a version and date.

Versioning (0.x while pre-1.0):

- **MINOR** (0.X.0) - a **product-behaviour** change (new capability, or changed instruction/output
  users follow).
- **PATCH** (0.x.X) - a change that alters no behaviour (pure wording / formatting / typo), OR any
  tooling/docs/process/CI change even when multi-file.

**File count is not a versioning axis** - a one-file change that alters product behaviour is MINOR.

<!-- If your product IS its shipped components (a plugin/library), a changed component's
     behaviour is MINOR, not tooling - set this in your CLAUDE.md `version-rules`. After 1.0, add MAJOR
     (X.0.0): a breaking/incompatible change to the product's contract (a removed/renamed capability,
     or an instruction/output/format consumers can't adopt without changing setup). See
     /fluyt:versioning-and-changelog. -->


`CHANGELOG.md` is the single source of truth for completed work AND version numbers - never
duplicate them elsewhere. (See `/fluyt:versioning-and-changelog`.)

Current version: **0.0.1**

---

## [0.0.1] - YYYY-MM-DD

**Bootstrap:** <first entry - bold one-line summary of the initial state or first work item>.

<A sentence or two of why. Add bullets only for what a consumer must act on; the diff shows the
files.>
