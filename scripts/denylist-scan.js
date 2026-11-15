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
 * not published). Covered: `gh issue|pr create|edit|comment`, `gh pr review|merge`, `gh issue|pr
 * close|reopen -c`, `gh release create|edit`, `gh label create|edit -d`, `gh repo create|edit -d/-h` and
 * `gh api` (-f/--raw-field, -F/--field incl. `@file`/`@-`, --input), long and short flags, `--flag
 * value`, `--flag=value` and attached `-bvalue`. Heredocs, here-strings, `< file`, a pipe from
 * cat/echo/printf/Get-Content/a string literal, `$(cat <<'EOF' ...)`, `$(cat file)` and a file
 * written by an earlier `> file` / Set-Content in the SAME command are resolved. A value the hook cannot
 * resolve statically (a shell variable, another command's output, an unreadable file) BLOCKS with advice to
 * pass the text through a file written in an earlier call. A command that never mentions `gh` is not parsed.
 *
 * FAILS CLOSED: a missing, unreadable or empty denylist, bad hook JSON, an unparseable gh command, an
 * unsupported tool, or any crash blocks. The saved command in .claude/settings.json tests that the script
 * exists (a fixed message on a miss - node's own "cannot find module" error would print the session-root
 * path) and then runs `node "$s" --hook || exit 2`, so a missing script or node binary also exits 2. CLAUDE_PROJECT_DIR is the SESSION root, which is this repo's root whenever this
 * settings file is the one loaded; the hook writes no file, so a wrong root cannot misplace output - it
 * can only make the script unreachable, which blocks.
 *
 * Gaps (known): scripts a command merely runs (`bash x.sh`, `node x.js`) are not entered; `gh gist
 * create`, `gh project`, label/milestone/branch NAMES and release asset files are not scanned; a body
 * assembled by a variable or function in an earlier call is only visible to the audit.
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
      const c = s.charAt(this.i);
      if (c === "\n") {
        this.i++;
        if (pend.length) { this.heredocBodies(pend); pend = []; }
        end("\n");
      } else if (c === " " || c === "\t" || c === "\r") {
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
const SPECS = {
  "issue create": BODY.concat([TITLE]), "issue edit": BODY.concat([TITLE]),
  "pr create": BODY.concat([TITLE]), "pr edit": BODY.concat([TITLE]),
  "issue comment": BODY, "pr comment": BODY, "pr review": BODY,
  "pr merge": BODY.concat([{ l: "subject", s: "t", k: T }]),
  "release create": [{ l: "notes", s: "n", k: T }, { l: "notes-file", s: "F", k: F }, TITLE],
  "release edit": [{ l: "notes", s: "n", k: T }, { l: "notes-file", s: "F", k: F }, TITLE],
  "issue close": [COMMENT], "issue reopen": [COMMENT], "pr close": [COMMENT], "pr reopen": [COMMENT],
  "label create": [DESC], "label edit": [DESC],
  "repo create": [DESC, { l: "homepage", s: "h", k: T }], "repo edit": [DESC, { l: "homepage", s: "h", k: T }],
};
const API = [{ l: "raw-field", s: "f", k: "raw" }, { l: "field", s: "F", k: "typed" }, { l: "input", s: null, k: "input" }];
const GROUPS = ["issue", "pr", "release", "label", "repo", "api"];
const INTERPRETERS = ["bash", "sh", "zsh", "dash", "ksh", "fish", "pwsh", "powershell", "cmd", "eval"];
const GH_RE = /(?:^|[^A-Za-z0-9_-])gh(?:\.exe)?(?![A-Za-z0-9_-])/i;
const FILE_ADVICE = "pass the text through a file written in an earlier call (--body-file <file> / -F <file>)";

// Parse the flags of one gh invocation; push scans/problems onto ctx.
function ghFlags(seg, args, spec, name, ctx) {
  let prevFlag = false;
  let ordinal = 0;
  for (let a = 0; a < args.length; a++) {
    const w = args[a];
    const t = lit(w);
    const dyn = isDyn(w);
    let flag = null;
    let val = null;
    if (!dyn && t === "--") break;
    if (t.indexOf("--") === 0) {
      const eq = t.indexOf("=");
      const nm = eq < 0 ? t.slice(2) : t.slice(2, eq);
      flag = spec.find((f) => f.l === nm) || null;
      if (flag) val = eq >= 0 ? sliceWord(w, eq + 1) : args[++a] || null;
    } else if (/^-[A-Za-z]/.test(t)) {
      flag = spec.find((f) => f.s === t.charAt(1)) || null;
      if (flag) {
        const rest = sliceWord(w, t.charAt(2) === "=" ? 3 : 2);
        val = rest.parts.length ? rest : args[++a] || null;
      }
    }
    if (!flag) {
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
  } else {
    const eq = text.indexOf("=");
    const v = eq >= 0 ? text.slice(eq + 1) : text;
    if (v.charAt(0) === "@") fromFile(v.slice(1)); else ctx.scans.push({ label: label, text: v });
  }
}

function ghInvocation(seg, gi, ctx) {
  const ws = seg.words;
  let k = gi + 1;
  while (k < ws.length && !isDyn(ws[k]) && lit(ws[k]).charAt(0) === "-") k++;
  if (k >= ws.length) return;
  if (isDyn(ws[k])) { ctx.problems.push("gh: the subcommand is not statically known"); return; }
  const g = lit(ws[k]).toLowerCase();
  if (GROUPS.indexOf(g) < 0) return;
  if (g === "api") {
    ghFlags(seg, ws.slice(k + 1), API, "gh api", ctx);
    return;
  }
  if (k + 1 >= ws.length) return;
  if (isDyn(ws[k + 1])) { ctx.problems.push("gh " + g + ": the verb is not statically known"); return; }
  const v = lit(ws[k + 1]).toLowerCase();
  const spec = SPECS[g + " " + v];
  if (!spec) return;
  ctx.pub.v = true;
  ghFlags(seg, ws.slice(k + 2), spec, "gh " + g + " " + v, ctx);
}

function analyzeSegs(segs, ctx, depth) {
  collectWrites(segs, ctx);
  for (const seg of segs) {
    const ws = seg.words;
    const gi = ws.findIndex((w) => !isDyn(w) && baseName(lit(w)) === "gh");
    if (gi >= 0) { ghInvocation(seg, gi, ctx); continue; }
    if (!ws.length) continue;
    if (isDyn(ws[0]) && ws.length > 1 && !isDyn(ws[1]) && GROUPS.indexOf(lit(ws[1]).toLowerCase()) >= 0 && GH_RE.test(ctx.src)) {
      ctx.problems.push("a command name built from an expansion runs a gh-like subcommand; call gh by name");
      continue;
    }
    const cmd = isDyn(ws[0]) ? "" : baseName(lit(ws[0]));
    if (INTERPRETERS.indexOf(cmd) < 0) continue;
    const sub = cmd === "pwsh" || cmd === "powershell" ? "ps" : "sh";
    for (let wi = 1; wi < ws.length; wi++) {
      const w = ws[wi];
      const t = lit(w);
      if (!isDyn(w) && /^-(e|ec|encodedcommand)$/i.test(t) && sub === "ps") {
        ctx.problems.push(cmd + " -EncodedCommand hides the command from the hook; call gh directly");
      }
      if (isDyn(w)) {
        if (/^-(c|command)$/i.test(lit(ws[wi - 1])) || cmd === "eval") {
          ctx.problems.push(cmd + ": the command string is not statically known; call gh directly");
        }
        continue;
      }
      if (!GH_RE.test(t)) continue;
      if (depth >= 3) { ctx.problems.push("interpreter nesting too deep to check"); continue; }
      const inner = [];
      new Parser(t, sub, inner).parseList(null);
      analyzeSegs(inner, Object.assign({}, ctx, { d: sub }), depth + 1);
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
      if (!GH_RE.test(cmd)) return;
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
