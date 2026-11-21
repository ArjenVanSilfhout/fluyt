#!/usr/bin/env node
"use strict";
/*
 * denylist-scan.js - scans text published to GitHub through `gh` against the private denylist the
 * pre-push hook reads, and audits what is already published. One implementation, three callers.
 *
 *   --hook             PreToolUse hook mode (hook JSON on stdin; Bash and PowerShell tools). Exit 0 =
 *                      allow (silent), exit 2 = BLOCK with the reason on stderr.
 *   --file L=PATH      scan a file's contents (repeatable), label L - scripts/publish-release.ps1.
 *   --text-env L=VAR   scan the value of environment variable VAR (repeatable), label L - same caller.
 *   --audit [--repo O/R]
 *                      pull published issues, PRs, comments, reviews, review comments, releases,
 *                      milestones and labels through READ-ONLY `gh api` and scan them. Exit 1 on a
 *                      hit or on any fetch error, else 0.
 *
 * THE DENYLIST: DENYLIST_FILE, else ${XDG_CONFIG_HOME:-$HOME/.config}/denylist/terms.txt - the path and
 * parsing scripts/hooks/pre-push uses (CR stripped, trimmed, blanks and `#` lines ignored,
 * case-insensitive fixed-string match). Never committed, never printed.
 *
 * PRIVACY RULE (non-negotiable): no output of this file - a block reason, an audit location, an error -
 * ever contains a denylist term, a matched line or ANY resolved filesystem path - not the denylist's, not a
 * scanned file's, not a home or temp dir (a hook reason lands in the transcript, and home and temp paths are
 * where a term tends to sit). Sources are named symbolically (DENYLIST_NAME; a --file input by its LABEL).
 * Reasons name the command, the field (a flag name or an ordinal) and a line number. Unexpected exceptions
 * print only the error NAME: a JSON.parse message quotes its input. Matching is in-process string search, no
 * child grep.
 *
 * HOOK MODE DOES NOT INTERPRET SHELL (the decision of 2026-11-15: four fix rounds on a hook that modelled
 * heredocs, pipes, printf, redirections, expansions and PowerShell expressions kept finding one more way to
 * get a term past it, so it stopped modelling them). Two tiers, decided per tool call from tool_input.command:
 *
 *   TIER A - the strict form. The whole command is exactly ONE gh invocation, optionally after exactly one
 *   `cd <path>` joined with `&&` or `;`. strictLex accepts only words whose value is certain without
 *   interpreting anything (grammar below) and rejects everything else. A strict-form command is classified by the
 *   tables below, then: a read-only verb passes; a publishing verb has its FILE flags read (a literal path the
 *   same call cannot have written, UTF-8 text, scanned), its short title-like fields scanned (clean = accepted),
 *   and its inline body or notes REFUSED (write a file in an earlier call). One command means nothing in it can
 *   write the file the hook reads.
 *
 *   TIER B - everything else that mentions gh. The shell parser below is used ONLY to find gh invocations inside
 *   a compound command, never to resolve published text. No gh invocation found (a commit message that mentions
 *   gh, `grep gh docs/`): pass. Every one found positively recognised as read-only: pass. Any one that is
 *   publishing, hard-blocked, unknown or unparseable: BLOCK, "a publishing gh command must be the only command in
 *   the call, in the strict form". Cheap refusals close the wrapper class without interpreting anything and all
 *   BLOCK: a command STRING that mentions gh (or a heredoc or here-string fed to one) handed to a host (an
 *   interpreter, ssh, tmux, trap, read, source, find ...); a script file run in a call that also holds a gh command
 *   as text; a variable, array, alias or git alias that holds a gh command; a command word built from an expansion,
 *   glob or brace, or handed such a string; a gh followed by an expansion (a function forwarding "$@"); `<( )` and
 *   `>( )`; parameter and arithmetic expansions the lexer cannot follow; an encoded PowerShell command (it names no
 *   gh; any prefix of -EncodedCommand, in - -- or / spelling); a gh behind an argument-appending runner (xargs,
 *   parallel, find -exec, fd, entr: what follows gh is not what the scan sees). The gate in front of both tiers is mentionsGh (gh also spelled `g""h`, `g\<LF>h`) or ghGlued (an
 *   expansion, glob or brace token near a gh group and verb); a command through neither is not parsed. These rules
 *   were hardened against a differential fuzz: commands built from contexts x spellings of gh were run under real
 *   bash and PowerShell 7 with a stub gh, and every one in which the stub ran had to block.
 *
 * THE STRICT GRAMMAR (anything else is Tier B). No line break or control character anywhere (leading and
 * trailing blanks are trimmed); no operator, redirection, pipe, comment, continuation, substitution, here-doc,
 * call operator or wrapper; the command word is `gh` or `gh.exe` as a bare word. A word is one of:
 *   - a BARE word of [A-Za-z0-9] and . _ - / : = @ (PowerShell adds the backslash, but not as the last character
 *     and not `@` as the first, which splats). No `$`, backtick, quote, brace, parenthesis, `*?[]~!#;|&<>`, `%`
 *     (PowerShell `--%`) or `,` (PowerShell array).
 *   - SINGLE-quoted: no single quote inside. Bash: literal. PowerShell: the quotes are any of ' and the three
 *     typographic single quotes, none inside; and NO double-quote character of either kind inside, because Windows
 *     PowerShell 5.1 strips an embedded double quote when it builds a native command line (verified on 5.1.x and
 *     7.7), which would let a term be split by one.
 *   - DOUBLE-quoted: none of `$`, backtick, `!` (bash), double quote or typographic double quote. Backslash: banned in
 *     bash (an escape there), allowed in PowerShell (literal there) but not as the last character (a native command
 *     line reads a trailing backslash before a closing quote as an escape).
 * A quoted word must be a whole word (no adjacent text), which also rejects PowerShell's doubled-quote escape.
 *
 * FILES. A FILE flag value must be a literal path that is not `-`, names a regular file, and decodes as UTF-8 (one
 * leading BOM stripped; a NUL byte or invalid UTF-8, so UTF-16 and binary, blocks), at most MAX_FILE_BYTES. A relative
 * path resolves against the hook JSON cwd and is accepted only when the command has no cd prefix; after a cd it must
 * be absolute. On Windows under the Bash tool only X:/ and /x/ drive forms are accepted (another rooted path means
 * the MSYS root to the shell and the current drive to the hook). JSON inputs (--input, --recover) are scanned raw AND
 * as decoded strings; text that is not valid JSON blocks.
 *
 * MATCHING (hitLines): case-insensitive fixed-string after NFKC normalisation and removal of Unicode format
 * characters (zero-width and bidi marks, soft hyphen), applied to text and terms alike; per line, and ALSO against the
 * whole value with line breaks removed and with whitespace runs collapsed to one space (a term split across a line
 * break, or padded with blanks, still matches). NOT applied: diacritic folding, confusable-letter mapping (a Cyrillic
 * lookalike passes), and anything a renderer does that this file cannot know.
 *
 * WHAT GETS SCANNED: VALUES of title-like fields and the CONTENTS of files - never the command line as a whole and
 * never a path (a denylist term often sits in a local temp or home path that is not published). Covered:
 * `gh issue|pr create|edit|comment` (and the `new` aliases of create), `gh pr review|merge|revert`, `gh issue|pr
 * close|reopen -c`, `gh release create|edit`, `gh label create|edit -d`, `gh repo create|edit -d/-h` and `gh api`
 * (-f/--raw-field, -F/--field incl. `@file`, --input), long and short flags, `--flag value`, `--flag=value`, attached
 * `-bvalue` and pflag-style short-flag clusters (`-wb value`: booleans chain, the first value-taking letter takes the
 * rest of the token or the next argument; a letter missing from the SHORTS table blocks; gh has no long-flag prefix
 * matching, verified against gh 2.103.3). A gh api field, @file or --input string is also scanned with its
 * JSON/GraphQL backslash escapes decoded (a GraphQL document is decoded by the server after this scan reads it).
 * Also scanned: release asset labels (`path#label`) and `--attach '<file>#<alt>'` (the alt text after `#`),
 * `gh pr create -T/--template <file>` (a FILE: contents scanned; `gh issue create -T` is a template NAME from the
 * repo's committed templates, not read) and `--recover <file>` (gh's JSON of a failed create).
 *
 * ALLOW ONLY ON POSITIVE RECOGNITION. Whatever follows a gh command word must be placed by the tables below (read
 * from `gh --help`, gh 2.103.3): a covered verb is judged, a known no-text command or verb passes, and everything
 * else BLOCKS: an unknown command or verb (extension, user alias, new gh command), a verb that publishes text this
 * scan does not read (gist, discussion, project item, workflow inputs, variable, agent-task, autolink ...), an
 * unknown long flag on a covered verb, an unknown flag before the verb. Flags before the verb count: cobra pairs a
 * flag it does not know yet (`--x` without `=`, or two characters) with the NEXT word, so `gh -R o/r issue create`
 * and `gh --body x issue comment 1` are real commands and are judged with the verb. These blocks hold in Tier A too.
 *
 * FAILS CLOSED: a missing, unreadable or empty denylist, bad hook JSON, an unparseable gh command, an unsupported
 * tool, a parser step that consumes nothing, or any crash blocks. The saved command in .claude/settings.json tests
 * that the script exists (a fixed message on a miss - node's own "cannot find module" error would print the
 * session-root path) and then runs `timeout 6 node "$s" --hook || { ...; exit 2; }`: a hang is killed by `timeout`
 * and a missing script, node or timeout binary exits non-zero, all turned into exit 2 (a hook the CLIENT times out is
 * a non-blocking error, i.e. an ALLOW, so the bound lives inside the command and the entry's own `timeout` field
 * sits above it). CLAUDE_PROJECT_DIR is the SESSION root, which is this repo's root whenever this settings file is
 * the one loaded; the hook writes no file, so a wrong root cannot misplace output - it can only make the script
 * unreachable, which blocks.
 *
 * Gaps (known; scripts/README.md lists them for people): scripts a command merely runs (`bash x.sh`, `node x.js`)
 * are not entered; non-gh publishing (curl, git push of a tag message, a GitHub UI edit) is not seen - the audit
 * mode and the pre-push hook are the backstops; label/milestone/branch/template NAMES, the bytes of an --attach
 * file, release assets and `issue artifact` files are not scanned; text from commits or tags the push already
 * published (--fill*, --generate-notes, --notes-from-tag) or from an interactive editor or browser (-e, -w) is not
 * scanned and does not block; a file changed between the hook's read and gh's read by ANOTHER process is not seen;
 * a relative path is resolved against the cwd the hook JSON reports; a gh word that is not spelled as gh and that
 * no cheap rule above recognises (a literal alias or a function in a shell profile, a wrapper this file does not
 * list) is not found; and Tier B finds gh invocations with a hand-written lexer, so a construct it mis-lexes can
 * hide one (the refusals above exist to keep that list short, not to make it empty).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

class Fatal extends Error {}
class ParseError extends Error {}

const MAX_FILE_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Denylist and matching
// ---------------------------------------------------------------------------------------------

// How messages name the denylist: by source, never by the resolved path (see PRIVACY RULE).
const DENYLIST_NAME = "DENYLIST_FILE, else the default under the XDG config dir";

function denylistPath() {
  if (process.env.DENYLIST_FILE) return process.env.DENYLIST_FILE;
  const base = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || os.homedir(), ".config");
  return path.join(base, "denylist", "terms.txt");
}

// NFKC folds compatibility forms (fullwidth letters, ligatures); \p{Cf} drops zero-width, bidi and soft-hyphen marks.
const norm = (s) => String(s).normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase();

function loadTerms() {
  let raw;
  try {
    raw = fs.readFileSync(denylistPath(), "utf8");
  } catch (e) {
    throw new Fatal("denylist file missing or unreadable (" + DENYLIST_NAME + "); provision it (one term per line) or " +
      "set DENYLIST_FILE - see scripts/README.md. Publishing through gh is blocked until then.");
  }
  const terms = raw.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").map((t) => t.trim())
    .filter((t) => t !== "" && t.charAt(0) !== "#").map(norm).filter((t) => t !== "");
  if (!terms.length) {
    throw new Fatal("denylist file holds no terms (" + DENYLIST_NAME + ") - refusing to pass an empty check.");
  }
  return terms;
}

// 1-based numbers of the lines holding a term; never the term or the line. A match that spans a line break is
// reported at the line it starts on.
function hitLines(text, terms) {
  const lines = norm(text).split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/);
  const out = new Set();
  lines.forEach((l, i) => { if (terms.some((t) => l.indexOf(t) >= 0)) out.add(i + 1); });
  const flat = [{ sep: "", f: (l) => l }, { sep: " ", f: (l) => l.replace(/\s+/g, " ").trim() }];
  for (const v of flat) {
    let s = "";
    const starts = [];
    lines.forEach((l, i) => {
      const p = v.f(l);
      if (v.sep && p === "") return;
      if (s && v.sep) s += v.sep;
      starts.push([s.length, i + 1]);
      s += p;
    });
    for (const t of terms) {
      for (let at = s.indexOf(t); at >= 0; at = s.indexOf(t, at + 1)) {
        let line = 1;
        for (const st of starts) if (st[0] <= at) line = st[1]; else break;
        out.add(line);
      }
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

const showLines = (ls) => (ls.length === 1 ? "line " : "lines ") + ls.slice(0, 10).join(", ") + (ls.length > 10 ? ", ..." : "");

// ---------------------------------------------------------------------------------------------
// Words, and the strict lexer (Tier A)
// ---------------------------------------------------------------------------------------------

const SQ_PS = "'\u2018\u2019\u201a\u201b";
const DQ_PS = "\"\u201c\u201d\u201e";
const BARE = { sh: /^[A-Za-z0-9._\/:=@-]+$/, ps: /^[A-Za-z0-9._\/:=@\\-]+$/ };
const BSL = String.fromCharCode(92);

// A Word is { parts, q }; parts = { k: "lit", t } | { k: "dyn" }. The strict lexer only ever builds lit words.
const lit = (w) => w.parts.filter((p) => p.k === "lit").map((p) => p.t).join("");
const isDyn = (w) => w.parts.some((p) => p.k !== "lit");
const baseName = (t) => t.split(/[\\/]/).pop().toLowerCase().replace(/\.(?:exe|cmd|bat|com|ps1)$/, "");
const litWord = (t, q) => ({ parts: [{ k: "lit", t: t }], q: !!q });

// A word with its first n static characters removed (a flag prefix such as `--body=` or `-b`).
function sliceWord(w, n) {
  const parts = w.parts.map((p) => Object.assign({}, p));
  if (parts.length && parts[0].k === "lit") {
    parts[0].t = parts[0].t.slice(n);
    if (parts[0].t === "") parts.shift();
  }
  return { parts: parts, q: w.q };
}

// What a rejected character is, for a reason: a punctuation mark by name, never a letter of the command.
function describeChar(c) {
  if (c === "$") return "a dollar sign";
  if (c === "`") return "a backtick";
  if (c === BSL) return "a backslash";
  if (c === "\"" || c === "'" || DQ_PS.indexOf(c) >= 0 || SQ_PS.indexOf(c) >= 0) return "a quote";
  if ("*?[]".indexOf(c) >= 0) return "a wildcard";
  if ("{}".indexOf(c) >= 0) return "a brace";
  if ("()".indexOf(c) >= 0) return "a parenthesis";
  if ("|&<>;".indexOf(c) >= 0) return "an operator";
  if (c === "#") return "a comment mark";
  if (c === "~") return "a tilde";
  if (c === "!") return "an exclamation mark";
  if (c === "%") return "a percent sign";
  if (c === ",") return "a comma";
  if (c === "@") return "an at sign at the start of a word";
  return c.charCodeAt(0) < 128 ? "a punctuation character" : "a non-ASCII character outside quotes";
}

// Returns { ok: true, cd, words } for a strict-form command, else { ok: false, why }.
function strictLex(src, d) {
  const ps = d === "ps";
  if (/[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/.test(src)) return { ok: false, why: "it holds a line break or a control character" };
  const SQ = ps ? SQ_PS : "'";
  const DQ = ps ? DQ_PS : "\"";
  const toks = [];
  const n = src.length;
  let i = 0;
  const bad = (why) => ({ ok: false, why: "word " + (toks.length + 1) + ": " + why });
  while (i < n) {
    const c = src.charAt(i);
    if (c === " " || c === "\t") { i++; continue; }
    if (c === ";") { toks.push({ op: ";" }); i++; continue; }
    if (c === "&" && src.charAt(i + 1) === "&") { toks.push({ op: "&&" }); i += 2; continue; }
    // A word is an optional bare prefix and then an optional quoted string (--title='x', query="x", body=x).
    let j = i;
    while (j < n && " \t;".indexOf(src.charAt(j)) < 0 && !(src.charAt(j) === "&" && src.charAt(j + 1) === "&") &&
        SQ.indexOf(src.charAt(j)) < 0 && DQ.indexOf(src.charAt(j)) < 0) j++;
    const pre = src.slice(i, j);
    if (pre !== "" && !BARE[d].test(pre)) {
      const x = Array.from(pre).find((y) => !BARE[d].test(y)) || pre.charAt(0);
      return bad("a bare word holds " + describeChar(x) + " (quote it, or the command is not in the strict form)");
    }
    if (ps && pre !== "" && (pre.charAt(0) === "@" || pre.charAt(pre.length - 1) === BSL)) return bad("a PowerShell bare word may not start with @ or end in a backslash");
    const tok = { t: pre, q: false };
    i = j;
    if (i < n && (SQ.indexOf(src.charAt(i)) >= 0 || DQ.indexOf(src.charAt(i)) >= 0)) {
      if (ps && pre !== "" && !/^(?:--?)?[A-Za-z][A-Za-z0-9._/:=@-]*=$/.test(pre)) return bad("in PowerShell a quoted string may only follow a name ending in = (--title='x'), not other text");
      const single = SQ.indexOf(src.charAt(i)) >= 0;
      const close = single ? SQ : DQ;
      let e = i + 1;
      while (e < n && close.indexOf(src.charAt(e)) < 0) e++;
      if (e >= n) return bad("a quote is not closed");
      const t = src.slice(i + 1, e);
      if (single && ps && Array.from(t).some((x) => DQ_PS.indexOf(x) >= 0)) {
        return bad("a PowerShell single-quoted string may not hold a double-quote character (Windows PowerShell drops it from a native command line)");
      }
      if (!single) {
        const x = Array.from(t).find((y) => y === "$" || y === "`" || (!ps && (y === BSL || y === "!")));
        if (x) return bad("a double-quoted string may not hold " + describeChar(x) + " (use a single-quoted string)");
      }
      if (ps && t.charAt(t.length - 1) === BSL) return bad("a string may not end in a backslash");
      tok.t += t;
      tok.q = true;
      i = e + 1;
      const nx = src.charAt(i);
      if (i < n && nx !== " " && nx !== "\t" && nx !== ";" && !(nx === "&" && src.charAt(i + 1) === "&")) {
        return bad("text may not follow a quoted string (a quoted string ends its word; PowerShell also reads a doubled quote as an escape)");
      }
    }
    if (tok.t === "") return bad("an empty string (Windows PowerShell 5.1 drops it from a native command line, shifting the arguments)");
    toks.push(tok);
  }
  let k = 0;
  let cd = null;
  if (toks.length && !toks[0].op && !toks[0].q && toks[0].t === "cd") {
    if (toks.length < 4 || toks[1].op || toks[2].op !== ";" && toks[2].op !== "&&") {
      return { ok: false, why: "it is not a single gh invocation (a cd must be followed by one path and then && or ;)" };
    }
    if (toks[1].t === "" || toks[1].t.charAt(0) === "-") return { ok: false, why: "the cd target is not a plain path" };
    cd = toks[1].t;
    k = 3;
  }
  const g = toks[k];
  if (!g || g.op || g.q || (g.t !== "gh" && g.t !== "gh.exe")) return { ok: false, why: "it is not a single gh invocation" };
  const rest = toks.slice(k + 1);
  if (rest.some((t) => t.op)) return { ok: false, why: "it holds more than one command (an operator after the gh command)" };
  return { ok: true, cd: cd, words: toks.slice(k).map((t) => litWord(t.t, t.q)) };
}

// ---------------------------------------------------------------------------------------------
// Parser (Tier B): a small bash / PowerShell lexer that only FINDS commands. d = "sh" | "ps".
// Segment = { words, stdin, piped, heredoc }; Word = { parts, q }, parts = lit | dyn.
// ---------------------------------------------------------------------------------------------

const mkSeg = () => ({ words: [], stdin: false, piped: false, heredoc: null });

class Parser {
  constructor(src, d, segs) {
    this.s = src;
    this.i = 0;
    this.d = d;
    this.segs = segs || [];
  }

  parseList(close) {
    const s = this.s;
    let seg = mkSeg();
    let pend = [];
    const end = (sep) => {
      if (seg.words.length || seg.stdin) this.segs.push(seg);
      seg = mkSeg();
      seg.piped = sep === "|";
    };
    while (this.i < s.length) {
      const at = this.i;
      const c = s.charAt(this.i);
      if (c === "\n") {
        this.i++;
        if (pend.length) { this.heredocBodies(pend); pend = []; }
        end("\n");
      } else if (/\s/.test(c)) {
        this.i++;
      } else if (c === "<" && this.d === "ps" && s.charAt(this.i + 1) === "#") {
        const e = s.indexOf("#>", this.i + 2);
        if (e < 0) throw new ParseError("unterminated block comment");
        this.i = e + 2;
      } else if (c === "#") {
        while (this.i < s.length && s.charAt(this.i) !== "\n") this.i++;
      } else if (c === ")") {
        this.i++;
        end(";");
        if (close) return;
      } else if (c === ";") {
        this.i++; end(";");
      } else if (c === "&" && s.charAt(this.i + 1) === ">") {
        this.redirect(seg, pend);
      } else if (c === "&") {
        this.i += s.charAt(this.i + 1) === "&" ? 2 : 1; end("&&");
      } else if (c === "|") {
        const two = s.charAt(this.i + 1) === "|";
        this.i += two ? 2 : (s.charAt(this.i + 1) === "&" ? 2 : 1);
        end(two ? "||" : "|");
      } else if (c === ">" || (c === "<" && this.d === "sh") ||
          (/[0-9]/.test(c) && (s.charAt(this.i + 1) === ">" || (s.charAt(this.i + 1) === "<" && this.d === "sh")))) {
        this.redirect(seg, pend);
      } else if (c === "(" && this.d === "sh") {
        this.i++;
      } else {
        const w = this.readWord();
        if (w.parts.length || w.q) seg.words.push(w);
      }
      if (this.i === at) throw new ParseError("the parser made no progress");
    }
    if (close) throw new ParseError("unterminated substitution");
    end(";");
  }

  // A redirection: its operand word is consumed so it is not read as an argument. A heredoc is only SKIPPED (its body
  // is data); `<(` and `>(` run a command list, which is parsed like a substitution.
  redirect(seg, pend) {
    const s = this.s;
    let j = this.i;
    if (s.charAt(j) === "&") j++;
    while (/[0-9]/.test(s.charAt(j))) j++;
    let op = null;
    for (const o of ["<<<", "<<-", "<<", ">>", ">&", "<&", ">|", ">", "<"]) {
      if (s.startsWith(o, j) && !((o === "<<-" || o === "<<") && this.d !== "sh")) { op = o; break; }
    }
    if (!op) { this.i = j + 1; return; }
    j += op.length;
    if ((op === "<" || op === ">") && this.d === "sh" && s.charAt(j) === "(") {
      this.i = j + 1;
      this.parseList(")");
      seg.stdin = seg.stdin || op === "<";
      return;
    }
    if (op === ">&" || op === "<&") {
      if (/[0-9-]/.test(s.charAt(j))) { while (/[0-9-]/.test(s.charAt(j))) j++; this.i = j; return; }
    }
    while (s.charAt(j) === " " || s.charAt(j) === "\t") j++;
    this.i = j;
    const w = this.readWord();
    seg.stdin = seg.stdin || op.charAt(0) === "<";
    if (op === "<<<") seg.inText = (seg.inText || "") + "\n" + lit(w);
    if (op === "<<" || op === "<<-") pend.push({ seg: seg, delim: lit(w), strip: op === "<<-", quoted: w.q });
  }

  heredocBodies(pend) {
    const s = this.s;
    for (const p of pend) {
      const body = [];
      while (this.i < s.length) {
        let e = s.indexOf("\n", this.i);
        if (e < 0) e = s.length;
        const line = s.slice(this.i, e).replace(/\r$/, "");
        this.i = Math.min(e + 1, s.length);
        if ((p.strip ? line.replace(/^\t+/, "") : line) === p.delim) break;
        body.push(p.strip ? line.replace(/^\t+/, "") : line);
      }
      const text = body.join("\n");
      p.seg.heredoc = { text: text, dyn: !p.quoted && /\$[A-Za-z_{(]|`/.test(text) };
      p.seg.inText = (p.seg.inText || "") + "\n" + text;
    }
  }

  readWord() {
    const s = this.s;
    const d = this.d;
    const w = { parts: [], q: false };
    const put = (t) => {
      const L = w.parts[w.parts.length - 1];
      if (L && L.k === "lit") L.t += t; else w.parts.push({ k: "lit", t: t });
    };
    if (d === "ps" && s.charAt(this.i) === "@" && /['"\u2018\u2019\u201c\u201d]/.test(s.charAt(this.i + 1))) {
      const m = /^@(['"\u2018\u2019\u201c\u201d])[ \t]*\r?\n/.exec(s.slice(this.i, this.i + 40));
      if (m) {
        const dq = DQ_PS.indexOf(m[1]) >= 0;
        const from = this.i + m[0].length;
        const tm = new RegExp("(?:^|\\r?\\n)[" + (dq ? DQ_PS : SQ_PS) + "]@").exec(s.slice(from));
        if (!tm) throw new ParseError("unterminated here-string");
        const text = s.slice(from, from + tm.index);
        this.i = from + tm.index + tm[0].length;
        put(text);
        if (dq && text.indexOf("$(") >= 0) w.hereText = text;
        if (dq && /\$[A-Za-z_{(]/.test(text)) w.parts.push({ k: "dyn" });
        w.q = true;
        return w;
      }
    }
    if (d === "ps" && s.charAt(this.i) === "@" && /[A-Za-z_]/.test(s.charAt(this.i + 1))) {
      this.i++;
      while (/[A-Za-z0-9_]/.test(s.charAt(this.i))) this.i++;
      w.parts.push({ k: "dyn" });
      w.splat = true;
      return w;
    }
    while (this.i < s.length) {
      const c = s.charAt(this.i);
      if (/[\s;|&>)]/.test(c) || (c === "<" && d === "sh") || (c === "<" && s.charAt(this.i + 1) === "#")) break;
      if (d === "sh") {
        if (c === BSL) {
          const nx = s.charAt(this.i + 1);
          if (nx === "\n") this.i += 2;
          else if (nx === "\r" && s.charAt(this.i + 2) === "\n") this.i += 3;
          else { w.q = true; put(nx); this.i += 2; }
        } else if (c === "'") {
          const e = s.indexOf("'", this.i + 1);
          if (e < 0) throw new ParseError("unterminated single quote");
          put(s.slice(this.i + 1, e)); w.q = true; this.i = e + 1;
        } else if (c === "\"") {
          this.i++; w.q = true; this.dq(w, put);
        } else if (c === "$" && s.charAt(this.i + 1) === "'") {
          let j = this.i + 2;
          while (j < s.length && s.charAt(j) !== "'") j += s.charAt(j) === BSL ? 2 : 1;
          if (j >= s.length) throw new ParseError("unterminated $'...'");
          w.parts.push({ k: "dyn" }); w.q = true; this.i = j + 1;
        } else if (c === "$") {
          this.dollar(w, put, false);
        } else if (c === "`") {
          this.backtick(w, false);
        } else { put(c); this.i++; }
      } else {
        if (c === "`") {
          const nx = s.charAt(this.i + 1);
          if (nx === "\n") this.i += 2;
          else if (nx === "\r" && s.charAt(this.i + 2) === "\n") this.i += 3;
          else { w.q = true; put(nx); this.i += 2; }
        } else if (SQ_PS.indexOf(c) >= 0) {
          this.i++; w.q = true;
          for (;;) {
            if (this.i >= s.length) throw new ParseError("unterminated single quote");
            const x = s.charAt(this.i);
            if (SQ_PS.indexOf(x) >= 0) {
              if (SQ_PS.indexOf(s.charAt(this.i + 1)) >= 0 && this.i + 1 < s.length) { put(x); this.i += 2; continue; }
              this.i++; break;
            }
            put(x); this.i++;
          }
        } else if (DQ_PS.indexOf(c) >= 0) {
          this.i++; w.q = true; this.dq(w, put);
        } else if (c === "$") {
          this.dollar(w, put, false);
        } else if (c === "(") {
          this.i++;
          this.parseList(")");
          w.parts.push({ k: "dyn", inq: false });
        } else { put(c); this.i++; }
      }
    }
    return w;
  }

  dq(w, put) {
    const s = this.s;
    const ps = this.d === "ps";
    while (this.i < s.length) {
      const c = s.charAt(this.i);
      if (ps ? DQ_PS.indexOf(c) >= 0 : c === "\"") {
        if (ps && DQ_PS.indexOf(s.charAt(this.i + 1)) >= 0 && this.i + 1 < s.length) { put(c); this.i += 2; continue; }
        this.i++;
        return;
      }
      if (!ps && c === BSL) {
        const nx = s.charAt(this.i + 1);
        if (nx !== "" && ("$`\"" + BSL + "\n").indexOf(nx) >= 0) { if (nx !== "\n") put(nx); this.i += 2; } else { put(c); this.i++; }
      } else if (ps && c === "`") {
        const nx = s.charAt(this.i + 1);
        if (nx !== "\n") put(nx);
        this.i += 2;
      } else if (c === "$") {
        this.dollar(w, put, true);
      } else if (!ps && c === "`") {
        this.backtick(w, true);
      } else { put(c); this.i++; }
    }
    throw new ParseError("unterminated double quote");
  }

  dollar(w, put, inq) {
    const s = this.s;
    const nx = s.charAt(this.i + 1);
    if (nx === "(") {
      if (this.d === "sh" && s.charAt(this.i + 2) === "(") throw new ParseError("arithmetic expansion");
      this.i += 2;
      this.parseList(")");
      w.parts.push({ k: "dyn", inq: inq });
    } else if (nx === "[" && this.d === "sh") {
      throw new ParseError("arithmetic expansion");
    } else if (nx === "{") {
      const e = s.indexOf("}", this.i);
      if (e < 0) throw new ParseError("unterminated ${");
      if (/['"`${(\\\n]/.test(s.slice(this.i + 2, e))) throw new ParseError("a parameter expansion with quotes or nesting");
      w.parts.push({ k: "dyn", inq: inq }); this.i = e + 1;
    } else if (/[A-Za-z_]/.test(nx)) {
      this.i++;
      while (/[A-Za-z0-9_]/.test(s.charAt(this.i)) || (this.d === "ps" && s.charAt(this.i) === ":" && /[A-Za-z_]/.test(s.charAt(this.i + 1)))) this.i++;
      w.parts.push({ k: "dyn", inq: inq });
    } else if (/[0-9@*#?$!-]/.test(nx) && nx !== "") {
      w.parts.push({ k: "dyn", inq: inq }); this.i += 2;
    } else { put("$"); this.i++; }
  }

  backtick(w, inq) {
    const s = this.s;
    let j = this.i + 1;
    while (j < s.length && s.charAt(j) !== "`") j += s.charAt(j) === BSL ? 2 : 1;
    if (j >= s.length) throw new ParseError("unterminated backtick substitution");
    const segs = [];
    new Parser(s.slice(this.i + 1, j), this.d, segs).parseList(null);
    for (const x of segs) this.segs.push(x);
    w.parts.push({ k: "dyn", inq: inq });
    this.i = j + 1;
  }
}

// ---------------------------------------------------------------------------------------------
// gh command model
// ---------------------------------------------------------------------------------------------

const T = "text";
const F = "file";
// fileOnly: an inline value of this flag is refused (the decision: bodies and notes come from a file).
const BODY = [{ l: "body", s: "b", k: T, fileOnly: true }, { l: "body-file", s: "F", k: F }];
const NOTES = [{ l: "notes", s: "n", k: T, fileOnly: true }, { l: "notes-file", s: "F", k: F }];
const TITLE = { l: "title", s: "t", k: T };
const COMMENT = { l: "comment", s: "c", k: T };
const DESC = { l: "description", s: "d", k: T };
// --attach '<file>#<alt text>': only the alt text is published text (the file's bytes are out of scope).
// --recover <file>: gh's saved input of a failed create (JSON). pr create -T/--template is a FILE (starting body
// text); issue create -T/--template is a template NAME looked up in the repo's committed templates (not scanned).
const ATTACH = { l: "attach", s: null, k: "attach" };
const RECOVER = { l: "recover", s: null, k: "recover" };
const SPECS = {
  "issue create": BODY.concat([TITLE, ATTACH, RECOVER]), "issue edit": BODY.concat([TITLE, ATTACH]),
  "pr create": BODY.concat([TITLE, ATTACH, RECOVER, { l: "template", s: "T", k: F }]), "pr edit": BODY.concat([TITLE, ATTACH]),
  "issue comment": BODY.concat([ATTACH]), "pr comment": BODY.concat([ATTACH]), "pr review": BODY,
  "pr merge": BODY.concat([{ l: "subject", s: "t", k: T }]), "pr revert": BODY.concat([TITLE]),
  "release create": NOTES.concat([TITLE]), "release edit": NOTES.concat([TITLE]),
  "issue close": [COMMENT], "issue reopen": [COMMENT], "pr close": [COMMENT], "pr reopen": [COMMENT],
  "label create": [DESC], "label edit": [DESC],
  "repo create": [DESC, { l: "homepage", s: "h", k: T }], "repo edit": [DESC, { l: "homepage", s: "h", k: T }],
};
const API = [{ l: "raw-field", s: "f", k: "raw" }, { l: "field", s: "F", k: "typed" }, { l: "input", s: null, k: "input" }];
const GROUPS = ["issue", "pr", "release", "label", "repo", "api"];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// ALLOW only on POSITIVE recognition: everything below is read from `gh --help` and `gh <group> [<verb>] --help`
// (gh 2.103.3), and anything after a gh command word that these tables do not place BLOCKS.
// Verb aliases (the ALIASES section of each verb's help). A user's own `gh alias set` aliases live in gh's config:
// they are not in any table here, so they are an unknown command or verb and block.
const ALIASES = { "issue new": "issue create", "pr new": "pr create", "release new": "release create", "repo new": "repo create" };
// Verbs of a covered group that publish no free text through a flag (includes the read-only aliases ls and co).
const SAFE_VERBS = {
  issue: ["list", "ls", "status", "view", "delete", "develop", "lock", "pin", "transfer", "unlock", "unpin"],
  pr: ["list", "ls", "status", "view", "checkout", "co", "checks", "diff", "lock", "ready", "unlock", "update-branch"],
  release: ["list", "ls", "view", "delete", "delete-asset", "download", "upload", "verify", "verify-asset"],
  label: ["list", "ls", "clone", "delete"],
  repo: ["list", "ls", "view", "archive", "clone", "delete", "fork", "read-dir", "read-file", "rename", "set-default", "sync",
    "unarchive"],
};
// Sub-groups one level down: only the listed sub-verbs publish nothing; create/edit/add publish text or files unread.
const SUBGROUPS = {
  "issue artifact": ["delete", "download", "list", "view"],
  "repo autolink": ["delete", "list", "view"], "repo deploy-key": ["delete", "list"],
  "repo gitignore": ["list", "view"], "repo license": ["list", "view"],
};
// Top-level commands outside the covered groups. ANY = no verb publishes text to others; an array = the verbs that
// publish none, every other verb of it blocks (it publishes text this scan does not read: a gist, a discussion, a
// project item, an agent-task prompt, workflow inputs, a repository variable, a skill, an alias or extension that runs
// commands). A word in no table (an extension, a user alias, a command new to gh) blocks.
const ANY = true;
const OTHER_TOP = {
  "agent-task": ["list", "view"], alias: ["delete", "list"], attestation: ANY, auth: ANY, browse: ANY, cache: ANY,
  codespace: ANY, completion: ANY, config: ANY, discussion: ["list", "view"], extension: ["browse", "create", "install", "list", "remove", "search", "upgrade"],
  gist: ["clone", "delete", "list", "view"], "gpg-key": ANY, help: ANY, licenses: ANY, org: ANY, preview: ANY,
  project: ["close", "delete", "field-delete", "field-list", "item-add", "item-archive", "item-delete", "item-list", "link", "list",
    "mark-template", "unlink", "view"],
  ruleset: ANY, run: ANY, search: ANY, secret: ANY, skill: ["install", "list", "preview", "search", "update"], "ssh-key": ANY,
  status: ANY, variable: ["delete", "get", "list"], workflow: ["disable", "enable", "list", "view"], co: ANY,
};
// Long flags of each covered command (the FLAGS section of its help). A long flag in neither this table nor SPECS BLOCKS:
// a text flag added by a newer gh must not pass unscanned. `help` and `repo` are accepted everywhere.
const LONGS = {
  "issue create": "assignee attach blocked-by blocking body body-file editor label milestone parent project recover template title type web",
  "pr create": "assignee attach base body body-file draft dry-run editor fill fill-first fill-verbose head label milestone no-maintainer-edit project recover reviewer template title web",
  "issue comment": "attach body body-file create-if-none delete-last edit-last editor web yes",
  "issue edit": "add-assignee add-blocked-by add-blocking add-label add-project add-sub-issue attach body body-file milestone parent remove-assignee remove-blocked-by remove-blocking remove-label remove-milestone remove-parent remove-project remove-sub-issue remove-type title type",
  "pr edit": "add-assignee add-label add-project add-reviewer attach base body body-file milestone remove-assignee remove-label remove-milestone remove-project remove-reviewer title",
  "pr comment": "attach body body-file create-if-none delete-last edit-last editor web yes",
  "pr review": "approve body body-file comment request-changes",
  "pr merge": "admin author-email auto body body-file delete-branch disable-auto match-head-commit merge rebase squash subject",
  "pr revert": "body body-file draft title",
  "release create": "discussion-category draft fail-on-no-commits generate-notes latest notes notes-file notes-from-tag notes-start-tag prerelease target title verify-tag",
  "release edit": "discussion-category draft latest notes notes-file prerelease tag target title verify-tag",
  "issue close": "comment duplicate-of reason", "issue reopen": "comment", "pr close": "comment delete-branch", "pr reopen": "comment",
  "label create": "color description force", "label edit": "color description name",
  "repo create": "add-readme clone description disable-issues disable-wiki gitignore homepage include-all-branches internal license private public push remote source team template",
  "repo edit": "accept-visibility-change-consequences add-topic allow-forking allow-update-branch default-branch delete-branch-on-merge description enable-advanced-security enable-auto-merge enable-discussions enable-issues enable-merge-commit enable-projects enable-rebase-merge enable-secret-scanning enable-secret-scanning-push-protection enable-squash-merge enable-wiki homepage remove-topic squash-merge-commit-message template visibility",
  api: "allow-escape-sequences cache field header hostname include input jq method paginate preview raw-field silent slurp template verbose",
};
// Short flags per covered command, read from `gh <group> <verb> --help` (gh 2.103.3). b = boolean letters, v = value-taking
// letters that publish no scanned text (a repo, a label, a base branch ...); the TEXT letters come from SPECS. gh parses
// pflag-style: in `-xyz` every letter is a flag, booleans chain, and the FIRST value-taking letter takes the rest of the
// token (after an optional `=`), or the next argument when nothing remains. A letter in no list BLOCKS (it could be a
// text flag of a newer gh), as does a missing table row (asserted below).
const SHORTS = {
  "issue create": { b: "ew", v: "almpTR" }, "issue edit": { b: "", v: "mR" },
  "issue comment": { b: "ew", v: "R" }, "issue close": { b: "", v: "rR" }, "issue reopen": { b: "", v: "R" },
  "pr create": { b: "defw", v: "aBHlmprR" }, "pr edit": { b: "", v: "BmR" },
  "pr comment": { b: "ew", v: "R" }, "pr review": { b: "acr", v: "R" }, "pr merge": { b: "dmrs", v: "AR" },
  "pr revert": { b: "d", v: "R" }, "pr close": { b: "d", v: "R" }, "pr reopen": { b: "", v: "R" },
  "release create": { b: "dp", v: "R" }, "release edit": { b: "", v: "R" },
  "label create": { b: "f", v: "cR" }, "label edit": { b: "", v: "cnR" },
  "repo create": { b: "c", v: "glrstp" }, "repo edit": { b: "", v: "" },
  api: { b: "i", v: "HXpqt" },
};
for (const key of Object.keys(SPECS).concat(["api"])) {
  const sh = SHORTS[key];
  const text = (key === "api" ? API : SPECS[key]).map((f) => f.s).filter((x) => x);
  if (!sh || text.some((x) => (sh.b + sh.v).indexOf(x) >= 0)) throw new Error("short-flag table out of step with SPECS: " + key);
  const longs = own(LONGS, key) ? LONGS[key].split(" ") : null;
  if (!longs || (key === "api" ? API : SPECS[key]).some((f) => longs.indexOf(f.l) < 0)) throw new Error("long-flag table out of step with SPECS: " + key);
}

// Hosts: commands that run a command STRING or a command word they are given. A gh word that is a separate argument
// of one is judged as gh; a STRING argument that mentions gh blocks (nothing here reads inside a string).
const HOSTS = ["bash", "sh", "zsh", "dash", "ksh", "fish", "pwsh", "powershell", "cmd", "eval", "iex", "invoke-expression",
  "invoke-command", "icm", "start-process", "saps", "start", "ssh", "su", "runuser", "wsl", "find", "parallel", "script", "watch", "sg",
  "python", "python3", "py", "node", "nodejs", "deno", "bun", "perl", "ruby", "php", "lua", "awk", "gawk", "tmux", "screen", "flock",
  "at", "batch", "nsenter", "chroot", "unshare", "systemd-run", "docker", "podman", "kubectl", "busybox", "source", ".", "trap", "read", "mapfile", "readarray"];
// Words a command can sit behind: shell keywords, and prefix commands that run the NEXT command (name: the short options
// that take a separate value). Options of a wrapper that this table does not list make the scan look at a different word:
// a gh behind them is then judged by the looser rule (see analyzeB).
const STDIN_HOSTS = ["bash", "sh", "zsh", "dash", "ksh", "fish", "pwsh", "powershell", "cmd", "iex", "invoke-expression", "python", "python3", "py", "node", "perl", "ruby", "php", "lua", "source", "."];
const STRING_HOSTS = ["eval", "iex", "invoke-expression", "invoke-command", "icm", "start-process", "saps", "ssh"];
const STRING_FLAG = /^(?:-[A-Za-z]*[ceS]|-(?:c|e|ec|command|encodedcommand)|[/][ck])$/i;
// PowerShell takes any prefix of -EncodedCommand (min -e) and the alias -ec, in -, -- or / spelling, case-insensitive, with an optional :value.
const isEncArg = (t) => { const m = /^(?:--?|[/])([A-Za-z]+)(?:[:=].*)?$/.exec(t); const n = m === null ? "" : m[1].toLowerCase(); return n === "ec" || (n !== "" && n.charAt(0) === "e" && "encodedcommand".indexOf(n) === 0); };
// Runners that append arguments (stdin, -a file, {}) to the command they start: a gh behind one cannot be judged at all.
const APPENDERS = ["xargs", "parallel", "find", "fd", "fdfind", "entr", "rush"];
const KEYWORDS = ["if", "then", "else", "elif", "do", "while", "until", "!", "{"];
const PS_PAREN = ["if", "elseif", "while", "until", "foreach", "for", "switch"];
const ALIAS_CMDS = ["alias", "set-alias", "new-alias", "sal", "nal"];
const WRAPPERS = { env: "uCS", sudo: "ughprtCDUT", doas: "uC", timeout: "sk", nice: "n", nohup: "", command: "",
  builtin: "", exec: "a", setsid: "", stdbuf: "ioe", ionice: "cnp", unbuffer: "", time: "" };
const GH_RE = /(?:^|[^A-Za-z0-9_-])gh(?:\.exe)?(?![A-Za-z0-9_-])/i;
// A command that mentions gh, also in the spellings the shell would unquote (`g""h`, `g\h`, ps `g``h`): the gate that decides
// whether a command is parsed at all.
const UNQUOTE = new Set(["\"", "'", "`", "^", BSL].concat(SQ_PS.split(""), DQ_PS.split("")));
// Text that holds a whole gh command (`gh issue create ...`), also in the spellings the shell would unquote.
const GH_CMD_RE = /(?:^|[^A-Za-z0-9_-])gh(?:\.exe)?\s+(?:-\S+\s+)*(?:issue|pr|release|label|repo|api|gist|workflow|variable|discussion|project|extension|alias)\s+\S/i;
const ghCmdText = (s) => {
  const joined = s.replace(/[\\`]\r?\n/g, "");
  return GH_CMD_RE.test(s) || GH_CMD_RE.test(Array.from(joined).filter((c) => !UNQUOTE.has(c)).join(""));
};
const mentionsGh = (s) => {
  const joined = s.replace(/[\\`]\r?\n/g, "");
  return GH_RE.test(s) || GH_RE.test(Array.from(joined).filter((c) => !UNQUOTE.has(c)).join(""));
};
// The second half of the gate: a gh word that is not spelled `gh` at all (`g$()h`, `g${x}h`, `g?`, an expansion in the
// command position) is a token with an expansion, glob or brace char followed within a few words by a gh group and verb.
const RISKY = /[$`*?[{(]/;
const GH_VERBS = ["create", "new", "edit", "comment", "close", "reopen", "review", "merge", "revert"];
function ghGlued(s) {
  const et = s.split(/\s+/);
  for (let i = 0; i < et.length; i++) if ((isEncArg(et[i]) && /^[A-Za-z0-9+/=]{16,}$/.test(et[i + 1] || "")) || (/[:=]/.test(et[i]) && isEncArg(et[i].replace(/[:=].*/, "")) && /^[A-Za-z0-9+/=]{16,}$/.test(et[i].replace(/^[^:=]*[:=]/, "")))) return true;
  const tk = s.toLowerCase().split(/\s+/);
  for (let i = 0; i < tk.length; i++) {
    if (!RISKY.test(tk[i])) continue;
    for (let k = i + 1; k < Math.min(tk.length, i + 6); k++) {
      const a = tk[k];
      const b = tk[k + 1] || "";
      if (["issue", "pr", "release", "label", "repo"].indexOf(a) >= 0 && GH_VERBS.indexOf(b) >= 0) return true;
      if (["api", "project", "discussion", "extension"].indexOf(a) >= 0) return true;
      if ((a === "gist" && (b === "create" || b === "edit")) || (a === "workflow" && b === "run") || (a === "variable" && b === "set")) return true;
    }
  }
  return false;
}

const ghish = (s) => mentionsGh(s) || ghGlued(s);
const ADVICE = "write the text to a file in an earlier call and pass --body-file <path> (--notes-file <path> for release notes)";
const B_MSG = "a publishing gh command must be the only command in the call (at most one cd <dir> before it), in the strict form " +
  "(literal words, text from a file written in an earlier call; see scripts/README.md)";

// Walk one short-flag token letter by letter (see SHORTS). Returns { flag, rest } at the first TEXT flag (rest = the
// attached value, else null: the value is the next argument), { awaits } after a value-taking non-text flag (its value
// is not published text; awaits = gh takes the NEXT argument as it), or { problem }.
function walkShorts(w, lead, spec, sh) {
  for (let i = 1; i < lead.length; i++) {
    const ch = lead.charAt(i);
    const f = spec.find((x) => x.s === ch);
    if (f) {
      const rest = sliceWord(w, i + 1 + (lead.charAt(i + 1) === "=" ? 1 : 0));
      return { flag: f, rest: rest.parts.length ? rest : null };
    }
    if (sh.v.indexOf(ch) >= 0) {
      return isDyn(w) ? { problem: "a short flag built from an expansion cannot be checked" } : { awaits: i + 1 >= lead.length };
    }
    if (sh.b.indexOf(ch) < 0) return { problem: "the short flag cluster holds a letter this scan does not know (it could be a text flag)" };
  }
  return isDyn(w) ? { problem: "a short flag cluster built from an expansion cannot be checked" } : { awaits: false };
}

// Walk the flags of one gh invocation; push scans and problems onto ctx. In Tier B only the classification matters
// (a text flag = publishing), the values are never resolved.
function ghFlags(args, spec, sh, name, ctx) {
  let prevFlag = false;
  let ordinal = 0;
  for (let a = 0; a < args.length; a++) {
    const w = args[a];
    const t = lit(w);
    const dyn = isDyn(w);
    let flag = null;
    let val = null;
    let awaits = null;
    const lead = w.parts.length && w.parts[0].k === "lit" ? w.parts[0].t : "";
    if (!dyn && t === "--") break;
    if (t.indexOf("--") === 0) {
      const eq = t.indexOf("=");
      const nm = eq < 0 ? t.slice(2) : t.slice(2, eq);
      flag = spec.find((f) => f.l === nm) || null;
      if (flag) val = eq >= 0 ? sliceWord(w, eq + 1) : args[++a] || null;
      else if (nm !== "help" && nm !== "repo" && LONGS[name.slice(3)].split(" ").indexOf(nm) < 0) {
        ctx.problems.push(name + ": a long flag this scan does not know (it could be a text flag of a newer gh); re-read the gh help into the tables");
      }
    } else if (/^-[A-Za-z]/.test(lead)) {
      const c = walkShorts(w, lead, spec, sh);
      if (c.problem) { ctx.problems.push(name + ": " + c.problem); prevFlag = false; continue; }
      flag = c.flag || null;
      if (flag) val = c.rest || args[++a] || null; else awaits = c.awaits;
    }
    if (!flag) {
      if (awaits !== null) { prevFlag = awaits; continue; }
      if (dyn && t.charAt(0) === "-") {
        ctx.problems.push(name + ": a flag name built from an expansion cannot be checked");
      } else if (dyn && !prevFlag && !(ctx.d === "ps" ? !w.splat : w.parts.every((p) => p.k === "lit" || p.inq))) {
        ctx.problems.push(name + ": an unquoted expansion could hide a --body/--title flag");
      }
      prevFlag = t.charAt(0) === "-" && t.indexOf("=") < 0 && !dyn;
      continue;
    }
    prevFlag = false;
    ctx.pub.v = true;
    if (ctx.tier === "B") {
      if (!ctx.bNamed[name]) { ctx.bNamed[name] = true; ctx.problems.push(name + ": " + B_MSG); }
      continue;
    }
    const disp = flag.s === null || name.indexOf("api") < 0 ? "--" + flag.l : (flag.k === "raw" ? "-f" : "-F") + " #" + (++ordinal);
    if (!val) { ctx.problems.push(name + " " + disp + ": flag has no value"); continue; }
    scanValue(flag, lit(val), name + " " + disp, ctx);
  }
}

// Tier A: a flag value of a strict-form command (always a literal).
function scanValue(flag, text, label, ctx) {
  const fromFile = (p, lab) => readFileText(p, lab, ctx);
  if (flag.fileOnly) {
    ctx.problems.push(label + ": inline body or notes text is not accepted; " + ADVICE);
  } else if (flag.k === T) {
    ctx.scans.push({ label: label, text: text });
  } else if (flag.k === F) {
    const raw = fromFile(text, label);
    if (raw !== null) ctx.scans.push({ label: label + " (file contents)", text: raw });
  } else if (flag.k === "input" || flag.k === "recover") {
    const raw = fromFile(text, label);
    if (raw !== null) jsonScans(raw, label, ctx, flag.k === "input");
  } else if (flag.k === "attach") {
    const h = text.indexOf("#");
    if (h >= 0) ctx.scans.push({ label: label + " (alt text)", text: text.slice(h + 1) });
  } else {
    // gh api -f (raw) and -F (typed) key=value: the value is the text; typed `@path` reads a file.
    const eq = text.indexOf("=");
    const key = eq >= 0 ? text.slice(0, eq) : "";
    const v = eq >= 0 ? text.slice(eq + 1) : text;
    if (flag.k === "typed" && v.charAt(0) === "@") {
      const raw = fromFile(v.slice(1), label);
      if (raw !== null) pushApi(ctx, label + " (file contents)", raw);
    } else if (/^(body|notes)$/i.test(key)) {
      ctx.problems.push(label + ": an inline " + key.toLowerCase() + " field is not accepted; write the text to a file in an earlier call and pass -F " + key.toLowerCase() + "=@<path>");
    } else {
      pushApi(ctx, label, v);
    }
  }
}

// A GraphQL document (a gh api field, an @file, a string inside an --input JSON) has its own backslash escapes, which the
// server decodes AFTER this scan has read the text: scan the unescaped form too.
function unescapeJsonish(t) {
  const map = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
  return t.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\([\s\S])/g, (m, a, b, c) => {
    if (c !== undefined) return own(map, c) ? map[c] : c;
    try { return String.fromCodePoint(parseInt(a || b, 16)); } catch (e) { return ""; }
  });
}
function pushApi(ctx, label, text) {
  ctx.scans.push({ label: label, text: text });
  const u = unescapeJsonish(text);
  if (u !== text) ctx.scans.push({ label: label + " (unescaped)", text: u });
}

// JSON inputs: scan the raw text AND every decoded string (an escape such as a backslash-u sequence splits a term in the
// raw text). Text that is not valid JSON blocks: its format cannot be read reliably.
function jsonScans(raw, label, ctx, api) {
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { ctx.problems.push(label + ": the file is not valid JSON, so its text cannot be read reliably"); return; }
  const strs = [];
  const walk = (x) => {
    if (typeof x === "string") strs.push(x);
    else if (x && typeof x === "object") Object.keys(x).forEach((k) => { strs.push(k); walk(x[k]); });
  };
  walk(doc);
  ctx.scans.push({ label: label + " (file contents)", text: raw });
  ctx.scans.push({ label: label + " (decoded)", text: strs.join("\n") });
  if (api) pushApi(ctx, label + " (decoded)", strs.join("\n"));
}

// Resolve a literal path the way the shell would hand it to gh. Returns { abs } or { why }.
function filePath(p, ctx) {
  const win = process.platform === "win32";
  let q = p;
  if (win && ctx.d === "sh") {
    const m = /^\/([A-Za-z])(?=\/|$)(.*)$/.exec(q);
    if (m) q = m[1].toUpperCase() + ":" + (m[2] || "/");
    else if (q.charAt(0) === "/") return { why: "use a drive-letter path (C:/dir/file); a rooted path means the MSYS root to the shell and the current drive to the hook" };
  }
  const absolute = win ? /^[A-Za-z]:[\\/]/.test(q) || /^\\\\[^\\]/.test(q) : q.charAt(0) === "/";
  if (ctx.cd && !absolute) return { why: "after a cd the file path must be absolute (the hook cannot follow the cd)" };
  return { abs: path.resolve(ctx.cwd, q) };
}

// Read a FILE flag's file as UTF-8 text, or push a reason and return null. Never names the path.
function readFileText(p, label, ctx) {
  const fail = (why) => { ctx.problems.push(label + ": " + why + "; " + ADVICE); return null; };
  if (p === "" || p === "-") return fail("the text comes from stdin or nothing, which the hook cannot read");
  const r = filePath(p, ctx);
  if (r.why) return fail(r.why);
  let buf;
  try {
    const st = fs.statSync(r.abs);
    if (!st.isFile()) return fail("the path is not a regular file");
    if (st.size > MAX_FILE_BYTES) return fail("the file is larger than " + MAX_FILE_BYTES / 1048576 + " MiB");
    buf = fs.readFileSync(r.abs);
  } catch (e) {
    return fail("the file is missing or unreadable");
  }
  if (buf.indexOf(0) >= 0) return fail("the file holds a NUL byte (UTF-16 and binary files are refused)");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf); } catch (e) { return fail("the file is not valid UTF-8 text"); }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// A flag word before the verb is acceptable when it is gh's own (--help, --version), the repository selector (its value is
// not published text), or a TEXT flag of the verb being judged (it is then judged with the verb's flags).
function leadOk(t, spec) {
  if (t === "--help" || t === "--version" || t === "-R" || t === "--repo" || t.indexOf("--repo=") === 0) return true;
  if (t.indexOf("-R") === 0 && t.length > 2) return true;
  if (!spec) return false;
  if (t.indexOf("--") === 0) {
    const eq = t.indexOf("=");
    const nm = eq < 0 ? t.slice(2) : t.slice(2, eq);
    return spec.some((f) => f.l === nm);
  }
  return t.length === 2 && spec.some((f) => f.s === t.charAt(1));
}

// True when a word can open a gh command: a group or top-level command word, or a flag gh accepts in front of one.
const ghLead = (t) => GROUPS.indexOf(t.toLowerCase()) >= 0 || own(OTHER_TOP, t.toLowerCase()) || leadOk(t, null);

// Judge one gh invocation; `gi` indexes the gh word. ALLOW only on positive recognition (see the tables): a known
// no-text verb or command returns silently, a covered verb is judged (Tier A: its fields and files scanned; Tier B:
// refused), everything else pushes a problem.
// `loose` = gh was found as an ARGUMENT of some other command (`grep gh file`): the words after it must then open a
// gh command at all, or it is not gh.
// Flags before the verb: cobra (gh's parser) pairs a flag it does not know at that point (`--x` without `=`, or exactly
// two characters) with the NEXT word, so `gh -R o/r issue create` and `gh --body x issue create` both work and the flag
// words are collected here and judged together with the flags after the verb.
function ghInvocation(seg, gi, ctx, loose) {
  const rest = seg.words.slice(gi + 1);
  if (loose && !(rest.length && (isDyn(rest[0]) || ghLead(lit(rest[0]))))) return;
  const flagArgs = [];
  const leads = [];
  let i = 0;
  let halted = false;
  const stop = (m) => { ctx.problems.push(m); halted = true; return null; };
  const next = () => {
    while (i < rest.length && !halted) {
      const w = rest[i++];
      const t = lit(w);
      if (isDyn(w)) {
        if (t.charAt(0) === "-") return stop("gh: a flag before the command is built from an expansion and cannot be checked");
        return { t: null };
      }
      if (t.charAt(0) !== "-" || t === "-") return { t: t };
      if (t === "--") return stop("gh: a bare -- before the command cannot be checked");
      leads.push(t);
      flagArgs.push(w);
      const swallows = t !== "--help" && t !== "--version" && t.indexOf("=") < 0 && (t.indexOf("--") === 0 || t.length === 2);
      if (swallows && i < rest.length) flagArgs.push(rest[i++]);
    }
    return null;
  };
  const vet = (spec) => {
    if (leads.every((t) => leadOk(t, spec))) return true;
    ctx.problems.push("gh: a flag before the verb that this scan does not know (it could be a text flag); put flags after the verb");
    return false;
  };
  const first = next();
  if (halted) return;
  if (!first) { vet(null); return; }
  if (first.t === null) { ctx.problems.push("gh: the subcommand is not statically known"); return; }
  const g = first.t.toLowerCase();
  if (g === "api") {
    if (vet(API)) ghFlags(flagArgs.concat(rest.slice(i)), API, SHORTS.api, "gh api", ctx);
    return;
  }
  if (own(SAFE_VERBS, g)) {
    const vb = next();
    if (halted) return;
    if (!vb) { vet(null); return; }
    if (vb.t === null) { ctx.problems.push("gh " + g + ": the verb is not statically known"); return; }
    const raw = vb.t.toLowerCase();
    const v = own(ALIASES, g + " " + raw) ? ALIASES[g + " " + raw].split(" ")[1] : raw;
    const spec = own(SPECS, g + " " + v) ? SPECS[g + " " + v] : null;
    if (spec) {
      ctx.pub.v = true;
      if (ctx.tier === "B") { ctx.problems.push("gh " + g + " " + v + ": " + B_MSG); return; }
      if (!vet(spec)) return;
      if (g === "release" && v === "create") {
        flagArgs.concat(rest.slice(i)).map(lit).filter((t) => t.charAt(0) !== "-" && t.indexOf("#") >= 0)
          .forEach((t) => ctx.scans.push({ label: "gh release create asset label", text: t.slice(t.indexOf("#") + 1) }));
      }
      ghFlags(flagArgs.concat(rest.slice(i)), spec, SHORTS[g + " " + v], "gh " + g + " " + v, ctx);
      return;
    }
    if (g === "release" && v === "upload") {
      // 'path#label': the label after # is published text.
      const labels = flagArgs.concat(rest.slice(i)).map(lit).filter((t) => t.charAt(0) !== "-" && t.indexOf("#") >= 0);
      if (labels.length) {
        ctx.pub.v = true;
        if (ctx.tier === "B") ctx.problems.push("gh release upload: " + B_MSG);
        else labels.forEach((t) => ctx.scans.push({ label: "gh release upload asset label", text: t.slice(t.indexOf("#") + 1) }));
      }
    }
    if (SAFE_VERBS[g].indexOf(v) >= 0) { vet(null); return; }
    if (own(SUBGROUPS, g + " " + v)) {
      const sv = next();
      if (halted) return;
      if (!sv) { vet(null); return; }
      if (sv.t !== null && SUBGROUPS[g + " " + v].indexOf(sv.t.toLowerCase()) >= 0) { vet(null); return; }
      ctx.problems.push("gh " + g + " " + v + ": a verb this scan does not know (it publishes text or files this scan does not read, or is new to gh)");
      return;
    }
    ctx.problems.push("gh " + g + ": a verb this scan does not know (a new gh verb, a user alias, or flags placed oddly); use a covered verb (see scripts/README.md)");
    return;
  }
  if (own(OTHER_TOP, g)) {
    const top = OTHER_TOP[g];
    if (top === ANY) { vet(null); return; }
    const vb = next();
    if (halted) return;
    if (!vb) { vet(null); return; }
    if (vb.t !== null && top.indexOf(vb.t.toLowerCase()) >= 0) { vet(null); return; }
    ctx.problems.push("gh " + g + ": a verb this scan does not know (it publishes text this scan does not read, or is new to gh)");
    return;
  }
  ctx.problems.push("gh: a command this scan does not know (an extension, a user alias, or a command new to gh), so it cannot be checked");
}

// The index of the word that actually runs, past assignments, shell keywords and prefix commands (see WRAPPERS); -1 when
// nothing runs (only assignments or keywords). An option of a wrapper (or its value) that mentions gh hides a command
// string from this scan (`env -S 'gh ...'`) and is a problem.
function commandIndex(ws, ctx) {
  let i = 0;
  while (i < ws.length) {
    const w = ws[i];
    if (isDyn(w)) {
      // PowerShell: `$x = gh ...` assigns the command's output, so the command is what follows the =.
      if (ctx.d === "ps" && ws[i + 1] && !isDyn(ws[i + 1]) && /^[-+*\/%]?=$/.test(lit(ws[i + 1]))) { i += 2; continue; }
      return i;
    }
    const t = lit(w);
    if (ctx.d === "sh" && /^[A-Za-z_][A-Za-z0-9_]*[+]?=/.test(t)) { i++; continue; }
    // PowerShell: `if (cond) { ... }`, `foreach (...) { ... }` - the parenthesised condition is not a command word.
    if (ctx.d === "ps" && PS_PAREN.indexOf(t.toLowerCase()) >= 0) { i += ws[i + 1] && isDyn(ws[i + 1]) ? 2 : 1; continue; }
    if (KEYWORDS.indexOf(t.toLowerCase()) >= 0) { i++; continue; }
    const name = baseName(t);
    if (!own(WRAPPERS, name)) return i;
    const valued = WRAPPERS[name];
    let dur = false;
    i++;
    while (i < ws.length && !isDyn(ws[i])) {
      const u = lit(ws[i]);
      if (u === "--") { i++; break; }
      if (/^-./.test(u)) {
        const two = u.length === 2 && valued.indexOf(u.charAt(1)) >= 0;
        if (ghish(u) || (two && ws[i + 1] && ghish(lit(ws[i + 1])))) {
          ctx.problems.push(name + ": a wrapper option hides a command string that mentions gh; call gh by name");
        }
        i += two ? 2 : 1;
        continue;
      }
      if (name === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(u)) { i++; continue; }
      if (name === "timeout" && !dur && /^[0-9.]+[smhd]?$/.test(u)) { i++; dur = true; continue; }
      break;
    }
  }
  return -1;
}

// A glob or a one-level brace expansion that would spell gh (`g?`, `{g,x}h`): a command word the shell expands into gh.
function spellsGh(t) {
  const globs = (x) => {
    if (!/[*?[]/.test(x)) return false;
    try {
      const re = new RegExp("^" + x.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
      return re.test("gh") || re.test("gh.exe");
    } catch (e) { return false; }
  };
  const m = /^([^{]*)\{([^{}]*,[^{}]*)\}(.*)$/.exec(t);
  const alts = m ? m[2].split(",").map((x) => m[1] + x + m[3]) : [t];
  return alts.some((x) => globs(x) || (m !== null && /^gh(\.exe)?$/i.test(x)));
}

// Tier B: find the gh invocations of a compound command and judge each (anything but read-only is a problem). Also pushes
// the cheap refusals described in the header. Never resolves text.
function analyzeB(segs, ctx) {
  // A gh command held as TEXT anywhere (a heredoc, a string): with a script or interpreter run on a file in the same call, it may be the script.
  const textHolds = segs.some((sg) => (sg.inText && (ghCmdText(sg.inText) || ghGlued(sg.inText))) || sg.words.some((w) => !isDyn(w) && ghCmdText(lit(w))));
  for (const seg of segs) {
    const ws = seg.words;
    if (ws.some((w) => !isDyn(w) && /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(lit(w)) && ghCmdText(lit(w)))) {
      ctx.problems.push("a variable that holds a gh command would hide it from this scan; call gh by name");
    }
    if (ws.some((w) => /^[A-Za-z_][A-Za-z0-9_]*\+?=\(/.test(lit(w))) && ghish(ws.map(lit).join(" "))) {
      ctx.problems.push("an array that holds a gh command would hide it from this scan; call gh by name");
    }
    if (seg.heredoc && seg.heredoc.dyn && /[$][(]|`/.test(seg.heredoc.text) && ghish(seg.heredoc.text)) {
      ctx.problems.push("a heredoc that expands commands and mentions gh cannot be checked; quote its delimiter or call gh directly");
    }
    if (ws.some((w) => w.hereText && ghish(w.hereText))) {
      ctx.problems.push("a here-string that expands commands and mentions gh cannot be checked; use a single-quoted here-string or call gh directly");
    }
    const ci = commandIndex(ws, ctx);
    if (ci < 0) continue;
    const w0 = ws[ci];
    const t0 = lit(w0);
    const cmd = baseName(t0);
    if (cmd === "gh" && !isDyn(w0)) { ghInvocation(seg, ci, ctx, false); continue; }
    if (!isDyn(w0) && /\s/.test(t0) && ghish(t0)) {
      ctx.problems.push("a command string that mentions gh is handed to a wrapper; call gh by name");
      continue;
    }
    const args = ws.slice(ci + 1);
    if (!isDyn(w0) && APPENDERS.indexOf(cmd) >= 0) {
      if (ws.slice(ci + 1).some((w) => !isDyn(w) && ghish(lit(w)))) ctx.problems.push(cmd + " appends arguments to the command it runs, so a gh behind it cannot be judged; call gh directly");
      continue;
    }
    if (!isDyn(w0) && HOSTS.indexOf(cmd) >= 0) {
      let gh = false;
      args.forEach((w, x) => {
        const prev = x > 0 && !isDyn(args[x - 1]) ? lit(args[x - 1]) : "";
        if (!isDyn(w) && isEncArg(lit(w)) && /^(pwsh|powershell)$/.test(cmd)) {
          ctx.problems.push(cmd + " -EncodedCommand hides the command from the hook; call gh directly");
        }
        if (isDyn(w)) {
          if (STRING_HOSTS.indexOf(cmd) >= 0 || STRING_FLAG.test(prev)) ctx.problems.push(cmd + ": a command string built from an expansion cannot be checked; call gh directly");
        } else if (baseName(lit(w)) === "gh") {
          if (!gh) { gh = true; ghInvocation(seg, ws.indexOf(w), ctx, false); }
        } else if (ghish(lit(w))) {
          ctx.problems.push(cmd + ": a command string that mentions gh cannot be checked; call gh directly");
        }
      });
      // A host fed text by a heredoc or here-string that mentions gh, or a shell or interpreter reading its code from a
      // pipe or file (no script argument): the text is not followed.
      const reads = (seg.inText && ghish(seg.inText)) ||
        ((seg.stdin || seg.piped) && STDIN_HOSTS.indexOf(cmd) >= 0 && args.every((a) => !isDyn(a) && (lit(a).charAt(0) === "-" || /^[/][ck]$/i.test(lit(a)))));
      if (textHolds && STDIN_HOSTS.indexOf(cmd) >= 0 && args.some((a) => !isDyn(a) && lit(a).charAt(0) !== "-")) {
        ctx.problems.push(cmd + " runs a script file in a call that also holds a gh command as text; call gh directly");
      }
      if (reads) ctx.problems.push(cmd + " reads its commands from a heredoc, a here-string or a pipe, which this scan does not follow; call gh directly");
      continue;
    }
    if (args.some((w) => !isDyn(w) && /(?:^|=)!/.test(lit(w)) && ghish(lit(w)))) {
      ctx.problems.push(cmd + ": a git alias (!command) that runs gh hides it from this scan; call gh by name");
      continue;
    }
    if (ALIAS_CMDS.indexOf(cmd) >= 0 && args.some((w) => ghish(lit(w)))) {
      ctx.problems.push(cmd + ": an alias for gh would hide the gh command that follows; call gh by name");
      continue;
    }
    if (ghGlued(ws.slice(ci).map((w) => (isDyn(w) ? "$" : "") + lit(w)).join(" "))) {
      ctx.problems.push("a command word or argument built from an expansion is followed by a gh command and verb; call gh by name");
      continue;
    }
    if (isDyn(w0)) {
      if (args.some((w) => !isDyn(w) && /\s/.test(lit(w)) && ghish(lit(w)))) {
        ctx.problems.push("a command name built from an expansion is handed a command string that mentions gh; call gh by name");
      }
      if (args.some((w) => !isDyn(w) && (GROUPS.indexOf(lit(w).toLowerCase()) >= 0 || ["gist", "workflow", "variable", "discussion", "project", "extension"].indexOf(lit(w).toLowerCase()) >= 0 || leadOk(lit(w), null)))) {
        ctx.problems.push("a command name built from an expansion runs a gh-like subcommand; call gh by name");
      }
      continue;
    }
    if (!w0.q && spellsGh(t0)) {
      ctx.problems.push("a command name that a glob or brace expansion turns into gh; call gh by name");
      continue;
    }
    // An ordinary or unknown command: a gh word among its arguments is judged loosely (see ghInvocation).
    ws.forEach((w, x) => { if (x > ci && !isDyn(w) && baseName(lit(w)) === "gh") ghInvocation(seg, x, ctx, true); });
  }
}

// ---------------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------------

// Decide one tool call. Returns ctx = { problems, scans, pub, ... }; the caller evaluates it.
function judge(command, dialect, cwd) {
  const ctx = { d: dialect, cwd: cwd, scans: [], problems: [], pub: { v: false }, tier: "B", cd: false,
    bNamed: {} };
  let a = 0;
  let b = command.length;
  while (a < b && " \t\r\n".indexOf(command.charAt(a)) >= 0) a++;
  while (b > a && " \t\r\n".indexOf(command.charAt(b - 1)) >= 0) b--;
  const lx = strictLex(command.slice(a, b), dialect);
  if (lx.ok) {
    ctx.tier = "A";
    ctx.cd = lx.cd !== null;
    ghInvocation({ words: lx.words }, 0, ctx, false);
    return ctx;
  }
  const segs = [];
  new Parser(command, dialect, segs).parseList(null);
  analyzeB(segs, ctx);
  if (ctx.problems.length) ctx.problems = ctx.problems.map((p) => (p.indexOf(B_MSG) >= 0 ? p.replace(B_MSG, B_MSG + " - not strict: " + lx.why) : p));
  return ctx;
}

function evaluate(ctx) {
  const reasons = ctx.problems.slice();
  if (ctx.tier === "A" && (ctx.pub.v || ctx.scans.length)) {
    try {
      const terms = loadTerms();
      for (const s of ctx.scans) {
        const ls = hitLines(s.text, terms);
        if (ls.length) reasons.push("private denylist match in " + s.label + ", " + showLines(ls));
      }
    } catch (e) {
      if (e instanceof Fatal) reasons.push(e.message); else throw e;
    }
  }
  return reasons;
}

function block(reasons) {
  process.stderr.write("BLOCKED by scripts/denylist-scan.js (gh publish scan):\n" +
    reasons.map((r) => "  - " + r).join("\n") + "\n" +
    "Matched text is never shown. Fix the text, or write it to a file in an earlier call and run the publishing gh command alone.\n");
  process.exitCode = 2;
}

function readStdin(cb) {
  const chunks = [];
  process.stdin.on("data", (c) => chunks.push(c));
  process.stdin.on("end", () => cb(Buffer.concat(chunks).toString("utf8")));
  process.stdin.on("error", () => block(["hook input could not be read"]));
}

function hookMode() {
  readStdin((raw) => {
    try {
      let j;
      try { j = JSON.parse(raw); } catch (e) { return block(["hook input is not valid JSON"]); }
      const cmd = j && j.tool_input && j.tool_input.command;
      if (typeof cmd !== "string") return block(["hook input carries no tool_input.command"]);
      const dialect = j.tool_name === "PowerShell" ? "ps" : j.tool_name === "Bash" ? "sh" : null;
      if (!dialect) return block(["tool is not Bash or PowerShell"]);
      if (!mentionsGh(cmd) && !ghGlued(cmd)) return;
      let ctx;
      try {
        ctx = judge(cmd, dialect, typeof j.cwd === "string" && j.cwd ? j.cwd : process.cwd());
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        if (mentionsGh(cmd) || ghGlued(cmd)) return block(["could not parse the gh command (" + e.message + "); simplify it, or run the gh command alone in the strict form"]);
        return;
      }
      const reasons = evaluate(ctx);
      if (reasons.length) block(reasons);
    } catch (e) {
      block(["internal error (" + (e && e.name) + ") - the scan could not run, so the command is blocked"]);
    }
  });
}

function checkMode(args) {
  const items = [];
  for (let a = 0; a < args.length; a++) {
    const m = /^--(file|text-env)$/.exec(args[a]);
    if (!m) throw new Fatal("unknown argument");
    const spec = args[++a] || "";
    const eq = spec.indexOf("=");
    if (eq < 1) throw new Fatal("--" + m[1] + " needs LABEL=VALUE");
    items.push({ kind: m[1], label: spec.slice(0, eq), val: spec.slice(eq + 1) });
  }
  if (!items.length) throw new Fatal("nothing to scan");
  const terms = loadTerms();
  let bad = 0;
  for (const it of items) {
    let text;
    if (it.kind === "file") {
      try { text = fs.readFileSync(it.val, "utf8"); } catch (e) { throw new Fatal("cannot read the file for " + it.label); }
    } else {
      text = process.env[it.val];
      if (text === undefined) throw new Fatal("environment variable for " + it.label + " is not set");
    }
    const ls = hitLines(text, terms);
    if (ls.length) { bad++; process.stderr.write("denylist scan: match in " + it.label + ", " + showLines(ls) + "\n"); }
  }
  if (bad) { process.exitCode = 1; return; }
  process.stdout.write("denylist scan: ok (" + items.length + " field(s) clean)\n");
}

function ghApi(endpoint) {
  const r = cp.spawnSync("gh", ["api", "--paginate", "--slurp", endpoint], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Fatal("gh api " + endpoint.split("?")[0] + " failed (" + (r.error ? "could not run gh" : "exit " + r.status) + ")");
  let pages;
  try { pages = JSON.parse(r.stdout); } catch (e) { throw new Fatal("gh api " + endpoint.split("?")[0] + " returned unparseable output"); }
  const out = [];
  for (const p of Array.isArray(pages) ? pages : [pages]) for (const x of Array.isArray(p) ? p : [p]) out.push(x);
  return out;
}

function auditMode(args) {
  let repo = null;
  for (let a = 0; a < args.length; a++) {
    if (args[a] === "--repo") repo = args[++a];
    else throw new Fatal("unknown argument");
  }
  if (!repo) {
    const r = cp.spawnSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { encoding: "utf8" });
    repo = (r.stdout || "").trim();
    if (r.status !== 0 || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Fatal("cannot resolve the repository; pass --repo OWNER/REPO");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Fatal("--repo must be OWNER/REPO");
  const terms = loadTerms();
  const hits = [];
  const counts = {};
  const errors = [];
  const seen = new Set();
  const scan = (kind, id, field, text) => {
    if (!seen.has(kind + " " + id)) { seen.add(kind + " " + id); counts[kind] = (counts[kind] || 0) + 1; }
    if (typeof text !== "string" || !text) return;
    const ls = hitLines(text, terms);
    if (ls.length) hits.push(kind + " " + id + " " + field + " " + showLines(ls));
  };
  const lastNum = (u) => String(u || "").split("/").pop();
  const step = (fn) => { try { fn(); } catch (e) { if (e instanceof Fatal) errors.push(e.message); else throw e; } };
  const R = "repos/" + repo;
  let prs = [];
  step(() => {
    for (const i of ghApi(R + "/issues?state=all&per_page=100")) {
      const kind = i.pull_request ? "pr" : "issue";
      if (i.pull_request) prs.push(i.number);
      scan(kind, "#" + i.number, "title", i.title);
      scan(kind, "#" + i.number, "body", i.body);
    }
  });
  step(() => ghApi(R + "/issues/comments?per_page=100").forEach((c) =>
    scan("comment", "#" + lastNum(c.issue_url) + " (id " + c.id + ")", "body", c.body)));
  step(() => ghApi(R + "/pulls/comments?per_page=100").forEach((c) =>
    scan("review-comment", "#" + lastNum(c.pull_request_url) + " (id " + c.id + ")", "body", c.body)));
  for (const n of prs) {
    step(() => ghApi(R + "/pulls/" + n + "/reviews?per_page=100").forEach((c) =>
      scan("review", "#" + n + " (id " + c.id + ")", "body", c.body)));
  }
  step(() => ghApi(R + "/releases?per_page=100").forEach((r) => {
    scan("release", r.id, "name", r.name); scan("release", r.id, "tag_name", r.tag_name); scan("release", r.id, "body", r.body);
  }));
  step(() => ghApi(R + "/milestones?state=all&per_page=100").forEach((m) => {
    scan("milestone", "#" + m.number, "title", m.title); scan("milestone", "#" + m.number, "description", m.description);
  }));
  step(() => ghApi(R + "/labels?per_page=100").forEach((l) => {
    scan("label", l.id, "name", l.name); scan("label", l.id, "description", l.description);
  }));
  process.stdout.write("denylist audit: scanned " + Object.keys(counts).map((k) => k + " " + counts[k]).join(", ") +
    "\n");
  for (const h of hits) process.stderr.write("HIT " + h + "\n");
  for (const e of errors) process.stderr.write("ERROR " + e + "\n");
  if (hits.length || errors.length) {
    process.stderr.write("denylist audit: " + hits.length + " hit(s), " + errors.length + " fetch error(s) - NOT clean.\n");
    process.exitCode = 1;
  } else process.stdout.write("denylist audit: clean\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--hook") return hookMode();
  try {
    if (args[0] === "--audit") return auditMode(args.slice(1));
    return checkMode(args);
  } catch (e) {
    process.stderr.write("denylist-scan: " + (e instanceof Fatal ? e.message : "internal error (" + (e && e.name) + ")") + "\n");
    process.exitCode = 1;
  }
}

main();
