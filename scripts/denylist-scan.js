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
 * Reasons name the command, the field (a flag name or an ordinal) and a line number. Unexpected exceptions print only the
 * error NAME: a JSON.parse message quotes its input. Matching is in-process string search, no child grep.
 *
 * WHAT THE HOOK SCANS: the VALUES of text fields and the CONTENTS of body/notes files - never the command
 * line as a whole and never a path (a denylist term often sits in a local temp or home path that is
 * not published). Covered: `gh issue|pr create|edit|comment` (and the `new` aliases of create), `gh pr review|merge|revert`, `gh issue|pr
 * close|reopen -c`, `gh release create|edit`, `gh label create|edit -d`, `gh repo create|edit -d/-h` and
 * `gh api` (-f/--raw-field, -F/--field incl. `@file`/`@-`, --input), long and short flags, `--flag
 * value`, `--flag=value`, attached `-bvalue` and pflag-style short-flag clusters (`-wb value`, `-dt=x`: booleans
 * chain, the first value-taking letter takes the rest of the token or the next argument; a letter missing from the SHORTS
 * table blocks; gh has no long-flag prefix matching, verified against gh 2.103.3). Heredocs, here-strings, `< file`, a pipe from
 * cat/echo/printf/Get-Content/a string literal, `$(cat <<'EOF' ...)`, `$(cat file)` and a file
 * written by an earlier `> file` / Set-Content in the SAME command are resolved. A value the hook cannot
 * resolve statically (a shell variable, another command's output, an unreadable file) BLOCKS with advice to
 * pass the text through a file written in an earlier call. A command that never mentions `gh` (also in the
 * spellings the shell unquotes: `g""h`) is not parsed. Also scanned: `--attach '<file>#<alt>'` (the alt text after
 * `#`), `gh pr create -T/--template <file>` (a FILE: contents scanned; `gh issue create -T` is a template NAME from the
 * repo's committed templates, not read) and `--recover <file>` (gh's JSON of a failed create: raw and decoded, a
 * non-JSON file blocks).
 *
 * ALLOW ONLY ON POSITIVE RECOGNITION. The gh word is located as the COMMAND word (past assignments, shell keywords and
 * the WRAPPERS table, in a path, as gh.exe, quoted, behind `&&` `;` `|` `(` `{`, inside an interpreter's or runner's
 * command text, and in text an interpreter reads from a heredoc or pipe) - or, loosely, as an argument of another
 * command (`grep gh docs/` passes: the words after it must open a gh command at all). Whatever follows a command-word gh
 * must be placed by the tables below (read from `gh --help`, gh 2.103.3): a covered verb is scanned, a known no-text
 * command or verb passes, and everything else BLOCKS: an unknown command or verb (extension, user alias, new gh
 * command), a verb that publishes text this scan does not read (gist, discussion, project item, workflow inputs,
 * variable, agent-task, autolink ...), an unknown long flag on a covered verb, an unknown flag before the verb. Flags
 * before the verb count: cobra pairs a flag it does not know yet (`--x` without `=`, or two characters) with the NEXT
 * word, so `gh -R o/r issue create` and `gh --body x issue comment 1` are real commands and are judged with the verb.
 *
 * FAILS CLOSED: a missing, unreadable or empty denylist, bad hook JSON, an unparseable gh command, an
 * unsupported tool, a parser step that consumes nothing, or any crash blocks. The saved command in .claude/settings.json tests that the script
 * exists (a fixed message on a miss - node's own "cannot find module" error would print the session-root
 * path) and then runs `timeout 6 node "$s" --hook || { ...; exit 2; }`: a hang is killed by `timeout` and a missing
 * script, node or timeout binary exits non-zero, all turned into exit 2 (a hook the CLIENT times out is a non-blocking
 * error, i.e. an ALLOW, so the bound lives inside the command and the entry's own `timeout` field sits above it). CLAUDE_PROJECT_DIR is the SESSION root, which is this repo's root whenever this
 * settings file is the one loaded; the hook writes no file, so a wrong root cannot misplace output - it
 * can only make the script unreachable, which blocks.
 *
 * Gaps (known): scripts a command merely runs (`bash x.sh`, `node x.js`) are not entered; label/milestone/branch/
 * template NAMES, the bytes of an --attach file, release assets and `issue artifact` files are not scanned; text that
 * comes from commits or tags the push already published (--fill, --fill-first, --fill-verbose, --generate-notes,
 * --notes-from-tag: the pre-push hook covers it) or from an interactive editor or browser the hook cannot see (-e,
 * -w) is not scanned and does not block; a body assembled by a variable or function in an earlier call is only
 * visible to the audit; a body FILE is read at hook time and gh reads it again at run time, so a file changed in
 * between is not seen; user-defined aliases and extensions BLOCK (an unknown command or verb), they are never looked
 * through; a gh word built by a glob or an indirection (`g?`, `${x}h`) is not recognised; a gh behind a wrapper this
 * file does not list, followed by a flag gh would not accept before a command, is read as not-gh.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

class Fatal extends Error {}
class ParseError extends Error {}

// ---------------------------------------------------------------------------------------------
// Denylist
// ---------------------------------------------------------------------------------------------

// How messages name the denylist: by source, never by the resolved path (see PRIVACY RULE).
const DENYLIST_NAME = "DENYLIST_FILE, else the default under the XDG config dir";

function denylistPath() {
  if (process.env.DENYLIST_FILE) return process.env.DENYLIST_FILE;
  const base = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || os.homedir(), ".config");
  return path.join(base, "denylist", "terms.txt");
}

function loadTerms() {
  let raw;
  try {
    raw = fs.readFileSync(denylistPath(), "utf8");
  } catch (e) {
    throw new Fatal("denylist file missing or unreadable (" + DENYLIST_NAME + "); provision it (one term per line) or " +
      "set DENYLIST_FILE - see scripts/README.md. Publishing through gh is blocked until then.");
  }
  const terms = raw.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").map((t) => t.trim())
    .filter((t) => t !== "" && t.charAt(0) !== "#").map((t) => t.toLowerCase());
  if (!terms.length) {
    throw new Fatal("denylist file holds no terms (" + DENYLIST_NAME + ") - refusing to pass an empty check.");
  }
  return terms;
}

// 1-based numbers of the lines holding a term; never the term or the line.
function hitLines(text, terms) {
  const out = [];
  String(text).split(/\r\n|\n|\r/).forEach((line, i) => {
    const l = line.toLowerCase();
    if (terms.some((t) => l.indexOf(t) >= 0)) out.push(i + 1);
  });
  return out;
}

const showLines = (ls) => (ls.length === 1 ? "line " : "lines ") + ls.slice(0, 10).join(", ") + (ls.length > 10 ? ", ..." : "");

// ---------------------------------------------------------------------------------------------
// Parser: a small bash / PowerShell command lexer. d = "sh" | "ps".
// Segment = { words, redirs, stdin, pipedFrom }; Word = { parts, q }, parts = lit | dyn | sub.
// ---------------------------------------------------------------------------------------------

const SQ_PS = "'‘’‚‛";
const DQ_PS = "\"“”„";
const mkSeg = () => ({ words: [], redirs: [], stdin: null, pipedFrom: null });

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
      const has = seg.words.length || seg.redirs.length || seg.stdin;
      if (has) this.segs.push(seg);
      const piped = sep === "|" ? (has ? seg : { unknown: true }) : null;
      seg = mkSeg();
      seg.pipedFrom = piped;
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
      } else if (c === "#") {
        while (this.i < s.length && s.charAt(this.i) !== "\n") this.i++;
      } else if (c === ")") {
        this.i++;
        if (close) { end(";"); return; }
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
    const isWrite = s.charAt(this.i) === "&" || op.charAt(0) === ">";
    j += op.length;
    if (op === ">&" || op === "<&") {
      if (/[0-9-]/.test(s.charAt(j))) { while (/[0-9-]/.test(s.charAt(j))) j++; this.i = j; return; }
    }
    while (s.charAt(j) === " " || s.charAt(j) === "\t") j++;
    this.i = j;
    const w = this.readWord();
    const t = lit(w);
    if (op === "<<" || op === "<<-") {
      pend.push({ seg: seg, delim: t, strip: op === "<<-", quoted: w.q });
    } else if (op === "<<<") {
      seg.stdin = { kind: "word", word: w };
    } else if (op === "<") {
      seg.stdin = { kind: "file", word: w };
    } else if (isWrite) {
      seg.redirs.push({ op: op, word: w, append: op === ">>" });
    }
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
      p.seg.stdin = { kind: "text", text: text, dyn: !p.quoted && /\$[A-Za-z_{(]|`/.test(text) };
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
    if (d === "ps" && s.charAt(this.i) === "@" && /['"‘’“”]/.test(s.charAt(this.i + 1))) {
      const m = /^@(['"‘’“”])[ \t]*\r?\n/.exec(s.slice(this.i, this.i + 40));
      if (m) {
        const dq = DQ_PS.indexOf(m[1]) >= 0;
        const from = this.i + m[0].length;
        const tm = new RegExp("(?:^|\\r?\\n)[" + (dq ? DQ_PS : SQ_PS) + "]@").exec(s.slice(from));
        if (!tm) throw new ParseError("unterminated here-string");
        const text = s.slice(from, from + tm.index);
        this.i = from + tm.index + tm[0].length;
        put(text);
        if (dq && text.indexOf('$(') >= 0) w.hereText = text;
        if (dq && /\$[A-Za-z_{(]/.test(text)) w.parts.push({ k: "dyn", inq: true });
        w.q = true;
        return w;
      }
    }
    if (d === "ps" && s.charAt(this.i) === "@" && /[A-Za-z_]/.test(s.charAt(this.i + 1))) {
      this.i++;
      while (/[A-Za-z0-9_]/.test(s.charAt(this.i))) this.i++;
      w.parts.push({ k: "dyn", inq: false });
      w.splat = true;
      return w;
    }
    while (this.i < s.length) {
      const c = s.charAt(this.i);
      if (/[\s;|&>)]/.test(c) || (c === "<" && d === "sh")) break;
      if (d === "sh") {
        if (c === "\\") {
          const nx = s.charAt(this.i + 1);
          w.q = true;
          if (nx === "\n") this.i += 2;
          else if (nx === "\r" && s.charAt(this.i + 2) === "\n") this.i += 3;
          else { put(nx); this.i += 2; }
        } else if (c === "'") {
          const e = s.indexOf("'", this.i + 1);
          if (e < 0) throw new ParseError("unterminated single quote");
          put(s.slice(this.i + 1, e)); w.q = true; this.i = e + 1;
        } else if (c === "\"") {
          this.i++; w.q = true; this.dq(w, put);
        } else if (c === "$" && s.charAt(this.i + 1) === "'") {
          const e = this.ansiEnd(this.i + 2);
          put(this.ansi(s.slice(this.i + 2, e))); w.q = true; this.i = e + 1;
        } else if (c === "$") {
          this.dollar(w, put, false);
        } else if (c === "`") {
          this.backtick(w, false);
        } else { put(c); this.i++; }
      } else {
        if (c === "`") {
          w.q = true;
          const nx = s.charAt(this.i + 1);
          if (nx === "\n") this.i += 2;
          else if (nx === "\r" && s.charAt(this.i + 2) === "\n") this.i += 3;
          else { put(nx); this.i += 2; }
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
          const start = this.segs.length;
          this.parseList(")");
          w.parts.push({ k: "sub", segs: this.segs.slice(start), inq: false });
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
      if (!ps && c === "\\") {
        const nx = s.charAt(this.i + 1);
        if (nx !== "" && "$`\"\\\n".indexOf(nx) >= 0) { if (nx !== "\n") put(nx); this.i += 2; } else { put(c); this.i++; }
      } else if (ps && c === "`") {
        const nx = s.charAt(this.i + 1);
        const map = { n: "\n", t: "\t", r: "\r", "0": "\0" };
        if (nx === "\n") { /* continuation */ } else put(map[nx] !== undefined ? map[nx] : nx);
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
      this.i += 2;
      const start = this.segs.length;
      this.parseList(")");
      w.parts.push({ k: "sub", segs: this.segs.slice(start), inq: inq });
    } else if (nx === "{") {
      const e = s.indexOf("}", this.i);
      if (e < 0) throw new ParseError("unterminated ${");
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
    while (j < s.length && s.charAt(j) !== "`") j += s.charAt(j) === "\\" ? 2 : 1;
    if (j >= s.length) throw new ParseError("unterminated backtick substitution");
    const segs = [];
    const inner = new Parser(s.slice(this.i + 1, j), this.d, segs);
    inner.parseList(null);
    for (const x of segs) this.segs.push(x);
    w.parts.push({ k: "sub", segs: segs, inq: inq });
    this.i = j + 1;
  }

  ansiEnd(from) {
    const s = this.s;
    let j = from;
    while (j < s.length && s.charAt(j) !== "'") j += s.charAt(j) === "\\" ? 2 : 1;
    if (j >= s.length) throw new ParseError("unterminated $'...'");
    return j;
  }

  ansi(t) {
    const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", "\"": "\"" };
    return t.replace(/\\(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|([ntr\\'"]))/g,
      (m, x, u, c) => (c ? map[c] : String.fromCharCode(parseInt(x || u, 16))));
  }
}

const lit = (w) => w.parts.filter((p) => p.k === "lit").map((p) => p.t).join("");
const isDyn = (w) => w.parts.some((p) => p.k !== "lit");
const baseName = (t) => t.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");

// A word with its first n static characters removed (a flag prefix such as `--body=` or `-b`).
function sliceWord(w, n) {
  const parts = w.parts.map((p) => Object.assign({}, p));
  if (parts.length && parts[0].k === "lit") {
    parts[0].t = parts[0].t.slice(n);
    if (parts[0].t === "") parts.shift();
  }
  return { parts: parts, q: w.q };
}

// ---------------------------------------------------------------------------------------------
// Resolution of words, files and stdin
// ---------------------------------------------------------------------------------------------

function toNative(p, cwd) {
  if (process.platform === "win32") {
    const m = /^\/([a-zA-Z])(?=\/|$)(.*)$/.exec(p);
    if (m) p = m[1].toUpperCase() + ":" + (m[2] || "/");
    else if (/^\/tmp(?=\/|$)/.test(p)) p = os.tmpdir() + p.slice(4);
  }
  if (p === "~" || p.indexOf("~/") === 0 || p.indexOf("~\\") === 0) p = os.homedir() + p.slice(1);
  return path.resolve(cwd, p);
}

const keyOf = (abs) => (process.platform === "win32" ? abs.toLowerCase() : abs);

function readPath(p, ctx) {
  if (p === "/dev/stdin" || p === "-") return null;
  const abs = toNative(p, ctx.cwd);
  const w = ctx.writes.get(keyOf(abs));
  if (w) {
    if (w.content === null) return null;
    if (!w.append) return w.content;
    try { return fs.readFileSync(abs, "utf8") + w.content; } catch (e) { return w.content; }
  }
  try { return fs.readFileSync(abs, "utf8"); } catch (e) { return null; }
}

function resolveWord(w, ctx) {
  let out = "";
  for (const p of w.parts) {
    if (p.k === "lit") out += p.t;
    else if (p.k === "sub" && p.segs.length === 1) {
      const r = producedSeg(p.segs[0], ctx);
      if (r === null) return null;
      out += r.replace(/\n+$/, "");
    } else return null;
  }
  return out;
}

function stdinText(seg, ctx) {
  if (seg.stdin) {
    if (seg.stdin.kind === "text") return seg.stdin.dyn ? null : seg.stdin.text;
    const t = resolveWord(seg.stdin.word, ctx);
    if (t === null) return null;
    return seg.stdin.kind === "word" ? t : readPath(t, ctx);
  }
  if (seg.pipedFrom && !seg.pipedFrom.unknown) return producedSeg(seg.pipedFrom, ctx);
  return null;
}

// The text a segment writes to stdout, when that is statically knowable; else null.
function producedSeg(seg, ctx) {
  const ws = seg.words.slice();
  const ps = ctx.d === "ps";
  if (ps && ws.length === 1 && ws[0].q) return resolveWord(ws[0], ctx);
  while (ws.length && !ps && /^[A-Za-z_][A-Za-z0-9_]*=/.test(lit(ws[0])) && !isDyn(ws[0])) ws.shift();
  if (!ws.length) return null;
  if (isDyn(ws[0])) return null;
  const cmd = baseName(lit(ws[0]));
  const args = ws.slice(1);
  if (ps ? ["get-content", "gc", "cat", "type"].indexOf(cmd) >= 0 : cmd === "cat") {
    const files = [];
    for (let a = 0; a < args.length; a++) {
      const t = lit(args[a]);
      if (!isDyn(args[a]) && ps && /^-(path|literalpath)$/i.test(t)) { if (!args[a + 1]) return null; files.push(args[++a]); continue; }
      if (!isDyn(args[a]) && ps && /^-raw$/i.test(t)) continue;
      if (!isDyn(args[a]) && t.charAt(0) === "-" && t !== "-") return null;
      files.push(args[a]);
    }
    if (!files.length) return stdinText(seg, ctx);
    let out = "";
    for (const f of files) {
      const p = resolveWord(f, ctx);
      const r = p === null ? null : p === "-" ? stdinText(seg, ctx) : readPath(p, ctx);
      if (r === null) return null;
      out += r;
    }
    return out;
  }
  if (ps ? ["echo", "write-output", "write-host"].indexOf(cmd) >= 0 : cmd === "echo" || cmd === "printf") {
    const texts = [];
    for (const a of args) {
      const t = resolveWord(a, ctx);
      if (t === null) return null;
      if (/^-(n|e|E|NoNewline)$/i.test(t) && !a.q) continue;
      texts.push(t);
    }
    return texts.join(" ");
  }
  return null;
}

function collectWrites(segs, ctx) {
  const put = (w, content, append) => {
    const p = resolveWord(w, ctx);
    if (p === null || p === "/dev/null" || p === "NUL" || p === "$null") return;
    const k = keyOf(toNative(p, ctx.cwd));
    const prev = ctx.writes.get(k);
    ctx.writes.set(k, { content: prev && prev.content === null ? null : content, append: append });
  };
  for (const seg of segs) {
    for (const r of seg.redirs) {
      const c = seg.words.length ? producedSeg(seg, ctx) : stdinText(seg, ctx);
      put(r.word, c, r.append);
    }
    if (!seg.words.length || isDyn(seg.words[0])) continue;
    const cmd = baseName(lit(seg.words[0]));
    const args = seg.words.slice(1);
    if (ctx.d === "sh" && cmd === "tee") {
      for (const a of args) if (lit(a).charAt(0) !== "-" || isDyn(a)) put(a, stdinText(seg, ctx), false);
    } else if (ctx.d === "ps" && ["set-content", "sc", "out-file", "add-content", "ac", "tee-object"].indexOf(cmd) >= 0) {
      let target = null;
      let value = null;
      for (let a = 0; a < args.length; a++) {
        const t = lit(args[a]).toLowerCase();
        if (!isDyn(args[a]) && /^-(path|filepath|literalpath)$/.test(t)) target = args[++a];
        else if (!isDyn(args[a]) && t === "-value") value = args[++a];
        else if (!isDyn(args[a]) && t.charAt(0) === "-") continue;
        else if (!target) target = args[a];
        else if (!value) value = args[a];
      }
      if (target) put(target, value ? resolveWord(value, ctx) : stdinText(seg, ctx), cmd === "add-content" || cmd === "ac");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// gh command model
// ---------------------------------------------------------------------------------------------

const T = "text";
const F = "file";
const BODY = [{ l: "body", s: "b", k: T }, { l: "body-file", s: "F", k: F }];
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
  "release create": [{ l: "notes", s: "n", k: T }, { l: "notes-file", s: "F", k: F }, TITLE],
  "release edit": [{ l: "notes", s: "n", k: T }, { l: "notes-file", s: "F", k: F }, TITLE],
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
const INTERPRETERS = ["bash", "sh", "zsh", "dash", "ksh", "fish", "pwsh", "powershell", "cmd", "eval"];
// Commands that run a command string or a command word they are given (a gh word anywhere after them is judged as gh, not loosely).
const RUNNERS = INTERPRETERS.concat(["iex", "invoke-expression", "invoke-command", "icm", "start-process", "saps", "start", "ssh", "su",
  "runuser", "wsl", "find", "parallel", "script", "watch", "sg"]);
const PS_RUNNERS = ["pwsh", "powershell", "iex", "invoke-expression", "invoke-command", "icm", "start-process", "saps", "start"];
// Words a command can sit behind: shell keywords, and prefix commands that run the NEXT command (name: the short options
// that take a separate value). Options of a wrapper that this table does not list make the scan look at a different word:
// a gh behind them is then judged by the looser rule (see analyzeSegs).
const KEYWORDS = ["if", "then", "else", "elif", "do", "while", "until", "!", "{"];
const WRAPPERS = { env: "uCS", sudo: "ughprtCDUT", doas: "uC", xargs: "IJnLPsdEa", timeout: "sk", nice: "n", nohup: "", command: "",
  builtin: "", exec: "a", setsid: "", stdbuf: "ioe", ionice: "cnp", unbuffer: "", time: "" };
const GH_RE = /(?:^|[^A-Za-z0-9_-])gh(?:\.exe)?(?![A-Za-z0-9_-])/i;
// A command that mentions gh, also in the spellings the shell would unquote (`g""h`, `g\h`, ps `g``h`): the gate that decides
// whether a command is parsed at all.
const UNQUOTE = new Set(['"', "'", "`", "^", String.fromCharCode(92)].concat(SQ_PS.split(""), DQ_PS.split("")));
const mentionsGh = (s) => GH_RE.test(s) || GH_RE.test(Array.from(s).filter((c) => !UNQUOTE.has(c)).join(""));
const FILE_ADVICE = "pass the text through a file written in an earlier call (--body-file <file> / -F <file>)";

// Parse the flags of one gh invocation; push scans/problems onto ctx.
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
      return isDyn(w) ? { problem: "a short flag built from an expansion cannot be checked; " + FILE_ADVICE } : { awaits: i + 1 >= lead.length };
    }
    if (sh.b.indexOf(ch) < 0) return { problem: "the short flag cluster holds a letter this scan does not know (it could be a text flag); " + FILE_ADVICE };
  }
  return isDyn(w) ? { problem: "a short flag cluster built from an expansion cannot be checked; " + FILE_ADVICE } : { awaits: false };
}

function ghFlags(seg, args, spec, sh, name, ctx) {
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
        ctx.problems.push(name + ": a long flag this scan does not know (it could be a text flag of a newer gh); re-read the gh help into the tables, or " + FILE_ADVICE);
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
        ctx.problems.push(name + ": a flag name built from an expansion cannot be checked; " + FILE_ADVICE);
      } else if (dyn && !prevFlag && !(ctx.d === "ps" ? !w.splat : w.parts.every((p) => p.k === "lit" || p.inq))) {
        ctx.problems.push(name + ": an unquoted expansion could hide a --body/--title flag; quote it or " + FILE_ADVICE);
      }
      prevFlag = t.charAt(0) === "-" && t.indexOf("=") < 0 && !dyn;
      continue;
    }
    prevFlag = false;
    ctx.pub.v = true;
    const disp = flag.s === null || name.indexOf("api") < 0 ? "--" + flag.l : (flag.k === "raw" ? "-f" : "-F") + " #" + (++ordinal);
    if (!val) { ctx.problems.push(name + " " + disp + ": flag has no value"); continue; }
    const text = resolveWord(val, ctx);
    if (text === null) {
      ctx.problems.push(name + " " + disp + ": value is not statically known (a variable, another command's output, an unreadable file); " + FILE_ADVICE);
      continue;
    }
    scanValue(seg, flag, text, name + " " + disp, ctx);
  }
}

function scanValue(seg, flag, text, label, ctx) {
  const add = (lab, content, why) => {
    if (content === null) ctx.problems.push(label + ": " + why + "; " + FILE_ADVICE);
    else ctx.scans.push({ label: lab, text: content });
  };
  const fromFile = (p) => {
    if (p === "-" || p === "/dev/stdin") add(label + " (stdin)", stdinText(seg, ctx), "stdin source is not visible to the hook (a pipe from another command)");
    else add(label + " (file contents)", readPath(p, ctx), "file is unreadable, missing, or rewritten in this command by something the hook cannot read");
  };
  if (flag.k === T || flag.k === "raw") {
    const eq = flag.k === "raw" ? text.indexOf("=") : -1;
    ctx.scans.push({ label: label, text: eq >= 0 ? text.slice(eq + 1) : text });
  } else if (flag.k === F || flag.k === "input") {
    fromFile(text);
  } else if (flag.k === "attach") {
    const h = text.indexOf("#");
    if (h >= 0) ctx.scans.push({ label: label + " (alt text)", text: text.slice(h + 1) });
  } else if (flag.k === "recover") {
    // gh's saved input of a failed create is JSON: scan the raw file AND its decoded strings (an escape such as a
    // backslash-u sequence splits a term in the raw text); a file that is not JSON cannot be read reliably, so it blocks.
    const raw = readPath(text, ctx);
    let doc = null;
    try { doc = raw === null ? null : JSON.parse(raw); } catch (e) { doc = null; }
    if (raw === null || doc === null) {
      ctx.problems.push(label + ": the recover file is unreadable or not JSON, so its format cannot be read reliably; " + FILE_ADVICE);
      return;
    }
    const strs = [];
    const walk = (x) => {
      if (typeof x === "string") strs.push(x);
      else if (x && typeof x === "object") Object.keys(x).forEach((k) => { strs.push(k); walk(x[k]); });
    };
    walk(doc);
    ctx.scans.push({ label: label + " (file contents)", text: raw });
    ctx.scans.push({ label: label + " (decoded)", text: strs.join(String.fromCharCode(10)) });
  } else {
    const eq = text.indexOf("=");
    const v = eq >= 0 ? text.slice(eq + 1) : text;
    if (v.charAt(0) === "@") fromFile(v.slice(1)); else ctx.scans.push({ label: label, text: v });
  }
}

// A flag word before the verb is acceptable when it is gh's own (--help, --version), the repository selector (its value is
// not published text), or a TEXT flag of the verb being judged (it is then scanned with the verb's flags).
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
// no-text verb or command returns silently, a covered verb has its text scanned, everything else pushes a problem.
// `loose` = gh was found as an ARGUMENT of some other command (`grep gh file`): the words after it must then open a
// gh command at all, or it is not gh.
// Flags before the verb: cobra (gh's parser) pairs a flag it does not know at that point (`--x` without `=`, or exactly
// two characters) with the NEXT word, so `gh -R o/r issue create` and `gh --body x issue create` both work and the flag
// words are collected here and judged together with the flags after the verb.
function ghInvocation(seg, gi, ctx, loose) {
  const rest = seg.words.slice(gi + 1);
  if (loose && !(rest.length && !isDyn(rest[0]) && ghLead(lit(rest[0])))) return;
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
        if (t.charAt(0) === "-") return stop("gh: a flag before the command is built from an expansion and cannot be checked; " + FILE_ADVICE);
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
    ctx.problems.push("gh: a flag before the verb that this scan does not know (it could be a text flag); put flags after the verb, or " + FILE_ADVICE);
    return false;
  };
  const first = next();
  if (halted) return;
  if (!first) { vet(null); return; }
  if (first.t === null) { ctx.problems.push("gh: the subcommand is not statically known"); return; }
  const g = first.t.toLowerCase();
  if (g === "api") {
    if (vet(API)) ghFlags(seg, flagArgs.concat(rest.slice(i)), API, SHORTS.api, "gh api", ctx);
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
      if (!vet(spec)) return;
      ctx.pub.v = true;
      ghFlags(seg, flagArgs.concat(rest.slice(i)), spec, SHORTS[g + " " + v], "gh " + g + " " + v, ctx);
      return;
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
// nothing runs (only assignments or keywords).
function commandIndex(ws, d) {
  let i = 0;
  while (i < ws.length) {
    const w = ws[i];
    if (isDyn(w)) return i;
    const t = lit(w);
    if (d === "sh" && /^[A-Za-z_][A-Za-z0-9_]*[+]?=/.test(t)) { i++; continue; }
    if (KEYWORDS.indexOf(t.toLowerCase()) >= 0) { i++; continue; }
    const name = baseName(t);
    if (!own(WRAPPERS, name)) return i;
    const valued = WRAPPERS[name];
    let dur = false;
    i++;
    while (i < ws.length && !isDyn(ws[i])) {
      const u = lit(ws[i]);
      if (u === "--") { i++; break; }
      if (/^-./.test(u)) { i += u.length === 2 && valued.indexOf(u.charAt(1)) >= 0 ? 2 : 1; continue; }
      if (name === "env" && /^[A-Za-z_][A-Za-z0-9_]*=/.test(u)) { i++; continue; }
      if (name === "timeout" && !dur && /^[0-9.]+[smhd]?$/.test(u)) { i++; dur = true; continue; }
      break;
    }
  }
  return -1;
}

// Judge the commands one command string runs. Every segment ends in exactly one of: a gh invocation judged by
// ghInvocation, an interpreter or runner whose command text is re-parsed, or a recognised non-gh command; an
// interpreter or runner that hides its command text (a variable, -EncodedCommand, a stdin the hook cannot read)
// pushes a problem.
function analyzeSegs(segs, ctx, depth) {
  collectWrites(segs, ctx);
  for (const seg of segs) {
    const ws = seg.words;
    if (seg.stdin && seg.stdin.kind === "text" && seg.stdin.dyn && /[$][(]|`/.test(seg.stdin.text) && mentionsGh(seg.stdin.text)) {
      ctx.problems.push("a heredoc that expands commands and mentions gh cannot be checked; quote its delimiter or call gh directly");
    }
    if (ws.some((w) => w.hereText && mentionsGh(w.hereText))) {
      ctx.problems.push("a here-string that expands commands and mentions gh cannot be checked; use a single-quoted here-string or call gh directly");
    }
    const ci = commandIndex(ws, ctx.d);
    if (ci < 0) continue;
    const w0 = ws[ci];
    const cmd = baseName(lit(w0));
    if (cmd === "gh") { ghInvocation(seg, ci, ctx, false); continue; }
    const runner = !isDyn(w0) && RUNNERS.indexOf(cmd) >= 0;
    if (!runner) {
      // An ordinary or unknown command: a gh word among its arguments is judged loosely (see ghInvocation).
      const j = ws.findIndex((w, x) => x > ci && !isDyn(w) && baseName(lit(w)) === "gh");
      if (j >= 0) { ghInvocation(seg, j, ctx, true); continue; }
      if (isDyn(w0) && mentionsGh(ctx.src) &&
          ws.slice(ci + 1).some((w) => !isDyn(w) && (GROUPS.indexOf(lit(w).toLowerCase()) >= 0 || leadOk(lit(w), null)))) {
        ctx.problems.push("a command name built from an expansion runs a gh-like subcommand; call gh by name");
      }
      continue;
    }
    const sub = PS_RUNNERS.indexOf(cmd) >= 0 ? "ps" : "sh";
    const reads = ["eval", "iex", "invoke-expression"].indexOf(cmd) >= 0;
    const args = ws.slice(ci + 1);
    let gh = false;
    for (let wi = 0; wi < args.length; wi++) {
      const w = args[wi];
      const t = lit(w);
      if (!isDyn(w) && /^-(e|ec|encodedcommand)$/i.test(t) && sub === "ps") {
        ctx.problems.push(cmd + " -EncodedCommand hides the command from the hook; call gh directly");
      }
      if (isDyn(w)) {
        const prev = wi > 0 ? lit(args[wi - 1]) : "";
        if (reads || (sub === "ps" ? /^-c(om(m(a(nd?)?)?)?)?$/i.test(prev) : /^-[A-Za-z]*c$/.test(prev) || /^[/][ck]$/i.test(prev))) {
          ctx.problems.push(cmd + ": the command string is not statically known; call gh directly");
        }
        continue;
      }
      if (baseName(t) === "gh") {
        // `cmd /c gh issue ...`, `pwsh -Command gh ...`, `ssh host gh ...`, `Start-Process gh ...`: the gh word is the command.
        if (!gh) { gh = true; ghInvocation(seg, ci + 1 + wi, ctx, false); }
        continue;
      }
      if (!mentionsGh(t)) continue;
      if (depth >= 3) { ctx.problems.push("interpreter nesting too deep to check"); continue; }
      const inner = [];
      new Parser(t, sub, inner).parseList(null);
      analyzeSegs(inner, Object.assign({}, ctx, { d: sub }), depth + 1);
    }
    // An interpreter fed its commands on stdin (a heredoc, a here-string, a pipe, `< file`) and given no script or string.
    if (INTERPRETERS.indexOf(cmd) >= 0 && cmd !== "eval" && (seg.stdin || seg.pipedFrom) &&
        args.every((a) => isDyn(a) ? false : lit(a).charAt(0) === "-" || lit(a) === "/c" || lit(a) === "/k")) {
      const text = stdinText(seg, ctx);
      if (text === null) {
        if (mentionsGh(ctx.src)) ctx.problems.push(cmd + " reads its commands from a source the hook cannot see; call gh directly");
      } else if (mentionsGh(text)) {
        if (depth >= 3) { ctx.problems.push("interpreter nesting too deep to check"); continue; }
        const inner = [];
        new Parser(text, sub, inner).parseList(null);
        analyzeSegs(inner, Object.assign({}, ctx, { d: sub }), depth + 1);
      }
    }
  }
}

// Returns { pub:{v}, scans:[{label,text}], problems:[string] }; pub.v = a gh publishing command was seen.
function analyze(command, dialect, cwd) {
  const segs = [];
  new Parser(command, dialect, segs).parseList(null);
  const ctx = { d: dialect, cwd: cwd, writes: new Map(), scans: [], problems: [], pub: { v: false }, src: command };
  analyzeSegs(segs, ctx, 0);
  return ctx;
}

// ---------------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------------

function evaluate(ctx) {
  const reasons = ctx.problems.slice();
  if (ctx.pub.v || ctx.scans.length) {
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
    "Matched text is never shown. Fix the text, or pass it through a file written in an earlier call.\n");
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
      if (!mentionsGh(cmd)) return;
      let ctx;
      try {
        ctx = analyze(cmd, dialect, typeof j.cwd === "string" && j.cwd ? j.cwd : process.cwd());
      } catch (e) {
        if (e instanceof ParseError) return block(["could not parse the gh command (" + e.message + "); simplify it or pass text through a file"]);
        throw e;
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
