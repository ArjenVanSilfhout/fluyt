#!/usr/bin/env node
"use strict";
/*
 * guard-matrix.js - the standing control for this repo's PreToolUse guards.
 *
 * WHAT IT IS
 *   For every repo-local PreToolUse guard in .claude/settings.json - and for the two
 *   SHIPPED guards in plugins/fluyt/hooks/hooks.json - it
 *   reads the guard's `command` string FROM THE FILE ON DISK, executes it with
 *   `bash -c` and hook JSON on stdin, and scores the observed verdict against a fixture table of
 *   DENY, WARN and ALLOW controls. Exit code IS the verdict: 0 green, non-zero otherwise. Nothing
 *   here needs grepping to be read - this repo ships a live guard denying exactly that habit for
 *   scripts/validate-local.ps1, and the same reasoning applies to a control that reports on guards.
 *   The rows score the shipped hooks.json forms: dropping them would leave the shipped guards with
 *   zero executable coverage in the very repo that authors them. The other shipped PreToolUse hooks are named in PLUGIN_UNCOVERED
 *   ([1]) - a known, listed gap, not a silent one.
 *   Both branch guards judge the working copy a command TARGETS (git -C, else the hook
 *   cwd) instead of the session checkout, and the HEAD-freeze flag records WHERE each live agent
 *   was seen. That record is written by the SubagentStart raise hook and by the HEAD-freeze hook's own
 *   mark step, so the raise hook is scored here too (its event named in [1]), and rows may check the
 *   flag file AFTER the hook returns - a record that was never written changes no verdict.
 *   The shipped closing-keyword echo is scored too: it must read the PR number from the merge
 *   command's own segment only (`gh pr merge --squash --auto && seq 1 12` must not echo PR #1's
 *   body - a false "clean" at the one pre-merge check for a wrongly closing keyword).
 *
 * WHY IT EXISTS (do not lose this - it is the whole point)
 *   A guard can ship DEAD and stay dead. A string-built regex loses its doubled backslashes in the
 *   bash -> node.exe argv hand-off, `new RegExp` throws, and the guard's own fail-open `catch`
 *   swallows the throw, so it allows everything. A matrix that hands the script to `node` DIRECTLY
 *   instead of through `bash -c`, the path the hook actually runs on, still runs GREEN. A guard that always allows and a guard
 *   that never runs look identical. That is the shipped hook-authoring skill's silent-failure rule ("pair every
 *   silent-failure hook with something that would notice its absence").
 *   Consequences for anyone editing this runner:
 *     - `bash -c` is NON-NEGOTIABLE for the control. --node-direct exists only as a diagnostic and
 *       is wired to never return an authoritative exit code (see [0]).
 *     - the guard strings are READ FROM DISK, never pasted here. The thing executed must be the
 *       thing shipped.
 *     - the runner proves it can FAIL on every run (see [7]). A control that cannot fail is the very
 *       defect this file exists to prevent, one level up.
 *
 * SAFETY
 *   Fixture command strings are DATA. They are handed to a guard on stdin and never executed - which
 *   is why this file may contain `git commit`, `git checkout` and piped-gate strings that the live
 *   guards would (correctly) deny if a human typed them at the Bash tool.
 *   The HEAD-freeze flag file is written under a FAKE session id (see [3]) - never a real one, which
 *   would freeze the live checkout for whoever is working in it.
 *
 * USAGE
 *   node scripts/guard-matrix.js [path/to/settings.json] [--hooks=<path/to/hooks.json>] [--self-test]
 *                                [--node-direct] [--help]
 *     (no args)       score the repo's own .claude/settings.json AND the shipped
 *                     plugins/fluyt/hooks/hooks.json, then run the self-test
 *     <path>          score a different settings file (this is how the self-test scores a corrupted copy)
 *     --hooks=<path>  score a different plugin hooks.json - a scratch copy with a guard broken by hand
 *                     is how to prove a re-pointed row is bound to the shipped string
 *     --self-test     run ONLY the self-test (skip the real matrix)
 *     --node-direct   DIAGNOSTIC. Re-runs the matrix through `node -e` instead of `bash -c` - the
 *                     blind path that lets a guard ship dead. Always exits 3; never a verification.
 *
 * EXIT CODES
 *   0  GREEN  - every row as expected, and the self-test proved the runner can report FAIL
 *   1  RED    - at least one row mismatched, or an expected guard is missing / ambiguous / uncovered
 *   2  NO VERDICT - the runner could not judge: bad usage, fixture setup failed, or the self-test
 *                   did NOT fail (i.e. the control is broken and every green above is meaningless)
 *   3  DIAGNOSTIC - a --node-direct run. Informational by construction, never authoritative.
 *
 * NOT WIRED INTO THE GATE. scripts/validate-local.ps1 does not call this: the guards are repo-local config CI has no stake in, and a
 * node+bash dependency inside the PowerShell gate is a portability surface this repo has been careful about
 * (see the test-cmd notes in CLAUDE.md). Run it deliberately whenever a guard in settings.json, or a
 * covered guard in the shipped hooks.json, is edited. The expectations below belong to THIS file and describe the CURRENT guards.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

// ---------------------------------------------------------------------------------------------
// [0] Options, constants, output vocabulary
// ---------------------------------------------------------------------------------------------

const KNOWN_FLAGS = ["--self-test", "--node-direct", "--help", "-h"];
const HOOKS_FLAG = "--hooks=";
const ARGV = process.argv.slice(2);
const FLAGS = ARGV.filter((a) => a.indexOf("--") === 0 || a === "-h");
const POSITIONAL = ARGV.filter((a) => FLAGS.indexOf(a) < 0);
const HOOKS_ARGS = FLAGS.filter((a) => a.indexOf(HOOKS_FLAG) === 0);
const OPT = {
  selfTestOnly: FLAGS.indexOf("--self-test") >= 0,
  nodeDirect: FLAGS.indexOf("--node-direct") >= 0,
  help: FLAGS.indexOf("--help") >= 0 || FLAGS.indexOf("-h") >= 0,
};

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SETTINGS = path.join(REPO_ROOT, ".claude", "settings.json");
const DEFAULT_PLUGIN_HOOKS = path.join(REPO_ROOT, "plugins", "fluyt", "hooks", "hooks.json");
const SETTINGS_PATH = POSITIONAL.length ? path.resolve(POSITIONAL[0]) : DEFAULT_SETTINGS;
const PLUGIN_HOOKS_PATH = HOOKS_ARGS.length ?
  path.resolve(HOOKS_ARGS[HOOKS_ARGS.length - 1].slice(HOOKS_FLAG.length)) : DEFAULT_PLUGIN_HOOKS;
// One path per guard SOURCE (see [1]). The self-test swaps exactly one of them for a corrupted copy.
const PATHS = { settings: SETTINGS_PATH, plugin: PLUGIN_HOOKS_PATH };

const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NO_VERDICT = 2;
const EXIT_DIAGNOSTIC = 3;

// Declared up here rather than beside the row table because the changelog fixtures in [2] are
// built at module load and would hit its temporal dead zone if it stayed below them.
const NL = "\n";

function say(msg) { process.stdout.write(msg + "\n"); }
function pass(msg) { say("  PASS: " + msg); }
function fail(msg) { say("  FAIL: " + msg); }
function warn(msg) { say("  WARN: " + msg); }

function usage() {
  say("usage: node scripts/guard-matrix.js [path/to/settings.json] [--hooks=<path/to/hooks.json>] [--self-test] [--node-direct]");
  say("       exit 0 = every row as expected; 1 = mismatch/missing guard; 2 = no verdict; 3 = diagnostic");
}

// ---------------------------------------------------------------------------------------------
// [1] Guard registry - identity by statusMessage, NEVER by array index
// ---------------------------------------------------------------------------------------------
// An index lookup silently scores the WRONG guard the moment a hook is inserted or reordered, and a
// DELETED guard reads as green. So each guard is found by a stable substring of its statusMessage, a miss is a FAIL, and a
// PreToolUse guard that no entry here claims is ALSO a FAIL: an uncovered guard is an uncontrolled
// guard, which is the condition this file exists to end.
//
// Two SOURCES since `settings` (.claude/settings.json, repo-local - every PreToolUse hook there
// must be claimed) and `plugin` (the shipped hooks.json - every PreToolUse hook there must be claimed
// OR named in PLUGIN_UNCOVERED). The shipped match substrings carry no issue number because the
// shipped statusMessages cite none (plugin text cites versions, never bare issue numbers - CLAUDE.md
// Invariants), so they key on the wording instead.

// `event` (default PreToolUse): the SubagentStart raise hook records WHERE a spawn
// lives, and the HEAD-freeze verdict depends on that record, so it has rows of its own. Only
// PreToolUse is held to the every-hook-must-be-claimed rule below - the other events here are scored
// because a verdict depends on them, not because this file claims to cover every hook of that event.
const GUARDS = [
  {
    key: "commit-branch",
    source: "settings",
    match: "Blocking a direct git commit",
    label: "commit-branch guard - denies a git commit whose TARGET working copy (git -C, else cwd) is on dev/main",
  },
  {
    key: "head-freeze",
    source: "settings",
    match: "HEAD-freeze guard",
    label: "HEAD-freeze guard - denies checkout/switch/reset/stash while an agent shares the target working copy",
  },
  {
    key: "agent-raise",
    source: "settings",
    event: "SubagentStart",
    match: "Raising the HEAD-freeze live-agent flag",
    label: "SubagentStart raise hook - records a spawn, and its linked worktree when the spawn's cwd already shows one",
  },
  {
    key: "gate-verdict",
    source: "settings",
    match: "Blocking a piped grep",
    label: "gate-verdict guard - denies a piped grep/Select-String/sls read of the gate's verdict",
  },
  {
    key: "branch-delete",
    source: "plugin",
    match: "before a branch delete",
    label: "SHIPPED branch-delete guard - denies deleting a branch that heads an open PR, fails OPEN when gh cannot answer",
  },
  {
    key: "changelog-heading",
    source: "plugin",
    match: "heading present at HEAD vanished",
    label: "SHIPPED CHANGELOG entry guard, heading clause - warns (never denies) when a heading in HEAD vanished from the commit",
  },
  {
    key: "closing-echo",
    source: "plugin",
    match: "closing keywords before a merge",
    label: "SHIPPED closing-keyword echo - echoes the PR body's closing keywords for the PR the merge command itself names",
  },
];

// Shipped PreToolUse hooks this matrix knowingly does NOT score yet (only the branch-delete and
// changelog-heading guards and the closing-keyword echo are scored). Listed rather than skipped so the gap
// prints on every run, and so a NEW shipped PreToolUse hook - one on neither list - still fails as
// uncovered. An entry here that matches nothing is also a FAIL: a stale exemption is a lie about what
// is covered.
const PLUGIN_UNCOVERED = [
  { match: "Co-Authored-By trailer", why: "co-author-trailers guard - no rows yet" },
];

const SOURCE_LABEL = { settings: "repo-local settings", plugin: "shipped plugin hooks" };

function readHooks(source, filePath) {
  const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entries = [];
  for (const ev of Object.keys(doc.hooks || {})) {
    (doc.hooks[ev] || []).forEach((entry, i) => {
      (entry.hooks || []).forEach((h, k) => {
        entries.push({ source: source, event: ev, index: source + ":" + ev + "[" + i + "].hooks[" + k + "]", hook: h });
      });
    });
  }
  return { doc: doc, entries: entries };
}

const eventOf = (g) => g.event || "PreToolUse";

// Resolve every registry entry against the source files on disk (`paths` = { settings, plugin }).
// Returns { settings, guards, problems, notes }: `problems` is non-empty when a guard is missing,
// matched twice, or present-but-unclaimed - all of which are failures, not skips. `notes` lists the
// PLUGIN_UNCOVERED hooks that were found, for the run to print.
function loadGuards(paths) {
  const src = { settings: readHooks("settings", paths.settings), plugin: readHooks("plugin", paths.plugin) };
  const pre = (s) => src[s].entries.filter((e) => e.event === "PreToolUse");

  const problems = [];
  const notes = [];
  const resolved = {};
  const claimed = new Set();
  for (const g of GUARDS) {
    const entries = src[g.source].entries.filter((e) => e.event === eventOf(g));
    const hits = entries.filter((e) => String(e.hook.statusMessage || "").indexOf(g.match) >= 0);
    if (hits.length === 0) {
      problems.push("expected guard not present: " + g.key + " (no " + eventOf(g) + " statusMessage in " +
        paths[g.source] + " contains \"" + g.match + "\") - a deleted or renamed guard must not read as green");
      continue;
    }
    if (hits.length > 1) {
      problems.push("ambiguous guard identity: " + g.key + " matches " + hits.length + " " + eventOf(g) +
        " hooks - tighten its `match` substring, an ambiguous match scores an unknown guard");
      continue;
    }
    hits.forEach((h) => claimed.add(h.index));
    resolved[g.key] = Object.assign({}, g, {
      index: hits[0].index,
      statusMessage: hits[0].hook.statusMessage,
      command: String(hits[0].hook.command || ""),
    });
    if (!resolved[g.key].command) {
      problems.push("guard " + g.key + " has an empty `command` - nothing to execute");
    }
  }
  const exempt = (e) => e.source === "plugin" &&
    PLUGIN_UNCOVERED.some((u) => String(e.hook.statusMessage || "").indexOf(u.match) >= 0);
  for (const e of pre("settings").concat(pre("plugin"))) {
    if (claimed.has(e.index)) continue;
    if (exempt(e)) {
      notes.push(e.index + ": \"" + e.hook.statusMessage + "\"");
      continue;
    }
    problems.push("uncovered PreToolUse guard at " + e.index + ": \"" + e.hook.statusMessage +
      "\" - add it to GUARDS and give it fixture rows; an uncontrolled guard is how a guard stays dead");
  }
  for (const u of PLUGIN_UNCOVERED) {
    if (!pre("plugin").some((e) => String(e.hook.statusMessage || "").indexOf(u.match) >= 0)) {
      problems.push("stale PLUGIN_UNCOVERED entry \"" + u.match + "\" (" + u.why + ") matches no shipped " +
        "PreToolUse hook - remove it, or the list misstates what this matrix does not cover");
    }
  }
  return { settings: src.settings.doc, guards: resolved, problems: problems, notes: notes };
}

const sha12 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------------------------
// [2] Fixture repos - built and torn down per run, never checked in
// ---------------------------------------------------------------------------------------------
// The guards resolve a repo by walking up from the hook JSON's `cwd` (or a `git -C`
// target) and reading that working copy's HEAD, so the
// branch under test has to be a REAL branch in a REAL repo. `git init -b <branch>` plus one empty
// commit gets there without ever running checkout/switch/reset/stash - which the live HEAD-freeze
// guard denies while this runner is being developed, and which would in any case move a real HEAD.
// The worktree fixtures exist because a linked worktree's `.git` is a FILE, not a directory. A guard that
// fails open there (`if(!st.isDirectory()) exit 0`) lets a commit in a linked worktree checked out at
// dev or main through unjudged, so the commit guard follows the
// `.git` file's `gitdir:` to that worktree's own HEAD, so the fixtures cover all three shapes: a linked
// worktree on a feature branch (`worktree`) and two on the protected branches themselves (`wtdev`,
// `wtmain`). Those two are added off the `feature` repo because git refuses a second worktree on a
// branch some checkout already holds. A fixture that accidentally had a .git DIRECTORY would score a
// different question while looking identical, so [2] asserts the shape AND the branch it built.
// Two more fixture surfaces exist: a `changelog` repo with real commits (the heading guard
// compares HEAD:<file> against the index, so nothing short of a real commit answers it) and the gh
// stub below, which makes the branch-delete guard offline-deterministic. Both surfaces
// score the SHIPPED hooks.json forms; neither string reads ${CLAUDE_PLUGIN_ROOT}, so they run here
// exactly as the client runs them.

function git(cwd, args) {
  const r = cp.spawnSync("git", args, { cwd: cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error("git " + args.join(" ") + " failed in " + cwd + ": " + (r.stderr || "").trim());
  }
  return (r.stdout || "").trim();
}

const IDENT = ["-c", "user.name=guard-matrix", "-c", "user.email=guard-matrix@invalid"];

function buildFixtures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "guard-matrix-"));
  const repos = {};
  for (const branch of ["dev", "main", "feature"]) {
    const dir = path.join(root, branch);
    fs.mkdirSync(dir);
    git(dir, ["init", "-q", "-b", branch]);
    git(dir, IDENT.concat(["commit", "-q", "--allow-empty", "--no-gpg-sign", "-m", "fixture"]));
    const head = fs.readFileSync(path.join(dir, ".git", "HEAD"), "utf8");
    // By-construction check: if `git init -b` were ignored, the dev/main DENY rows would silently be
    // running on some other branch and their failure would read as a broken guard.
    if (head.indexOf("refs/heads/" + branch) < 0) {
      throw new Error("fixture repo " + dir + " is not on branch " + branch + " (HEAD: " + head.trim() + ")");
    }
    repos[branch] = dir;
  }
  const linked = (name, base, args, branch) => {
    const wt = path.join(root, name);
    git(base, ["worktree", "add", "-q"].concat(args(wt)));
    if (!fs.statSync(path.join(wt, ".git")).isFile()) {
      throw new Error("worktree fixture " + wt + " has a .git DIRECTORY - the linked-worktree rows would not discriminate");
    }
    const onBranch = git(wt, ["symbolic-ref", "-q", "--short", "HEAD"]);
    if (onBranch !== branch) {
      throw new Error("worktree fixture " + wt + " is on " + onBranch + ", not " + branch);
    }
    repos[name] = wt;
  };
  linked("worktree", repos.dev, (wt) => ["-b", "guard-matrix-wt", wt], "guard-matrix-wt");
  linked("wtdev", repos.feature, (wt) => ["-b", "dev", wt], "dev");
  linked("wtmain", repos.feature, (wt) => ["-b", "main", wt], "main");

  // The heading-guard fixture. It carries a CLAUDE.md stating the `changelog` Project Facts key
  // because the guard resolves the path through that key (the shipped entry's parse): a
  // fixture without one would silently score the default-path fallback and leave the parse untested.
  const cl = path.join(root, "changelog");
  fs.mkdirSync(cl);
  git(cl, ["init", "-q", "-b", "feature"]);
  fs.writeFileSync(path.join(cl, "CLAUDE.md"), "- `changelog`: `CHANGELOG.md` (root)" + NL);
  fs.writeFileSync(path.join(cl, "CHANGELOG.md"), CL_HEAD);
  git(cl, ["add", "-A"]);
  git(cl, IDENT.concat(["commit", "-q", "--no-gpg-sign", "-m", "fixture changelog"]));
  const committed = git(cl, ["show", "HEAD:CHANGELOG.md"]);
  // By-construction check: if HEAD carried no `## [` heading the MISMATCH row could not fail for the
  // reason under test - the guard exits silently when HEAD has no headings to lose.
  if (committed.indexOf("## [0.2.0]") < 0 || committed.indexOf("## [0.1.0]") < 0) {
    throw new Error("changelog fixture HEAD is missing its two headings - the heading rows would not discriminate");
  }
  repos.changelog = cl;
  return { root: root, repos: repos };
}

// ---- the heading fixture's three changelog shapes ---------------------------------------------
// 0.2.0/0.1.0 at HEAD; the correct bump ADDS 0.3.0 above; the clobbered-heading failure REPLACES the 0.2.0
// heading, silently reattributing its body to 0.3.0. Em dashes deliberately, like the real file -
// the guard keys on the bracketed version, not the separator, and a fixture using a plain hyphen
// would not notice if that ever stopped being true.
const CL_ENTRY = (v, date, body) => "## [" + v + "] — " + date + NL + NL + "- " + body + NL;
const CL_TOP = "# Fixture changelog" + NL + NL + "Current version: **0.2.0**" + NL + NL + "---" + NL + NL;
const CL_HEAD = CL_TOP + CL_ENTRY("0.2.0", "2026-09-17", "second") + NL + CL_ENTRY("0.1.0", "2026-09-16", "first");
const CL_ADDED = CL_TOP + CL_ENTRY("0.3.0", "2026-09-18", "third") + NL +
  CL_ENTRY("0.2.0", "2026-09-17", "second") + NL + CL_ENTRY("0.1.0", "2026-09-16", "first");
const CL_REPLACED = CL_HEAD.replace("## [0.2.0] — 2026-09-17", "## [0.3.0] — 2026-09-18");

// Set the heading fixture's staging state from scratch for one row. `git reset -q -- .` unstages by
// PATHSPEC: it rewrites the index and never moves HEAD, so it is not the HEAD-moving reset [2]
// avoids. Every row re-establishes its own state because the self-test replays the same rows - a row
// that inherited its predecessor's index would score whatever happened to run before it.
function clState(repo, state) {
  git(repo, ["reset", "-q", "--", "."]);
  const content = state === "added" ? CL_ADDED : state === "intact" || state === "other" ? CL_HEAD : CL_REPLACED;
  fs.writeFileSync(path.join(repo, "CHANGELOG.md"), content);
  fs.writeFileSync(path.join(repo, "other.txt"), "touched" + NL);
  if (state === "other") {
    git(repo, ["add", "--", "other.txt"]);
  } else if (state !== "unstaged-replaced") {
    git(repo, ["add", "--", "CHANGELOG.md"]);
  }
}

// ---- the gh stub the branch-delete guard is scored against ------------------------------------
// The guard calls `gh` with Node's spawnSync, which resolves .exe/.com only - so a gh.cmd shim
// is INVISIBLE here (a gh.cmd first on
// PATH is skipped and the real gh.exe answers instead, which would make every row depend on the
// network, the local auth, and whatever PRs happen to be open). What Node does resolve is a
// copy of node.exe named gh(.exe), driven by a NODE_OPTIONS preload that answers from
// GUARD_MATRIX_GH and exits. The preload is inherited by the guard's OWN node process too, so it
// no-ops unless it finds itself running as `gh` - without that basename test it would hijack the
// guard under test and every row would score the stub instead of the hook.
const GH_STUB_SRC = [
  "const base = require(\"path\").basename(process.execPath).toLowerCase();",
  "if (base === \"gh\" || base === \"gh.exe\") {",
  "  const mode = process.env.GUARD_MATRIX_GH || \"empty\";",
  "  if (mode === \"fail\") { process.stderr.write(\"stub gh: simulated failure (GUARD_MATRIX_GH=fail)\\n\"); process.exit(1); }",
  "  if (mode === \"garbage\") { process.stdout.write(\"not json at all {{{\"); process.exit(0); }",
  // `pr view` for the closing-keyword echo. The body names the PR it was asked for, so a row can
  // pin WHICH PR the hook fetched; the no-number form answers as the current branch's PR, #7. A
  // `-R <repo>` the hook passes on is echoed back as `Closes <repo>#<n>`, so a row can also pin WHICH
  // repo it fetched from - a hook that drops the merge's -R/--repo answers bare `#<n>` instead.
  // a PR-URL argument names its own repo and number, and WINS over -R (verified against real gh
  // 2.101.0: `gh pr view <url> -R other/repo` still views the URL's PR), so the stub answers from the URL.
  "  const a = process.argv.slice(2);",
  "  if (mode === \"view\" && a[0] === \"view\") {",
  "    const ri = a.indexOf(\"-R\"); let rr = ri >= 0 ? a[ri + 1] : \"\"; let pn = a[1];",
  // a GH_HOST the hook forwards in the env is echoed as a `<host>/` prefix, modelling real gh 2.101.0
  // (`gh pr view` against a bogus host): GH_HOST supplies the host only where nothing
  // names one - a PR URL and a HOST/OWNER/REPO -R (hence GH_REPO too) both beat it, a 2-part -R takes it.
  // Unset GH_HOST leaves the output byte-identical, so rows ce-w01..w27 are untouched.
  "    let hh = process.env.GH_HOST || \"\";",
  "    if (/^https?:/.test(a[1])) { const us = a[1].split(\"/\"); rr = us[3] + \"/\" + us[4]; pn = a[1].split(\"/pull/\")[1]; hh = \"\"; }",
  "    if (rr.split(\"/\").length > 2) hh = \"\";",
  "    if (a.indexOf(\"--jq\") >= 0) { process.stdout.write(\"stub body of PR \" + pn + \": Closes \" + (hh ? hh + \"/\" : \"\") + rr + \"#\" + pn + \"\\n\"); process.exit(0); }",
  "    process.stdout.write(JSON.stringify({ number: 7, body: \"stub current-branch body: Fixes #7\" })); process.exit(0);",
  "  }",
  "  if (mode === \"open\") { process.stdout.write(JSON.stringify([{ number: 74, url: \"https://example.invalid/pull/74\" }])); process.exit(0); }",
  "  process.stdout.write(\"[]\"); process.exit(0);",
  "}",
  "",
].join(NL);

function buildGhStub(root) {
  const bin = path.join(root, "gh-stub-bin");
  fs.mkdirSync(bin, { recursive: true });
  const exe = path.join(bin, process.platform === "win32" ? "gh.exe" : "gh");
  fs.copyFileSync(process.execPath, exe);
  const preload = path.join(bin, "gh-stub-preload.js");
  fs.writeFileSync(preload, GH_STUB_SRC);
  // FORWARD SLASHES, not path.sep. NODE_OPTIONS is parsed by node itself, which treats a backslash as
  // an escape inside the quoted value: a native path arrives as C:Users<user>AppData..., the require
  // throws before the guard's own script runs, and `2>/dev/null` eats the stack - so every stubbed row
  // reads as a silent ALLOW - the silent-failure shape one layer out.
  const stub = { bin: bin, preload: preload.split(path.sep).join("/") };
  // The fixture's own control. The stub is only useful if the guard's `gh` call actually reaches it,
  // and a stub that answers nothing is indistinguishable from an ALLOW verdict.
  // Exercise it through the same
  // bash -> node -> spawnSync("gh") path the guard uses, with the one mode that must come back loud.
  const probe = cp.spawnSync("bash", ["-c",
    "node -e \"const r=require('child_process').spawnSync('gh',['pr','list'],{encoding:'utf8'});" +
    "process.stdout.write(String(r.status)+'|'+(r.stdout||'')+'|'+(r.stderr||''))\""], {
    encoding: "utf8",
    env: Object.assign({}, ENV, {
      PATH: bin + path.delimiter + String(ENV.PATH || ""),
      NODE_OPTIONS: "--require \"" + stub.preload + "\"",
      GUARD_MATRIX_GH: "open",
    }),
  });
  if ((probe.stdout || "").indexOf("\"number\":74") < 0) {
    throw new Error("the gh stub does not answer through the production path (got: " +
      ((probe.stdout || "") + (probe.stderr || "")).slice(0, 300) + ") - every branch-delete row would " +
      "score a silent ALLOW for a reason that has nothing to do with the guard");
  }
  return stub;
}

function tearDown(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  } catch (e) {
    warn("could not remove fixture dir " + root + ": " + e.message);
  }
}

// ---------------------------------------------------------------------------------------------
// [3] The HEAD-freeze flag file
// ---------------------------------------------------------------------------------------------
// The guard reads os.tmpdir() from INSIDE the hook child. On this platform a child started through
// bash can resolve a different temp root than this process would, so the location is probed through
// the same bash -> node path rather than assumed - a flag written to the wrong directory turns every
// fresh-flag DENY row into a silent ALLOW that looks like a broken guard.
// SID is deliberately fake: writing a real session id here would raise a live-agent flag against a
// real session and freeze its HEAD.

const ENV = Object.assign({}, process.env);
// The guards fall back to CLAUDE_PROJECT_DIR when `cwd` resolves no repo. Left set, the REAL repo
// would answer for a fixture, so rows that must fail open (garbage stdin, no cwd) would pass for the
// wrong reason.
delete ENV.CLAUDE_PROJECT_DIR;
// the gh stub echoes GH_HOST, so an ambient one (a GHE user's export) would leak into every
// closing-echo row and red the matrix for the wrong reason - rows set it inline when they mean it.
delete ENV.GH_HOST;

const SID = "guard-matrix-fixture";
const FLAG_TTL_MIN = 120; // the guard's own TTL; the stale row sits one minute past it

function probeHookTmpdir() {
  const r = cp.spawnSync("bash", ["-c", "node -e \"process.stdout.write(require('os').tmpdir())\""],
    { encoding: "utf8", env: ENV });
  const t = (r.stdout || "").trim();
  if (!t) throw new Error("could not probe os.tmpdir() inside a bash-started node child");
  return t;
}

// `state` is "fresh" / "stale" / "none", or an object of agent id -> { wc: <fixture name>,
// isolated } describing where each live agent was SEEN. An entry with no `wc` is an agent that has not
// run Bash yet - the guard presumes it shares the main checkout. `wc` names are resolved to the
// fixture's path as the matrix built it (the short-name form on this host), while the guard stores
// realpaths - so the object rows also prove the guard compares normalised paths.
function setFlag(flagFile, state, repos) {
  if (state && typeof state === "object") {
    const agents = {};
    for (const id of Object.keys(state)) {
      const s = state[id];
      const en = { type: "developer", started: Date.now() };
      if (s.wc) { en.wc = repos[s.wc]; en.isolated = !!s.isolated; }
      agents[id] = en;
    }
    fs.writeFileSync(flagFile, JSON.stringify({ agents: agents }));
  } else if (state === "fresh" || state === "stale") {
    const started = state === "fresh" ? Date.now() : Date.now() - (FLAG_TTL_MIN + 1) * 60 * 1000;
    fs.writeFileSync(flagFile, JSON.stringify({ agents: { a1: { type: "developer", started: started } } }));
  } else {
    try { fs.unlinkSync(flagFile); } catch (e) { /* already absent - the "no flag" state */ }
  }
}

function readFlag(flagFile) {
  try { return JSON.parse(fs.readFileSync(flagFile, "utf8")); } catch (e) { return null; }
}

// Path equality the way the guard judges it: realpath (expands this host's 8.3 short names), and
// case-insensitive on Windows.
function samePath(a, b) {
  const rp = (p) => { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } };
  const x = rp(a), y = rp(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// ---------------------------------------------------------------------------------------------
// [4] The fixture table
// ---------------------------------------------------------------------------------------------
// Every row states its own expected verdict for the CURRENT guards plus a one-line `note`: what
// would have to be wrong for this row to fail. A row that cannot answer that is decoration and does
// not belong here. Rows marked CONTROL are the ones that catch a guard which never ran at all.

const BT = String.fromCharCode(96); // backtick, kept out of the source text so it anchors nothing here
const ROWS = [];
const row = (o) => ROWS.push(o);
// Worktree rows name fixture PATHS in the command (git -C <worktree>), which exist only once [2] has built
// them - so `cmd` may be a function of the fixture map. Forward slashes, as an agent types them.
const fwd = (p) => p.split(path.sep).join("/");
const cmdOf = (r, repos) => (typeof r.cmd === "function" ? r.cmd(repos) : r.cmd);

// ---- commit-branch: real invocations on dev/main must DENY -----------------------------------
row({ id: "cb-d01", guard: "commit-branch", cwd: "dev", cmd: "git commit -m x", expect: "DENY",
  note: "CONTROL - fails if the guard never ran, the start-of-string anchor broke, or .git/HEAD stopped being read" });
row({ id: "cb-d02", guard: "commit-branch", cwd: "dev", cmd: "git -C . commit -m x", expect: "DENY",
  note: "fails if the {0,4} flag window between git and commit narrowed" });
row({ id: "cb-d03", guard: "commit-branch", cwd: "dev", cmd: "cd sub && git commit -m x", expect: "DENY",
  note: "fails if & left the anchor class" });
row({ id: "cb-d04", guard: "commit-branch", cwd: "dev", cmd: "echo a; git commit -m x", expect: "DENY",
  note: "fails if ; left the anchor class" });
row({ id: "cb-d05", guard: "commit-branch", cwd: "dev", cmd: "true || git commit -m x", expect: "DENY",
  note: "fails if | left the anchor class" });
row({ id: "cb-d06", guard: "commit-branch", cwd: "dev", cmd: "$(git commit -m x)", expect: "DENY",
  note: "fails if $( left the anchor class - the modern substitution stays covered though the backtick does not" });
row({ id: "cb-d07", guard: "commit-branch", cwd: "dev", cmd: "npm test" + NL + "git commit -m x", expect: "DENY",
  note: "fails if the newline anchor broke" });
row({ id: "cb-d08", guard: "commit-branch", cwd: "dev", cmd: "bash <<'EOF'" + NL + "git commit -m x" + NL + "EOF",
  expect: "DENY", note: "fails if the interpreter exemption misses bash and strips an EXECUTED heredoc body" });
row({ id: "cb-d09", guard: "commit-branch", cwd: "dev", cmd: "cat <<'EOF' | bash" + NL + "git commit -m x" + NL + "EOF",
  expect: "DENY", note: "fails if the exemption inspects only the word before << instead of the whole operator line" });
row({ id: "cb-d10", guard: "commit-branch", cwd: "dev", cmd: "pwsh -Command - <<'EOF'" + NL + "git commit -m x" + NL + "EOF",
  expect: "DENY", note: "fails if pwsh dropped out of the interpreter list" });
row({ id: "cb-d11", guard: "commit-branch", cwd: "main", cmd: "git commit -m x", expect: "DENY",
  note: "CONTROL - fails if the main half of the branch test broke (dev-only would still pass cb-d01)" });
row({ id: "cb-d12", guard: "commit-branch", cwd: "dev", cmd: "grep x <<< \"data\"" + NL + "git commit -m x",
  expect: "DENY", note: "fails if <<< is misread as a heredoc operator - the real commit line would be eaten as its body" });
row({ id: "cb-d13", guard: "commit-branch", cwd: "dev",
  cmd: "cat > f <<'EOF'" + NL + "prose about git commit here" + NL + "EOF" + NL + "git commit -m x",
  expect: "DENY", note: "fails if the body strip runs past the terminator line instead of stopping at it" });
row({ id: "cb-d14", guard: "commit-branch", cwd: "dev", cmd: "bash <<-EOF" + NL + "\tgit commit -m x" + NL + "\tEOF",
  expect: "DENY", note: "fails if <<- or a tab-indented terminator is mishandled while the body is still executed" });

// ---- commit-branch: prose and non-invocations must ALLOW --------------------------------------
row({ id: "cb-a01", guard: "commit-branch", cwd: "dev",
  cmd: "cat > f <<'EOF'" + NL + "Run " + BT + "git commit -a" + BT + " first." + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "the quoted-command false positive - fails if either half regressed (backtick out of the anchor class, or the body strip)" });
row({ id: "cb-a02", guard: "commit-branch", cwd: "dev",
  cmd: "cat > f <<'EOF' && gh issue comment 5 --body-file f" + NL + "Run " + BT + "git commit -a" + BT + " first." + NL + "EOF",
  expect: "ALLOW", note: "same shape as bash actually parses it (&& on the operator line, EOF alone terminating)" });
row({ id: "cb-a03", guard: "commit-branch", cwd: "dev",
  cmd: "cat > f <<'EOF'" + NL + "Run " + BT + "git commit -a" + BT + " first." + NL + "EOF" + NL + "gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "same, as two statements - fails if the strip swallows the post-terminator command" });
row({ id: "cb-a04", guard: "commit-branch", cwd: "dev",
  cmd: "cat > f <<'EOF'" + NL + "Steps:" + NL + "```" + NL + "git commit -m x" + NL + "```" + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "fenced code block in a heredoc - only the body strip can allow this, the newline anchor fires otherwise" });
row({ id: "cb-a05", guard: "commit-branch", cwd: "dev",
  cmd: "gh issue create --body \"Git commit subjects follow the commit-subject key\"", expect: "ALLOW",
  note: "quoted-argument prose - fails if anchoring was lost entirely" });
row({ id: "cb-a06", guard: "commit-branch", cwd: "dev", cmd: "printf '%s' 'run git commit later'", expect: "ALLOW",
  note: "quoted-argument prose - fails if anchoring was lost entirely" });
row({ id: "cb-a07", guard: "commit-branch", cwd: "dev", cmd: "echo " + BT + "git commit -m x" + BT, expect: "ALLOW",
  note: "the accepted residual - fails if the backtick came back into the anchor class" });
row({ id: "cb-a08", guard: "commit-branch", cwd: "dev", cmd: "cat > f <<'EOF'" + NL + "git commit -m x", expect: "ALLOW",
  note: "unterminated data heredoc - fails if the body does not run to end-of-string" });
row({ id: "cb-a09", guard: "commit-branch", cwd: "dev",
  cmd: "cat > a <<'EOF'" + NL + "Run " + BT + "git commit -a" + BT + NL + "EOF" + NL + "cat > b <<'EOF'" + NL + "git commit -m x" + NL + "EOF",
  expect: "ALLOW", note: "fails if the heredoc scan stops after the first one and leaves the second body in" });
row({ id: "cb-a10", guard: "commit-branch", cwd: "dev",
  cmd: "cat > f <<-EOF" + NL + "\tRun " + BT + "git commit -a" + BT + " now" + NL + "\tEOF", expect: "ALLOW",
  note: "fails if <<- or a tab-indented terminator is not recognised on a DATA heredoc" });
row({ id: "cb-a11", guard: "commit-branch", cwd: "dev", cmd: "cat <<EOF" + NL + "git commit -m x" + NL + "EOF", expect: "ALLOW",
  note: "fails if an UNQUOTED delimiter is not recognised (cat prints its body, it does not execute it)" });
row({ id: "cb-a12", guard: "commit-branch", cwd: "feature", cmd: "git commit -m x", expect: "ALLOW",
  note: "fails if the dev/main branch test widened to every branch" });
row({ id: "cb-a13", guard: "commit-branch", cwd: "worktree", cmd: "git commit -m x", expect: "ALLOW",
  note: "linked worktree (.git is a FILE) on a FEATURE branch - fails if the gitdir: hop misreads its HEAD as dev/main " });
row({ id: "cb-a14", guard: "commit-branch", cwd: "dev", stdinShape: "garbage", cmd: "(garbage stdin)", expect: "ALLOW",
  note: "fail-open posture - fails if the try/catch around the JSON parse was lost" });
row({ id: "cb-a15", guard: "commit-branch", cwd: "dev", cmd: "git commitx -m x", expect: "ALLOW",
  note: "fails if the word boundary after commit was lost" });
row({ id: "cb-a16", guard: "commit-branch", cwd: "dev", cmd: "git status && git log", expect: "ALLOW",
  note: "fails if the verb list widened past commit" });
row({ id: "cb-a17", guard: "commit-branch", cwd: "dev", cmd: "echo hello world", expect: "ALLOW",
  note: "CONTROL - fails if the guard denies unconditionally" });

// ---- commit-branch: judge the working copy the commit TARGETS --------------------------
// Every DENY row below runs from a cwd on a FEATURE branch (or names the protected worktree only via
// -C), and every ALLOW row from a cwd on dev - so a guard that still judged the session checkout
// fails both halves, and one that still failed open in a linked worktree fails the DENY half.
row({ id: "cb-d15", guard: "commit-branch", cwd: "feature", cmd: (x) => "git -C " + fwd(x.wtdev) + " commit -m x",
  expect: "DENY", msg: "which is on dev",
  note: "-C names a linked worktree on dev while cwd is on a feature branch - fails if -C is ignored or the worktree's own HEAD is not read" });
row({ id: "cb-d16", guard: "commit-branch", cwd: "wtdev", cmd: "git commit -m x", expect: "DENY",
  note: "CONTROL for the closed fail-open - cwd inside a linked worktree on dev; fails if `.git` as a FILE still allows" });
row({ id: "cb-d17", guard: "commit-branch", cwd: "wtmain", cmd: "git commit -m x", expect: "DENY",
  note: "same, on main - fails if the gitdir: hop works for one protected branch only" });
row({ id: "cb-d18", guard: "commit-branch", cwd: "feature", cmd: "git -C ../wtdev commit -m x", expect: "DENY",
  note: "RELATIVE -C - fails if a relative target is not resolved against the hook cwd" });
row({ id: "cb-d19", guard: "commit-branch", cwd: "feature",
  cmd: (x) => "git -C " + fwd(x.worktree) + " commit -m a && git -C " + fwd(x.wtmain) + " commit -m b", expect: "DENY",
  note: "two commits, the SECOND on main - fails if only the first git...commit in the string is judged" });
if (process.platform === "win32") {
  row({ id: "cb-d20", guard: "commit-branch", cwd: "feature",
    cmd: (x) => "git -C " + fwd(x.wtdev).replace(/^([A-Za-z]):/, (m, d) => "/" + d.toLowerCase()) + " commit -m x",
    expect: "DENY", note: "a Git Bash /c/... path - fails if the MSYS drive form is not mapped (it would resolve to a nonexistent C:/c/... and fail open)" });
}
row({ id: "cb-d21", guard: "commit-branch", cwd: "feature",
  cmd: (x) => "git -C " + fwd(path.dirname(x.wtdev)) + "/GUARDM~1/../wtdev commit -m x", expect: "DENY",
  note: "a ~ INSIDE a -C path (a Windows 8.3 short name, e.g. a temp dir) - fails if any ~ reads as undecidable; only a LEADING ~ is shell expansion. Host-independent twin of the short-name paths the other -C rows happen to carry here" });
row({ id: "cb-a18", guard: "commit-branch", cwd: "dev", cmd: (x) => "git -C " + fwd(x.worktree) + " commit -m x",
  expect: "ALLOW", note: "the linked-worktree false positive itself (an integration worktree committed via -C from a dev checkout) - fails if the guard still judges the cwd" });
row({ id: "cb-a19", guard: "commit-branch", cwd: "dev", cmd: (x) => "git -C " + fwd(x.feature) + " commit -m x",
  expect: "ALLOW", note: "-C names a MAIN checkout on a feature branch - fails if -C is honoured for linked worktrees only" });
row({ id: "cb-a20", guard: "commit-branch", cwd: "dev", cmd: "git -C \"$WT\" commit -m x", expect: "ALLOW",
  note: "an unexpandable -C target - cannot decide, so fail-soft ALLOW; fails if it silently falls back to judging the dev cwd" });
row({ id: "cb-a21", guard: "commit-branch", cwd: "dev", cmd: "git -C no-such-dir commit -m x", expect: "ALLOW",
  note: "a nonexistent -C target (dev/no-such-dir) - fails if the walk-up from a missing path climbs into the dev repo around it" });

// ---- HEAD-freeze: a fresh live-agent flag must DENY HEAD moves --------------------------------
row({ id: "hf-d01", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: "git checkout main", expect: "DENY",
  note: "CONTROL - fails if the guard never ran, the anchor broke, or the flag file is read from the wrong tmpdir" });
row({ id: "hf-d02", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: "git -C . switch dev", expect: "DENY",
  note: "fails if the switch alternative or the {0,4} flag window broke (-C . since a -C target is now resolved, and a nonexistent one cannot be judged)" });
row({ id: "hf-d03", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: "cd y && git reset --hard", expect: "DENY",
  note: "fails if & left the anchor class or reset left the verb list" });
row({ id: "hf-d04", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: "git stash", expect: "DENY",
  note: "fails if the stash alternative broke" });
row({ id: "hf-d05", guard: "head-freeze", cwd: "dev", flag: "fresh",
  cmd: "bash <<'EOF'" + NL + "git checkout main" + NL + "EOF", expect: "DENY",
  note: "fails if THIS copy of the heredoc helper strips an executed body (each guard carries its own copy)" });

// ---- HEAD-freeze: prose, stale flag, no flag, other verbs must ALLOW --------------------------
row({ id: "hf-a01", guard: "head-freeze", cwd: "dev", flag: "fresh",
  cmd: "cat > f <<'EOF'" + NL + "Use " + BT + "git checkout" + BT + " sparingly." + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "the quoted-command shape on this guard - fails if this copy of the fix is missing" });
row({ id: "hf-a02", guard: "head-freeze", cwd: "dev", flag: "fresh",
  cmd: "cat > f <<'EOF'" + NL + "```" + NL + "git checkout main" + NL + "```" + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "fenced code block in a heredoc - only the body strip can allow this" });
row({ id: "hf-a03", guard: "head-freeze", cwd: "dev", flag: "stale", cmd: "git checkout main", expect: "ALLOW",
  note: "flag is one minute past the guard's 120-minute TTL - fails if the tuned TTL moved" });
row({ id: "hf-a04", guard: "head-freeze", cwd: "dev", flag: "none", cmd: "git checkout main", expect: "ALLOW",
  note: "no flag file at all - fails if the missing-file catch broke and the guard denied blind" });
row({ id: "hf-a05", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: "git worktree add ../wt dev", expect: "ALLOW",
  note: "fails if the verb list widened - worktree add is the sanctioned way to work while HEAD is frozen" });
row({ id: "hf-a06", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: "git log", expect: "ALLOW",
  note: "CONTROL - fails if the guard denies unconditionally" });
row({ id: "hf-a07", guard: "head-freeze", cwd: "worktree", flag: "fresh", cmd: "git checkout main", expect: "ALLOW",
  note: "cwd in a linked worktree, the only agent not yet SEEN - fails if an unseen agent is presumed to share a linked worktree rather than the main checkout" });
row({ id: "hf-a08", guard: "head-freeze", cwd: "dev", flag: "fresh", stdinShape: "no-session", cmd: "git checkout main",
  expect: "ALLOW", note: "no session_id in the hook JSON - fails if the guard stopped requiring one before naming a flag file" });

// ---- HEAD-freeze: count only agents that share the TARGET working copy ------------------
// An agent's `wc` is where its own Bash cwd was seen (the guard marks it, rows hm-* below); an agent
// with no `wc` has not run Bash yet and is presumed to share the MAIN checkout. Both directions
// discriminate: a guard that still counted every live agent fails the ALLOW rows, and one that
// stopped counting the seen-in-main or seen-in-this-worktree agent fails the DENY rows.
row({ id: "hf-a09", guard: "head-freeze", cwd: "dev", flag: { a1: { wc: "worktree", isolated: true } },
  cmd: "git checkout main", expect: "ALLOW",
  note: "the linked-worktree false positive itself: the only live agent was seen in its own linked worktree - fails if isolation is ignored" });
row({ id: "hf-d06", guard: "head-freeze", cwd: "dev", flag: { a1: { wc: "dev", isolated: false } },
  cmd: "git checkout main", expect: "DENY",
  note: "an agent SEEN in the main checkout (and a realpath-vs-short-name pair) - fails if seen agents stopped counting or paths are compared raw" });
row({ id: "hf-d07", guard: "head-freeze", cwd: "dev", flag: { a1: { wc: "worktree", isolated: true }, a2: {} },
  cmd: "git checkout main", expect: "DENY", msg: "1 live agent(s)",
  note: "one isolated + one not-yet-seen agent - fails if the isolated one is counted too (2) or the unseen one is not (ALLOW)" });
row({ id: "hf-d08", guard: "head-freeze", cwd: "dev", flag: { a1: { wc: "worktree", isolated: true } },
  cmd: (x) => "git -C " + fwd(x.worktree) + " checkout x", expect: "DENY",
  note: "moving the HEAD of a live agent's OWN worktree (a linked target must be frozen too) - fails if a linked target is never frozen" });
row({ id: "hf-a10", guard: "head-freeze", cwd: "dev", flag: "fresh", cmd: (x) => "git -C " + fwd(x.worktree) + " checkout x",
  expect: "ALLOW", note: "-C another working copy while a not-yet-seen agent is presumed in main - fails if the target is not resolved from -C" });
row({ id: "hf-a11", guard: "head-freeze", cwd: "dev", flag: { a1: { wc: "dev", isolated: false } },
  cmd: (x) => "git -C " + fwd(x.worktree) + " checkout x", expect: "ALLOW",
  note: "-C another working copy while an agent is SEEN in main - fails if a seen agent freezes every working copy" });

// ---- HEAD-freeze: the marking step - an agent's Bash call records where it lives ---------
// `agent` puts agent_id in the hook JSON (PreToolUse carries it only for a subagent's call). `after`
// inspects the flag file once the hook returns: the verdict alone cannot see a record that was never
// written, which is the silent-failure shape this file exists to catch.
const wcIs = (name, isolated) => (f, x) => !!(f && f.agents && f.agents.a1 && f.agents.a1.isolated === isolated &&
  typeof f.agents.a1.wc === "string" && samePath(f.agents.a1.wc, x[name]));
row({ id: "hm-01", guard: "head-freeze", cwd: "worktree", agent: "a1", flag: { a1: {} }, cmd: "git status",
  expect: "ALLOW", after: { what: "a1 marked isolated at the worktree", check: wcIs("worktree", true) },
  note: "CONTROL - a subagent's call from a linked worktree must mark its entry, on a NON-HEAD-moving command too; fails if marking is dead" });
row({ id: "hm-02", guard: "head-freeze", cwd: "dev", agent: "a1", flag: { a1: {} }, cmd: "git status",
  expect: "ALLOW", after: { what: "a1 marked NOT isolated at dev", check: wcIs("dev", false) },
  note: "a call from the main checkout records that too - fails if every seen agent is marked isolated" });
row({ id: "hm-03", guard: "head-freeze", cwd: "worktree", agent: "zz", flag: { a1: {} }, cmd: "git status",
  expect: "ALLOW", after: { what: "no entry created for an agent that was never raised",
    check: (f) => !!(f && f.agents && !f.agents.zz && f.agents.a1 && !f.agents.a1.wc) },
  note: "an agent_id with no raised entry - fails if the mark step invents entries (it would freeze HEAD with no SubagentStop to lower it)" });
row({ id: "hm-04", guard: "head-freeze", cwd: "worktree", agent: "a1", flag: { a1: { wc: "worktree", isolated: true } },
  cmd: "git checkout -b other", expect: "ALLOW",
  note: "an isolated agent moving its OWN worktree's HEAD - fails if the caller freezes itself" });
row({ id: "hm-05", guard: "head-freeze", cwd: "worktree", agent: "a1",
  flag: { a1: { wc: "worktree", isolated: true }, a2: { wc: "worktree", isolated: true } },
  cmd: "git checkout -b other", expect: "DENY",
  note: "a SECOND agent seen in the same worktree - fails if self-exclusion widened to every agent in a linked worktree" });
row({ id: "hm-06", guard: "head-freeze", cwd: "dev", agent: "a1", flag: { a1: {} }, cmd: "git checkout main",
  expect: "DENY", after: { what: "a1 marked NOT isolated at dev", check: wcIs("dev", false) },
  note: "a non-isolated subagent moving the SHARED checkout still counts itself - fails if self-exclusion leaked into the main checkout" });

// ---- agent-raise: SubagentStart records a spawn already seen in a linked worktree --------
row({ id: "ar-01", guard: "agent-raise", cwd: "worktree", agent: "a1", flag: "none", cmd: "(SubagentStart)",
  expect: "ALLOW", after: { what: "a1 raised AND recorded isolated at the worktree", check: wcIs("worktree", true) },
  note: "CONTROL - a spawn whose cwd is a linked worktree; fails if the raise hook drops the cwd or never raises" });
row({ id: "ar-02", guard: "agent-raise", cwd: "dev", agent: "a1", flag: "none", cmd: "(SubagentStart)",
  expect: "ALLOW", after: { what: "a1 raised with NO wc (presumed in the main checkout)",
    check: (f) => !!(f && f.agents && f.agents.a1 && typeof f.agents.a1.started === "number" && !("wc" in f.agents.a1)) },
  note: "a spawn whose cwd is a main checkout - fails if it is recorded as seen (or isolated) before it ever ran Bash" });
row({ id: "ar-03", guard: "agent-raise", cwd: "worktree", agent: "a1", flag: { a2: { wc: "dev", isolated: false } },
  cmd: "(SubagentStart)", expect: "ALLOW",
  after: { what: "a2 kept beside the new a1", check: (f, x) => wcIs("worktree", true)(f, x) && !!f.agents.a2 && samePath(f.agents.a2.wc, x.dev) },
  note: "raising one agent must not clobber another's entry - fails if the read-modify-write lost the existing state" });

// ---- gate-verdict: piping the gate into a filter must DENY ------------------------------------
row({ id: "gv-d01", guard: "gate-verdict", cwd: "dev", cmd: "pwsh -NoProfile -File scripts/validate-local.ps1 | grep PASS",
  expect: "DENY", note: "CONTROL - the canonical shape; fails if the guard never ran" });
row({ id: "gv-d02", guard: "gate-verdict", cwd: "dev", cmd: "./scripts/validate-local.ps1 | Select-String FAIL",
  expect: "DENY", note: "fails if the bare-path script alternative or the Select-String filter alternative broke" });
row({ id: "gv-d03", guard: "gate-verdict", cwd: "dev", cmd: "pwsh -File scripts/validate-local.ps1 2>&1 | sls \"\\[3\\]\"",
  expect: "DENY", note: "fails if the gap's single-& tolerance broke and 2>&1 read as a command separator" });
row({ id: "gv-d04", guard: "gate-verdict", cwd: "dev", cmd: "powershell -File scripts/validate-local.ps1 | grep RESULT",
  expect: "DENY", note: "fails if the powershell (5.1) spelling dropped out of the interpreter alternative" });
row({ id: "gv-d05", guard: "gate-verdict", cwd: "dev",
  cmd: "bash <<'EOF'" + NL + "pwsh -File scripts/validate-local.ps1 | grep PASS" + NL + "EOF", expect: "DENY",
  note: "fails if the strip ignores the interpreter exemption in this copy and treats an executed body as prose" });

// ---- gate-verdict: the sanctioned reads must ALLOW --------------------------------------------
row({ id: "gv-a01", guard: "gate-verdict", cwd: "dev", cmd: "pwsh -NoProfile -File scripts/validate-local.ps1", expect: "ALLOW",
  note: "the sanctioned invocation (Project Facts test-cmd) - fails if the guard denies the bare run" });
row({ id: "gv-a02", guard: "gate-verdict", cwd: "dev", cmd: "pwsh -File scripts/validate-local.ps1 > out.txt; grep PASS out.txt",
  expect: "ALLOW", note: "the sanctioned workaround - fails if the gap stopped excluding ; and blocked redirect-then-grep-a-file" });
row({ id: "gv-a03", guard: "gate-verdict", cwd: "dev", cmd: "grep PASS out.txt", expect: "ALLOW",
  note: "fails if the guard stopped requiring the gate script in the pipeline and denied any grep" });
row({ id: "gv-a04", guard: "gate-verdict", cwd: "dev",
  cmd: "cat > f <<'EOF'" + NL + "Never run " + BT + "pwsh -File scripts/validate-local.ps1 | grep PASS" + BT + " - read the exit code." + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "the quoted-command shape on this guard - prose quoting the forbidden pipe must not deny" });
row({ id: "gv-a05", guard: "gate-verdict", cwd: "dev",
  cmd: "cat > f <<'EOF'" + NL + "pwsh -File scripts/validate-local.ps1 | grep PASS" + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "bare forbidden line inside a data heredoc - only the body strip can allow this" });
row({ id: "gv-a06", guard: "gate-verdict", cwd: "dev", cmd: "echo hello world", expect: "ALLOW",
  note: "CONTROL - fails if the guard denies unconditionally" });

// ---- branch-delete (SHIPPED): deleting an open PR's head must DENY -------
// Scored against hooks.json.
// Every row here pins `gh` to the stub (see buildGhStub) - a row that let the real gh answer would
// score the local open PRs, and would go green or red for reasons that have nothing to do with
// the guard. `msg` rows additionally require a substring of the guard's own text, which is how a
// verdict that is right for the wrong ref (unnormalised, or another row's ref) is caught.
row({ id: "bd-d01", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git branch -D feat/x", expect: "DENY",
  msg: "branch feat/x is the head of open PR #74",
  note: "CONTROL - fails if the guard never ran, the anchor broke, or gh stopped being consulted" });
row({ id: "bd-d02", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git branch --delete feat/x", expect: "DENY",
  note: "fails if the long --delete spelling dropped out" });
row({ id: "bd-d03", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git branch -Df feat/x", expect: "DENY",
  note: "fails if a COMBINED short flag stopped reading as a delete (-Df is how a forced delete is usually typed)" });
row({ id: "bd-d04", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git push origin --delete feat/x", expect: "DENY",
  msg: "branch feat/x is the head of open PR #74",
  note: "fails if the push --delete form is missed, or if the REMOTE is mistaken for the ref (origin would be looked up)" });
row({ id: "bd-d05", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git push origin :feat/x", expect: "DENY",
  msg: "branch feat/x is the head of open PR #74",
  note: "fails if the colon refspec delete form is missed, or if the leading colon is left on the ref" });
row({ id: "bd-d06", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git branch -D refs/heads/feat/x", expect: "DENY",
  msg: "branch feat/x is the head of open PR #74",
  note: "fails if refs/heads/ is not stripped - gh --head takes a branch name, so the unstripped ref answers []" });
row({ id: "bd-d07", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git -C . branch -D feat/x", expect: "DENY",
  note: "fails if git global flags (-C <dir>) stopped being skipped when locating the subcommand" });
row({ id: "bd-d08", guard: "branch-delete", cwd: "dev", gh: "open",
  cmd: "bash <<'EOF'" + NL + "git branch -D feat/x" + NL + "EOF", expect: "DENY",
  note: "fails if THIS copy of the heredoc helper strips an EXECUTED body (each guard carries its own copy)" });

// ---- branch-delete: everything else must ALLOW, and a blind gh must ALLOW LOUDLY ---------------
row({ id: "bd-a01", guard: "branch-delete", cwd: "dev", gh: "empty", cmd: "git branch -D feat/x", expect: "ALLOW",
  note: "no open PR has that head - the lane-cleanup path; fails if the guard denies on an empty gh answer" });
row({ id: "bd-a02", guard: "branch-delete", cwd: "dev", gh: "fail", cmd: "git branch -D feat/x", expect: "WARN",
  msg: "is BLIND and ALLOWED this delete",
  note: "gh exits 1 - fails if the guard denies on a gh failure (it must never) or stays silent about being blind" });
row({ id: "bd-a03", guard: "branch-delete", cwd: "dev", gh: "missing", cmd: "git branch -D feat/x", expect: "WARN",
  msg: "is BLIND and ALLOWED this delete",
  note: "the GitHub CLI is off PATH, so spawn errors rather than exits - the other half of the fail-open branch" });
row({ id: "bd-a04", guard: "branch-delete", cwd: "dev", gh: "garbage", cmd: "git branch -D feat/x", expect: "WARN",
  msg: "could not parse",
  note: "gh answers non-JSON - fails if the guard treats unparsable output as no open PR (a silent ALLOW)" });
row({ id: "bd-a05", guard: "branch-delete", cwd: "dev", gh: "open",
  cmd: "cat > f <<'EOF'" + NL + "Run " + BT + "git branch -D feat/x" + BT + " only after MERGED." + NL + "EOF && gh issue comment 5 --body-file f",
  expect: "ALLOW", note: "the quoted-command shape on this guard - prose QUOTING the delete must not deny" });
row({ id: "bd-a06", guard: "branch-delete", cwd: "dev", gh: "open",
  cmd: "gh issue create --body \"we still git branch -D feat/x by hand\"", expect: "ALLOW",
  note: "quoted-argument prose - fails if command-position anchoring was lost" });
row({ id: "bd-a07", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git branch -m feat/x feat/y", expect: "ALLOW",
  note: "a RENAME - fails if any short flag reads as a delete (-m carries no d/D)" });
row({ id: "bd-a08", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git push origin feat/x", expect: "ALLOW",
  note: "an ordinary push - fails if push without --delete or a leading colon reads as a delete" });
row({ id: "bd-a09", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git push origin feat/x:feat/x", expect: "ALLOW",
  note: "a src:dst refspec - fails if the colon test stopped requiring the colon to be LEADING" });
row({ id: "bd-a10", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "git branch --list -a", expect: "ALLOW",
  note: "listing branches - fails if a delete is inferred from the subcommand alone" });
row({ id: "bd-a11", guard: "branch-delete", cwd: "dev", gh: "open", cmd: "echo hello world", expect: "ALLOW",
  note: "CONTROL - fails if the guard denies (or speaks) unconditionally" });
row({ id: "bd-a12", guard: "branch-delete", cwd: "dev", gh: "open", stdinShape: "garbage", cmd: "(garbage stdin)",
  expect: "ALLOW", note: "fail-open posture - fails if the try/catch around the JSON parse was lost" });

// ---- changelog-heading (SHIPPED): a vanished heading must WARN, never DENY -
// `state` restages the changelog fixture per row (see clState). These rows are the only ones whose
// verdict depends on repo CONTENT rather than the command string, so the state is set immediately
// before the guard fires and never assumed.
// These score the shipped form, which is NOT a standalone guard: the heading check is a
// clause appended to the shipped CHANGELOG entry guard, whose date echo speaks (WARN) on EVERY commit
// carrying the changelog - and whose date clause says "MISMATCH" too whenever the fixture's entry
// date is not today. So the verdict alone cannot discriminate here: the WARN rows pin text only the
// heading clause emits (HD_TEXT), and the correct-bump control pins its ABSENCE (`absent`) instead
// of expecting silence. A bare `msg: "MISMATCH"` would have scored the date clause and stayed green
// with the heading clause dead.
const HD_TEXT = "heading(s) present in HEAD:CHANGELOG.md but missing from the ";
row({ id: "ch-w01", guard: "changelog-heading", cwd: "changelog", state: "replaced", cmd: "git commit -m x",
  expect: "WARN", msg: HD_TEXT + "staged file",
  note: "CONTROL - the clobbered-heading failure itself (0.2.0 overwritten by the new heading); fails if the guard never ran or the heading clause stopped comparing" });
row({ id: "ch-w02", guard: "changelog-heading", cwd: "changelog", state: "replaced", cmd: "git commit -m x",
  expect: "WARN", msg: HD_TEXT + "staged file: 0.2.0",
  note: "fails if the MISMATCH does not NAME the vanished heading - an unnamed warning cannot be acted on" });
row({ id: "ch-w03", guard: "changelog-heading", cwd: "changelog", state: "unstaged-replaced", cmd: "git commit -am x",
  expect: "WARN", msg: HD_TEXT + "working-tree file",
  note: "nothing staged, -a sweeps it in - fails if the allFlag/working-tree path broke for the heading clause" });
row({ id: "ch-a01", guard: "changelog-heading", cwd: "changelog", state: "added", cmd: "git commit -m x", expect: "WARN",
  absent: HD_TEXT,
  note: "CONTROL - a CORRECT bump (0.3.0 inserted above) draws only the date echo; fails if the heading clause fires on every changelog commit" });
row({ id: "ch-a02", guard: "changelog-heading", cwd: "changelog", state: "other", cmd: "git commit -m x", expect: "ALLOW",
  note: "the changelog is not in the commit - fails if the guard stopped checking what is actually staged" });
row({ id: "ch-a03", guard: "changelog-heading", cwd: "changelog", state: "unstaged-replaced", cmd: "git commit -m x",
  expect: "ALLOW", note: "a vanished heading NOT in this commit (no -a) - fails if the allFlag test widened to every commit" });
row({ id: "ch-a04", guard: "changelog-heading", cwd: "changelog", state: "replaced", cmd: "git log", expect: "ALLOW",
  note: "not a commit at all - fails if the verb match widened past commit" });
row({ id: "ch-a05", guard: "changelog-heading", cwd: "changelog", state: "replaced",
  cmd: "cat > f <<'EOF'" + NL + "git commit -m x" + NL + "EOF && gh issue comment 5 --body-file f", expect: "ALLOW",
  note: "the quoted-command shape - a heredoc quoting the commit must not make this guard speak" });
row({ id: "ch-a06", guard: "changelog-heading", cwd: "dev", state: "replaced", cmd: "git commit -m x", expect: "ALLOW",
  note: "a repo with no changelog and no HEAD copy of one - fails if a missing HEAD:<file> stops reading as silence" });

// ---- closing-echo (SHIPPED): echo the closing keywords of the PR the merge itself names ----
// An advisory hook - it never denies, so every verdict is WARN (it spoke) or ALLOW (silent), and the
// WARN rows pin `msg` because a WARN naming the WRONG PR must fail: a verdict-only row
// would score it green. `gh: "view"` answers `pr view <n>` with "Closes #<n>" (so the text names
// the PR actually fetched) and the no-number form as the current branch's PR #7 (see GH_STUB_SRC).
// Unnumbered merges resolve the current branch's PR only when every argument is a flag and nothing
// (cd, -R/--repo, an env prefix) could point gh somewhere else; otherwise it is "could not parse".
const CE_CUR = "(PR #7, resolved from the current branch): Fixes #7";
const CE_CNP = "could not parse a PR number from this merge command";
row({ id: "ce-w01", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42",
  note: "CONTROL - a numbered merge; fails if the hook never ran, the anchor broke, or gh pr view stopped being asked for 42" });
// For an o/r URL the hook must ask gh for the URL itself, not keep only the number and view #42 in
// the hook cwd's repo.
row({ id: "ce-w02", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge https://github.com/o/r/pull/42 --squash",
  expect: "WARN", msg: "(PR #42 in o/r): Closes o/r#42",
  note: "the URL form - fails if /pull/<n> stopped being read, or the URL's repo is dropped and #42 fetched from the hook cwd's repo" });
row({ id: "ce-w03", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge \"#42\" --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", note: "a QUOTED #42 reaches gh as #42 - fails if quotes are not stripped off the token" });
row({ id: "ce-w04", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge #42 --squash", expect: "WARN",
  msg: CE_CUR, absent: "(PR #42)",
  note: "an UNQUOTED #42 starts a bash comment, so gh merges the current branch's PR - fails if the comment is read as an argument" });
row({ id: "ce-w05", guard: "closing-echo", cwd: "dev", gh: "view",
  cmd: "gh pr merge --squash --auto && for i in $(seq 1 12); do sleep 5; done", expect: "WARN", msg: CE_CUR, absent: "(PR #1)",
  note: "CONTROL - a merge followed by an unrelated command; fails if the number search runs past the merge command's own segment (it would echo PR #1)" });
row({ id: "ce-w06", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge --squash --auto 2>&1 | tee merge.log",
  expect: "WARN", msg: CE_CUR, note: "a redirection in the segment - fails if 2> or the pipe's right side reads as an argument" });
row({ id: "ce-w07", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_PROMPT_DISABLED=1 gh pr merge 42 --squash",
  expect: "WARN", msg: "(PR #42): Closes #42", note: "an env-assignment prefix - fails if the command-position anchor stopped admitting one" });
row({ id: "ce-w08", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "bash <<'EOF'" + NL + "gh pr merge 42 --squash" + NL + "EOF",
  expect: "WARN", msg: "(PR #42): Closes #42", note: "an EXECUTED heredoc body - fails if this copy of the heredoc helper strips it" });
row({ id: "ce-w09", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge feat/x --squash", expect: "WARN",
  msg: CE_CNP, note: "a branch-name argument - fails if it is ignored and the CURRENT branch's PR is echoed instead" });
row({ id: "ce-w10", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "cd ../other && gh pr merge --squash", expect: "WARN",
  msg: CE_CNP, note: "a cd before the merge - fails if the current branch is resolved from the hook cwd, which is not where gh runs" });
row({ id: "ce-w11", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge --squash -R o/r", expect: "WARN",
  msg: CE_CNP, note: "another repo - fails if -R is ignored and this checkout's branch PR is echoed" });
row({ id: "ce-w12", guard: "closing-echo", cwd: "dev", gh: "fail", cmd: "gh pr merge --squash --auto", expect: "WARN",
  msg: "(the current-branch PR): gh failed to fetch the PR body",
  note: "gh errors (no PR for the branch) - fails if a gh failure goes silent or throws into the fail-open catch" });
// A NUMBERED merge naming another repo must fetch that number FROM that repo: a hook that
// drops -R/--repo echoes #<n> of the hook cwd's repo - a different PR's body, a false "clean"
// (or a false alarm) for the merge actually being armed. Each form below fails on such a hook.
const CE_RR = "(PR #42 in o/r): Closes o/r#42";
row({ id: "ce-w13", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 -R o/r --squash", expect: "WARN",
  msg: CE_RR, note: "CONTROL - -R <repo>; fails if the repo is dropped and #42 is fetched from the hook cwd's repo" });
row({ id: "ce-w14", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 --repo o/r --squash", expect: "WARN",
  msg: CE_RR, note: "--repo <repo> - fails if the long flag's separate value is not read" });
row({ id: "ce-w15", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 --repo=o/r --squash", expect: "WARN",
  msg: CE_RR, note: "--repo=<repo> - fails if the attached long-flag value is not read" });
row({ id: "ce-w16", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge -R o/r 42 --squash", expect: "WARN",
  msg: CE_RR, note: "the flag BEFORE the number - fails if only flags after the number are read" });
row({ id: "ce-w17", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 -Ro/r --squash", expect: "WARN",
  msg: CE_RR, note: "-R<repo> attached - fails if the short flag's attached value is not read" });
row({ id: "ce-w18", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 -sR o/r", expect: "WARN",
  msg: CE_RR, note: "-R bundled behind the boolean -s - fails if a bundled shorthand hides the repo" });
row({ id: "ce-w19", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 -tRelease --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", note: "an R inside -t's attached subject is not -R - fails if the bundle match admits a value-taking shorthand" });
// the two other ways a merge names another repo - a GH_REPO env prefix and a PR URL. Same defect as
// above (a hook viewing #<n> in the hook cwd's repo); each row fails on such a hook. Precedence follows real gh
// (merge shares the PR finder):
// -R beats GH_REPO; a PR URL beats BOTH -R and GH_REPO. `absent` pins that the losing repo never surfaces.
row({ id: "ce-w20", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=o/r gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "CONTROL - a GH_REPO env prefix; fails if it is parsed but never passed on (fetched from the hook cwd's repo)" });
row({ id: "ce-w21", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=\"o/r\" gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "a double-quoted GH_REPO value - fails if the quotes ride along into -R" });
row({ id: "ce-w22", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO='o/r' gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "a single-quoted GH_REPO value - fails if the quotes ride along into -R" });
row({ id: "ce-w23", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=a/b GH_REPO=o/r gh pr merge 42 --squash",
  expect: "WARN", msg: CE_RR, absent: "a/b", note: "the prefix repeated - the LAST assignment wins, as in the shell" });
row({ id: "ce-w24", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=a/b gh pr merge 42 -R o/r --squash",
  expect: "WARN", msg: CE_RR, absent: "a/b", note: "-R beats GH_REPO - fails if the env value overrides the flag" });
row({ id: "ce-w25", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=a/b gh pr merge https://github.com/o/r/pull/42",
  expect: "WARN", msg: CE_RR, absent: "a/b", note: "a PR URL beats GH_REPO - fails if the env value is tagged or passed over the URL" });
row({ id: "ce-w26", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge https://github.com/o/r/pull/42 -R x/y",
  expect: "WARN", msg: CE_RR, absent: "x/y", note: "a PR URL beats -R - fails if the flag's repo is tagged instead of the URL's" });
row({ id: "ce-w27", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "FOO=GH_REPO=z/z gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "z/z", note: "GH_REPO inside ANOTHER variable's value is not GH_REPO - fails if the env match is unanchored" });
// the GH_HOST env prefix, same defect class as GH_REPO - a hook spawning `gh pr view` against the
// cwd's host. The hook forwards the value through the spawned gh's env and lets gh apply its own precedence
// (no host logic in the hook), so the stub models gh 2.101.0 precedence (see GH_STUB_SRC) and
// the host surfaces as a `<host>/` prefix on the echoed repo. The tag deliberately never names the host.
const CE_H = "(PR #42): Closes h.example/#42";
const CE_HRR = "(PR #42 in o/r): Closes h.example/o/r#42";
row({ id: "ce-w28", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=h.example gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "CONTROL - a GH_HOST env prefix; fails if it is parsed but never forwarded (fetched from the hook cwd's host)" });
row({ id: "ce-w29", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=\"h.example\" gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "a double-quoted GH_HOST value - fails if the quotes ride along into the forwarded host" });
row({ id: "ce-w30", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST='h.example' gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "a single-quoted GH_HOST value - fails if the quotes ride along into the forwarded host" });
row({ id: "ce-w31", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=a.example GH_HOST=h.example gh pr merge 42 --squash",
  expect: "WARN", msg: CE_H, absent: "a.example", note: "the prefix repeated - the LAST assignment wins, as in the shell" });
row({ id: "ce-w32", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=h.example gh pr merge 42 -R o/r --squash",
  expect: "WARN", msg: CE_HRR, note: "a 2-part -R takes its host from GH_HOST - fails if the host is forwarded only without -R" });
row({ id: "ce-w33", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=h.example gh pr merge 42 -R x.example/o/r --squash",
  expect: "WARN", msg: "(PR #42 in x.example/o/r): Closes x.example/o/r#42", absent: "h.example",
  note: "a HOST/OWNER/REPO -R beats GH_HOST - fails if the hook overrides gh's own precedence with the env host" });
row({ id: "ce-w34", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=h.example gh pr merge https://github.com/o/r/pull/42",
  expect: "WARN", msg: CE_RR, absent: "h.example", note: "a PR URL beats GH_HOST - fails if the env host is forced over the URL's own" });
row({ id: "ce-w35", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=h.example GH_REPO=o/r gh pr merge 42 --squash",
  expect: "WARN", msg: CE_HRR, note: "a 2-part GH_REPO takes its host from GH_HOST - fails if the host is dropped once a repo is named" });
row({ id: "ce-w36", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "FOO=GH_HOST=z.example gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "z.example", note: "GH_HOST inside ANOTHER variable's value is not GH_HOST - fails if the env match is unanchored" });
row({ id: "ce-w37", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST= gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", note: "an EMPTY GH_HOST is unset - fails only if the empty value breaks parsing (the stub, like gh, reads an empty host as none, so a forwarded \"\" is invisible here)" });
// GH_REPO / GH_HOST set EARLIER in the same command (sibling cases). Each in ONE
// `bash -c` against gh + bash: a BARE `GH_REPO=v;` is an unexported shell variable gh never sees, so it must NOT
// apply (so scanning for a bare assignment is wrong); `export GH_REPO=v` and `GH_REPO=v; export
// GH_REPO` do apply; re-assigning an already-exported variable keeps the export (the later value applies); an inline
// prefix beats an earlier export; -R beats an exported GH_REPO; a PR URL beats both; `env VAR=v gh ...` is an inline
// prefix; an export inside ( ) or $( ) does not leak out. Only text BEFORE the merge counts. `absent` pins the loser.
row({ id: "ce-w38", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=o/r; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "CONTROL - an earlier export; fails if only the merge's own inline prefix is read (fetched from the hook cwd's repo)" });
row({ id: "ce-w39", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=\"o/r\" && gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "a double-quoted exported value, joined by && - fails if the quotes ride along into -R" });
row({ id: "ce-w40", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO='o/r'; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "a single-quoted exported value - fails if the quotes ride along into -R" });
row({ id: "ce-w41", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=o/r; export GH_REPO; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "assign, then export by name - fails if a later `export NAME` does not promote the earlier value" });
row({ id: "ce-w42", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_REPO=a/b; gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "a/b", note: "a BARE unexported assignment is invisible to gh - fails if it is read as exported, or as the merge's inline prefix" });
row({ id: "ce-w43", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=a/b; GH_REPO=o/r gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, absent: "a/b", note: "the inline prefix beats an earlier export - fails if the earlier value is preferred" });
row({ id: "ce-w44", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=a/b; gh pr merge 42 -R o/r --squash", expect: "WARN",
  msg: CE_RR, absent: "a/b", note: "-R beats an exported GH_REPO - fails if the earlier export overrides the flag" });
row({ id: "ce-w45", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=a/b; gh pr merge https://github.com/o/r/pull/42", expect: "WARN",
  msg: CE_RR, absent: "a/b", note: "a PR URL beats an exported GH_REPO - fails if the earlier export is tagged or passed over the URL" });
row({ id: "ce-w46", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "echo hi" + NL + "export GH_REPO=o/r" + NL + "gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "the export on an earlier LINE - fails if the scan stops at the merge's own line" });
row({ id: "ce-w47", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 --squash; export GH_REPO=o/r", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "o/r", note: "an export AFTER the merge cannot reach it - fails if the scan reads past the merge" });
row({ id: "ce-w48", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=a/b; GH_REPO=o/r; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, absent: "a/b", note: "re-assigning an exported variable keeps it exported, last value wins - fails if the bare re-assignment is dropped" });
row({ id: "ce-w49", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "(export GH_REPO=o/r); gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "o/r", note: "an export inside a ( ) group does not leak out - fails if parentheses are not scoped" });
row({ id: "ce-w50", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "echo \"x; export GH_REPO=o/r\"; gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "o/r", note: "an export inside a QUOTED string is data - fails if quoted separators split the scan" });
row({ id: "ce-w51", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=o/r; gh pr merge --squash", expect: "WARN",
  msg: CE_CNP, absent: "(PR #7", note: "an unnumbered merge with an earlier export is NOT the cwd's current-branch PR - fails if the current-branch fetch ignores the export" });
row({ id: "ce-w52", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "env GH_REPO=o/r gh pr merge 42 --squash", expect: "WARN",
  msg: CE_RR, note: "the `env VAR=v gh ...` form is an inline prefix - fails if `env` at command position stops matching (the hook stays silent)" });
row({ id: "ce-w53", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_HOST=h.example; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "CONTROL - an earlier GH_HOST export (an exported GH_HOST is honoured) - fails if only the inline prefix is forwarded" });
row({ id: "ce-w54", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_HOST=\"h.example\"; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "a quoted exported GH_HOST - fails if the quotes ride along into the forwarded host" });
row({ id: "ce-w55", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=h.example; export GH_HOST; gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "GH_HOST assigned, then exported by name - fails if a later `export NAME` does not promote the earlier value" });
row({ id: "ce-w56", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "GH_HOST=z.example; gh pr merge 42 --squash", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "z.example", note: "a BARE unexported GH_HOST is invisible to gh - fails if it is forwarded" });
row({ id: "ce-w57", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_HOST=a.example; GH_HOST=h.example gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, absent: "a.example", note: "the inline GH_HOST beats an earlier export - fails if the earlier value is preferred" });
row({ id: "ce-w58", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_HOST=h.example; gh pr merge 42 -R o/r --squash", expect: "WARN",
  msg: CE_HRR, note: "an earlier GH_HOST export supplies the host of a 2-part -R (a 2-part -R takes GH_HOST)" });
row({ id: "ce-w59", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_HOST=h.example; gh pr merge 42 -R x.example/o/r --squash", expect: "WARN",
  msg: "(PR #42 in x.example/o/r): Closes x.example/o/r#42", absent: "h.example", note: "a HOST/OWNER/REPO -R beats an earlier GH_HOST export - fails if gh's precedence is overridden" });
row({ id: "ce-w60", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr merge 42 --squash; export GH_HOST=h.example", expect: "WARN",
  msg: "(PR #42): Closes #42", absent: "h.example", note: "a GH_HOST export AFTER the merge cannot reach it - fails if the scan reads past the merge" });
row({ id: "ce-w61", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "env GH_HOST=h.example gh pr merge 42 --squash", expect: "WARN",
  msg: CE_H, note: "the `env GH_HOST=v gh ...` form - fails if `env` at command position stops matching" });
row({ id: "ce-w62", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "env GH_REPO=o/r GH_HOST=h.example gh pr merge 42 --squash", expect: "WARN",
  msg: CE_HRR, note: "both variables through `env` - fails if either is dropped" });
row({ id: "ce-w63", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_REPO=o/r" + NL + "export GH_HOST=h.example" + NL + "gh pr merge 42 --squash",
  expect: "WARN", msg: CE_HRR, note: "both exported on earlier lines - fails if the scan stops after the first variable" });
row({ id: "ce-w64", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "export GH_HOST=h.example; gh pr merge --squash", expect: "WARN",
  msg: CE_CNP, absent: "(PR #7", note: "an unnumbered merge with an earlier GH_HOST export is NOT the cwd's current-branch PR - fails if the current-branch fetch ignores it" });
row({ id: "ce-a01", guard: "closing-echo", cwd: "dev", gh: "view",
  cmd: "gh issue comment 5 --body \"armed it with gh pr merge --squash --auto, then seq 1 12\"", expect: "ALLOW",
  note: "merge words inside a quoted argument; fails if command-position anchoring was lost" });
row({ id: "ce-a02", guard: "closing-echo", cwd: "dev", gh: "view",
  cmd: "cat > f <<'EOF'" + NL + "gh pr merge --squash --auto" + NL + "seq 1 12" + NL + "EOF", expect: "ALLOW",
  note: "a merge line inside a DATA heredoc; only the body strip can allow this, the newline anchor fires otherwise" });
row({ id: "ce-a03", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "gh pr view 42", expect: "ALLOW",
  note: "not a merge - fails if the verb match widened" });
row({ id: "ce-a04", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "echo hello world", expect: "ALLOW",
  note: "CONTROL - fails if the hook speaks unconditionally" });
row({ id: "ce-a05", guard: "closing-echo", cwd: "dev", gh: "view", stdinShape: "garbage", cmd: "(garbage stdin)",
  expect: "ALLOW", note: "fail-soft posture - fails if the try/catch around the JSON parse was lost" });
row({ id: "ce-a06", guard: "closing-echo", cwd: "dev", gh: "view", cmd: "echo env gh pr merge 42", expect: "ALLOW",
  note: "`env` is only a command-position prefix - fails if the widened merge anchor admits merge words in an echo's arguments" });

// ---------------------------------------------------------------------------------------------
// [5] Execution - bash -c is the production path, and the only authoritative one
// ---------------------------------------------------------------------------------------------

// --node-direct only: pull the script back out of `node -e '<script>'`. This exists to DEMONSTRATE
// the blindness that lets a guard ship dead (doubled backslashes survive here that collapse in the real
// bash -> node.exe argv hand-off), never to verify anything.
function scriptOf(command) {
  return command.slice(command.indexOf("node -e ") + "node -e ".length + 1, command.lastIndexOf("'"));
}

// The environment a row runs in. Only the branch-delete and closing-echo rows need one:
// `gh` is pinned to the stub via PATH + a NODE_OPTIONS preload, except for the "missing" row, which
// instead REMOVES the real GitHub CLI from PATH so the guard's spawn errors outright. If a `gh`
// survived elsewhere on that row's PATH it would answer from a fixture repo with no remote and still
// error, so the row still lands on the loud fail-open message - by a different route, which is why
// the stub rows above own the deterministic cases.
function envFor(row, ctx) {
  if (!row.gh) return ENV;
  if (row.gh === "missing") {
    const parts = String(ENV.PATH || "").split(path.delimiter)
      .filter((p) => p.toLowerCase().indexOf("github cli") < 0);
    return Object.assign({}, ENV, { PATH: parts.join(path.delimiter) });
  }
  return Object.assign({}, ENV, {
    PATH: ctx.ghStub.bin + path.delimiter + String(ENV.PATH || ""),
    NODE_OPTIONS: "--require \"" + ctx.ghStub.preload + "\"",
    GUARD_MATRIX_GH: row.gh,
  });
}

function fire(guard, stdin, ctx, row) {
  const opts = { input: stdin, encoding: "utf8", env: envFor(row, ctx), cwd: ctx.root };
  return OPT.nodeDirect
    ? cp.spawnSync("node", ["-e", scriptOf(guard.command)], opts)
    : cp.spawnSync("bash", ["-c", guard.command], opts);
}

function stdinFor(r, repos) {
  if (r.stdinShape === "garbage") return "not json at all {{{";
  const payload = { tool_input: { command: cmdOf(r, repos) }, cwd: repos[r.cwd] };
  if (r.stdinShape !== "no-session") payload.session_id = SID;
  if (r.agent) { payload.agent_id = r.agent; payload.agent_type = "developer"; }
  return JSON.stringify(payload);
}

const display = (s) => s.replace(/\n/g, "\\n").replace(/\t/g, "\\t");

// Three verdicts, not two: a guard may DENY, speak without denying (WARN - the shipped
// CHANGELOG echo's posture, and the branch-delete guard's fail-open), or stay silent (ALLOW). A row
// expecting WARN would be scored green by a two-verdict runner for a guard that merely allows, which
// is the same blindness in the shape the new guards can fail in. A row may also pin `msg`, a
// substring of the guard's own text: a WARN that names the wrong branch, or a MISMATCH that never
// names the vanished heading, is not the verdict under test. Its inverse, `absent`, is a substring
// that must NOT appear - for a hook that legitimately WARNs for one reason while the clause
// under test must stay quiet.
function verdictOf(out) {
  if (out.indexOf("\"permissionDecision\":\"deny\"") >= 0) return "DENY";
  if (out.indexOf("additionalContext") >= 0) return "WARN";
  return "ALLOW";
}

// Score `rows` against `guards`. Returns the failing rows; prints one line per row.
function runRows(rows, guards, ctx) {
  const failures = [];
  for (const r of rows) {
    const guard = guards[r.guard];
    setFlag(ctx.flagFile, r.flag || "none", ctx.repos);
    if (r.state) clState(ctx.repos.changelog, r.state);
    const res = fire(guard, stdinFor(r, ctx.repos), ctx, r);
    const out = res.stdout || "";
    const observed = verdictOf(out);
    const msgMiss = !!r.msg && out.indexOf(r.msg) < 0;
    const absentHit = !!r.absent && out.indexOf(r.absent) >= 0;
    const flagAfter = r.after ? readFlag(ctx.flagFile) : null;
    const flagMiss = !!r.after && !r.after.check(flagAfter, ctx.repos);
    const ok = observed === r.expect && !msgMiss && !absentHit && !flagMiss;
    if (!ok) failures.push(Object.assign({ observed: observed, flagMiss: flagMiss }, r));
    say("  " + (ok ? "PASS" : "FAIL") + " | " + r.id + " | " + r.expect.padEnd(5) + "| got " +
      observed.padEnd(5) + "| " + display(cmdOf(r, ctx.repos)).slice(0, 78));
    if (!ok) {
      say("       note: " + r.note);
      if (msgMiss) say("       missing expected text: " + r.msg + " | said: " + display(out).slice(0, 200));
      if (absentHit) say("       forbidden text present: " + r.absent + " | said: " + display(out).slice(0, 200));
      if (flagMiss) say("       flag file not as required (" + r.after.what + "): " + JSON.stringify(flagAfter).slice(0, 300));
      const err = (res.stderr || "").trim();
      if (err) say("       stderr: " + err.slice(0, 200));
    }
  }
  setFlag(ctx.flagFile, "none");
  return failures;
}

// ---------------------------------------------------------------------------------------------
// [6] The real matrix
// ---------------------------------------------------------------------------------------------

function runMatrix(ctx) {
  say("[1] guards resolved from " + SOURCE_LABEL.settings + " " + PATHS.settings);
  say("    and from " + SOURCE_LABEL.plugin + " " + PATHS.plugin);
  const loaded = loadGuards(PATHS);
  for (const p of loaded.problems) fail(p);
  for (const g of GUARDS) {
    const r = loaded.guards[g.key];
    if (r) pass(g.key + " at " + r.index + " (len=" + r.command.length + " sha256=" + sha12(r.command) + ")");
  }
  for (const n of loaded.notes) warn("NOT controlled here (listed in PLUGIN_UNCOVERED): " + n);
  if (loaded.problems.length) return { guardProblems: loaded.problems.length, failures: [], rows: 0 };

  let failures = [];
  let rows = 0;
  for (const g of GUARDS) {
    const mine = ROWS.filter((r) => r.guard === g.key);
    say("");
    say("[2." + (GUARDS.indexOf(g) + 1) + "] " + g.label + " - " + mine.length + " rows");
    const f = runRows(mine, loaded.guards, ctx);
    say("      " + g.key + ": " + mine.length + " rows, " + f.length + " failed");
    failures = failures.concat(f);
    rows += mine.length;
  }
  return { guardProblems: 0, failures: failures, rows: rows };
}

// ---------------------------------------------------------------------------------------------
// [7] The self-test - the runner proving it can FAIL
// ---------------------------------------------------------------------------------------------
// Runs on EVERY normal run, not only behind its flag. The flag exists to run it alone while working
// on the runner; it is deliberately not the only way to reach it, because an obligation that fires
// only when somebody remembers it goes unexercised - and a control nobody exercised is
// indistinguishable from one that cannot fail.
//
// Each scenario writes a CORRUPTED COPY of the affected guard's SOURCE file (settings.json, or
// the shipped hooks.json) to a temp file and scores that guard's rows through the same on-disk
// load path - the committed files are never touched. Two directions, because a matrix can be blind in
// either: a guard that silently allows everything (the silent-allow shape) is caught only by DENY rows, and
// a guard that denies everything only by ALLOW rows.

const CORRUPTIONS = [
  {
    name: "gate-verdict-neutered",
    guard: "gate-verdict",
    direction: "DENY",
    apply: (cmd) => cmd.split("validate-local").join("no-such-gate-script"),
    why: "the silent-allow shape: the guard loads, throws nothing, and allows every piped read - DENY rows must catch it",
  },
  {
    name: "commit-branch-unconditional",
    guard: "commit-branch",
    direction: "ALLOW",
    apply: (cmd) => cmd.split("branch===\"dev\"||branch===\"main\"").join("true"),
    why: "the opposite failure: the guard denies on every branch - only ALLOW rows catch it",
  },
  {
    name: "branch-delete-never-asks",
    guard: "branch-delete",
    direction: "DENY",
    apply: (cmd) => cmd.split("if(refs.length===0)").join("if(true)"),
    why: "the silent-allow shape on the shipped guard: it parses the command, finds the ref, then returns before " +
      "ever calling gh - DENY rows must catch it, and an open PR would die unmerged with nobody warned",
  },
  {
    name: "changelog-heading-blind",
    guard: "changelog-heading",
    direction: "WARN",
    apply: (cmd) => cmd.split("if(gone.length>0)").join("if(false)"),
    why: "the heading clause reads both versions of the changelog and then reports nothing while the date " +
      "echo still speaks - only the WARN rows' heading-text pins catch it, since the verdict stays WARN",
  },
  // The worktree-targeting behaviours, one corruption each. `FLAG` direction = an `after` flag-file check
  // failed: the marking hooks never change a verdict on the row that does the marking, so a
  // verdict-only self-test could not see them die.
  {
    name: "commit-branch-linked-fail-open",
    guard: "commit-branch",
    direction: "DENY",
    apply: (cmd) => cmd.split("if(w.linked){const gm").join("if(w.linked){return null;const gm"),
    why: "the fail-open restored: a linked worktree's HEAD is never read, so a commit in one checked " +
      "out at dev/main is allowed - the linked-worktree DENY rows must catch it",
  },
  {
    name: "head-freeze-ignores-isolation",
    guard: "head-freeze",
    direction: "ALLOW",
    apply: (cmd) => cmd.split("(typeof en.wc===\"string\"&&en.wc)?").join("false?"),
    why: "every agent treated as not-yet-seen, i.e. presumed in the main checkout - the linked-worktree false positive " +
      "returns, and only the ALLOW rows with an isolated agent catch it",
  },
  {
    name: "head-freeze-never-marks",
    guard: "head-freeze",
    direction: "FLAG",
    apply: (cmd) => cmd.split("en.wc=root;en.isolated=w.linked;").join(""),
    why: "the mark step runs and writes nothing new - every verdict on its own row stays right, so only " +
      "the flag-file checks catch it, and every isolated lane would freeze the main HEAD for its whole life",
  },
  {
    name: "agent-raise-drops-cwd",
    guard: "agent-raise",
    direction: "FLAG",
    apply: (cmd) => cmd.split("if(st.isFile()){").join("if(false){"),
    why: "SubagentStart raises the agent but never records a worktree cwd - silent by construction, so only " +
      "the flag-file check catches it",
  },
  // the echo never denies, so both scenarios stay WARN-or-ALLOW; the first is caught only by the
  // WARN rows' PR-number pins, which is why those rows carry `msg`.
  {
    name: "closing-echo-unbounded",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split(".split(/[;&|\\n)" + BT + "]/)[0].split(/(?:^|\\s)#/)[0]").join(""),
    why: "the unbounded search: the PR number is taken from ANY later segment, so the repro echoes PR #1 - " +
      "still a WARN, so only the rows pinning WHICH PR was fetched catch it",
  },
  {
    name: "closing-echo-no-heredoc-strip",
    guard: "closing-echo",
    direction: "ALLOW",
    apply: (cmd) => cmd.split("const cx=hd(cmd);").join("const cx=cmd;"),
    why: "a merge line inside a data heredoc is read as a command again - caught only by the " +
      "heredoc ALLOW row",
  },
  // both stay WARN (the hook still speaks, just about the wrong repo's PR), so only the rows pinning
  // the fetched repo in `msg` can see them.
  {
    name: "closing-echo-drops-gh-repo",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split("if(!rp)rp=ge;").join(""),
    why: "the broken variant: the GH_REPO env prefix is parsed and never passed on, so #<n> is fetched from " +
      "the hook cwd's repo - the env rows' repo pins catch it",
  },
  {
    name: "closing-echo-drops-pr-url",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split("url||num").join("num"),
    why: "the broken variant: a PR URL is reduced to its number and viewed in the hook cwd's repo - the URL " +
      "rows' repo pins catch it",
  },
  // still a WARN - the hook speaks, about the cwd's host - so only the rows pinning the forwarded host catch it.
  {
    name: "closing-echo-drops-gh-host",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split("{cwd:cwd,env:genv,").join("{cwd:cwd,"),
    why: "the broken variant: the GH_HOST env prefix is parsed and never forwarded, so the PR is fetched from " +
      "the hook cwd's host - the GH_HOST rows' host pins catch it",
  },
  // the earlier-export lookup is shared by both variables; one corruption per family so neither can die
  // unseen behind the other's rows, and one for the headline rule (a bare assignment is NOT exported).
  {
    name: "closing-echo-drops-earlier-gh-repo",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split("return r!==undefined?r:ee(n);").join("return r!==undefined?r:(n===\"GH_REPO\"?\"\":ee(n));"),
    why: "the broken variant for GH_REPO: only the merge's own inline prefix is read, so an earlier `export GH_REPO` " +
      "is ignored and #<n> is fetched from the hook cwd's repo - the earlier-export rows' repo pins catch it",
  },
  {
    name: "closing-echo-drops-earlier-gh-host",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split("return r!==undefined?r:ee(n);").join("return r!==undefined?r:(n===\"GH_HOST\"?\"\":ee(n));"),
    why: "the broken variant for GH_HOST: an earlier `export GH_HOST` is never forwarded, so the PR is fetched " +
      "from the hook cwd's host - the earlier-export rows' host pins catch it",
  },
  {
    name: "closing-echo-bare-assignment-exported",
    guard: "closing-echo",
    direction: "WARN",
    apply: (cmd) => cmd.split("e.v=unq(a[2]);st[a[1]]=e;").join("e.v=unq(a[2]);e.x=true;st[a[1]]=e;"),
    why: "every bare `VAR=v;` read as exported - a variable gh never sees is applied, " +
      "tagging the merge with a repo/host it will not use - the bare-assignment `absent` rows catch it",
  },
];

function runSelfTest(ctx) {
  say("");
  say("[3] self-test - can this runner report FAIL?");
  const live = loadGuards(PATHS);
  if (live.problems.length) {
    fail("self-test cannot run: the guards did not resolve in " + PATHS.settings + " / " + PATHS.plugin);
    return false;
  }

  let allProved = true;
  for (const c of CORRUPTIONS) {
    const target = live.guards[c.guard];
    const copy = JSON.parse(fs.readFileSync(PATHS[target.source], "utf8"));
    let applied = 0;
    copy.hooks[eventOf(target)].forEach((entry) => {
      (entry.hooks || []).forEach((h) => {
        if (String(h.statusMessage || "").indexOf(target.match) < 0) return;
        const corrupted = c.apply(String(h.command));
        // A corruption that silently did not apply would leave the guard intact and the self-test
        // would report "the runner cannot fail" - a false alarm about the wrong thing. Assert it bit.
        if (corrupted === h.command) return;
        h.command = corrupted;
        applied++;
      });
    });
    const brokenPath = path.join(ctx.root, "corrupted-" + c.name + "." + target.source + ".json");
    if (applied !== 1) {
      fail(c.name + ": the corruption did not apply (" + applied + " hook(s) changed) - the guard text " +
        "moved, so this scenario proves nothing. Update its `apply` before trusting any green above.");
      allProved = false;
      continue;
    }
    fs.writeFileSync(brokenPath, JSON.stringify(copy, null, 2));

    const broken = loadGuards(Object.assign({}, PATHS, { [target.source]: brokenPath }));
    if (broken.problems.length) {
      fail(c.name + ": the corrupted copy no longer resolves its guards - " + broken.problems[0]);
      allProved = false;
      continue;
    }
    const mine = ROWS.filter((r) => r.guard === c.guard);
    say("  -- " + c.name + " (" + c.why + ")");
    const failures = runRows(mine, broken.guards, ctx);
    const rightDirection = failures.filter((f) => (c.direction === "FLAG" ? f.flagMiss : f.expect === c.direction));
    if (failures.length === 0) {
      fail(c.name + ": the corrupted guard scored CLEAN - this matrix cannot detect it");
      allProved = false;
    } else if (rightDirection.length === 0) {
      fail(c.name + ": " + failures.length + " row(s) failed but none of the expected-" + c.direction +
        " kind - the rows that should discriminate did not");
      allProved = false;
    } else {
      pass(c.name + ": " + failures.length + " row(s) failed as required (" + rightDirection.length +
        " expected-" + c.direction + "), incl. " + rightDirection.slice(0, 3).map((f) => f.id).join(", "));
    }
    fs.unlinkSync(brokenPath);
  }
  return allProved;
}

// ---------------------------------------------------------------------------------------------
// [8] Main
// ---------------------------------------------------------------------------------------------
function main() {
  if (OPT.help) { usage(); return EXIT_GREEN; }
  const unknown = FLAGS.filter((f) => KNOWN_FLAGS.indexOf(f) < 0 && f.indexOf(HOOKS_FLAG) !== 0);
  if (unknown.length) { fail("unknown option(s): " + unknown.join(" ")); usage(); return EXIT_NO_VERDICT; }
  if (POSITIONAL.length > 1) { fail("expected at most one settings path"); usage(); return EXIT_NO_VERDICT; }
  if (HOOKS_ARGS.length > 1) { fail("expected at most one " + HOOKS_FLAG + "<path>"); usage(); return EXIT_NO_VERDICT; }
  if (!fs.existsSync(SETTINGS_PATH)) { fail("settings file not found: " + SETTINGS_PATH); return EXIT_NO_VERDICT; }
  if (!fs.existsSync(PLUGIN_HOOKS_PATH)) { fail("plugin hooks file not found: " + PLUGIN_HOOKS_PATH); return EXIT_NO_VERDICT; }

  say("guard-matrix - executing the shipped PreToolUse guard strings, " +
    (OPT.nodeDirect ? "node-direct (DIAGNOSTIC)" : "bash -c (production path)"));
  if (OPT.nodeDirect) {
    warn("--node-direct is NOT the control. It bypasses the bash -> node.exe hand-off that can let a");
    warn("      guard ship dead, so its rows can be green while the shipped guard is broken.");
    warn("      This run always exits " + EXIT_DIAGNOSTIC + " and must never be quoted as verification.");
  }

  let ctx = null;
  let exitCode = EXIT_GREEN;
  try {
    const tmp = probeHookTmpdir();
    const built = buildFixtures();
    ctx = {
      root: built.root, repos: built.repos, ghStub: buildGhStub(built.root),
      flagFile: path.join(tmp, "fluyt-live-agents-" + SID + ".json"),
    };
    say("  fixtures: " + ctx.root + "  (dev, main, feature, worktree, wtdev, wtmain, changelog)");
    say("  gh stub: " + path.basename(ctx.ghStub.bin) + " (a node.exe copy named gh, driven by GUARD_MATRIX_GH)");
    say("  hook tmpdir: " + tmp + "  flag file: " + path.basename(ctx.flagFile) + " (fake session id)");
    say("");

    let result = { guardProblems: 0, failures: [], rows: 0 };
    if (!OPT.selfTestOnly) result = runMatrix(ctx);
    const proved = runSelfTest(ctx);

    say("");
    say("-----------------------------------------------------------------");
    const failIds = result.failures.map((f) => f.id);
    // Precedence: an actual mismatch outranks an unproven self-test, because it is the more
    // actionable signal and both exit non-zero anyway. The unproven case gets its own exit code only
    // when everything else is GREEN - that is the dangerous combination (a clean-looking run whose
    // cleanliness is unverified).
    if (!proved && (failIds.length > 0 || result.guardProblems > 0)) {
      warn("the self-test did not prove failability on this settings file - see [3]; the RED below");
      warn("      stands on its own, but re-check [3] before trusting a later GREEN.");
    }
    if (!proved && failIds.length === 0 && result.guardProblems === 0) {
      say("RESULT: NO VERDICT - the self-test could not make this runner report FAIL.");
      say("        A control that cannot fail is the defect this runner exists to prevent. Every");
      say("        PASS above is unproven until [3] is green again.");
      exitCode = EXIT_NO_VERDICT;
    } else if (result.guardProblems > 0) {
      say("RESULT: RED - " + result.guardProblems + " guard identity problem(s); see the FAIL lines in [1].");
      exitCode = EXIT_RED;
    } else if (failIds.length > 0) {
      say("RESULT: RED - " + failIds.length + "/" + result.rows + " row(s) mismatched: " + failIds.join(", "));
      say("        Each FAIL line above carries the note saying what has to be wrong for it to fail.");
      exitCode = EXIT_RED;
    } else if (OPT.selfTestOnly) {
      say("RESULT: GREEN - self-test only: the runner demonstrably reports FAIL on a corrupted guard.");
      say("        The real matrix was NOT run - this is not a verdict on " + SETTINGS_PATH + " or " +
        PLUGIN_HOOKS_PATH + ".");
    } else {
      const bySource = (s) => GUARDS.filter((g) => g.source === s && eventOf(g) === "PreToolUse").length;
      const others = GUARDS.filter((g) => eventOf(g) !== "PreToolUse").map((g) => eventOf(g) + " " + g.key);
      say("RESULT: GREEN - " + result.rows + "/" + result.rows + " rows as expected across " +
        (bySource("settings") + bySource("plugin")) + " PreToolUse guards (" + bySource("settings") +
        " repo-local + " + bySource("plugin") + " shipped)" + (others.length ? " + " + others.join(", ") : "") +
        ", and the self-test proved the runner can report FAIL.");
    }
    if (OPT.nodeDirect) {
      say("");
      say("        DIAGNOSTIC RUN - verdict above is informational only; exiting " + EXIT_DIAGNOSTIC + ".");
      exitCode = EXIT_DIAGNOSTIC;
    }
  } catch (e) {
    say("");
    fail("the runner could not produce a verdict: " + e.message);
    exitCode = EXIT_NO_VERDICT;
  } finally {
    // Torn down on the failure path too - a leftover fixture repo would be scored by the next run's
    // mkdtemp neighbours and a leftover flag file would deny a real HEAD move under a fake session.
    if (ctx) {
      setFlag(ctx.flagFile, "none");
      tearDown(ctx.root);
    }
  }
  return exitCode;
}

process.exit(main());
