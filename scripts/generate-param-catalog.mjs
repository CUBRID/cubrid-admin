#!/usr/bin/env node
/**
 * Generates libs/api-interfaces/src/param-schema/engine-catalog/engine-param-catalog.generated.ts
 * from the CUBRID engine sources (system_parameter.c/.h, broker_config.c) at several git refs.
 *
 *   node scripts/generate-param-catalog.mjs [--cubrid-repo <path>] [--refs a,b,c]
 *
 * The engine repo is only read through `git show <ref>:<path>`; nothing is checked out.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(
  ROOT,
  'libs/api-interfaces/src/param-schema/engine-catalog/engine-param-catalog.generated.ts'
);

const DEFAULT_REFS = [
  'origin/release/11.0',
  'origin/release/11.1',
  'origin/release/11.2',
  'origin/release/11.3',
  'origin/release/11.4',
  'v11.4.5',
  'origin/develop',
];

// Counts verified by hand against these exact commits. They are only enforced while a ref still
// points at the recorded commit, so a moving branch does not break regeneration.
// `rawDb` counts every prm_Def entry in the source text; `db` excludes PRM_ID_SINGLE_BYTE_COMPARE,
// which sits under #if defined (ENABLE_UNUSED_FUNCTION) in both prm_Def and PARAM_ID and is
// therefore rejected as an unknown key by real builds.
const BASELINE = {
  'origin/release/11.0': {
    commit: '85a69e7893b291b102d7b0e1146fa4262bb4b4ca',
    rawDb: 329,
    db: 328,
    broker: 79,
  },
  'origin/release/11.1': {
    commit: 'e0e4f7a84b2ed0aa209d214b1db64ff8ec89ca27',
    rawDb: 326,
    db: 325,
    broker: 79,
  },
  'origin/release/11.2': {
    commit: 'baf1d297defaf78f4a990da671b3f81553478ca1',
    rawDb: 336,
    db: 335,
    broker: 84,
  },
  'origin/release/11.3': {
    commit: 'c5d950822ffeab665d3a7a3b632ca9ab05b1412e',
    rawDb: 347,
    db: 346,
    broker: 85,
  },
  'origin/release/11.4': {
    commit: 'fbc06b0bd9ff287665e7c7012a2533ff759b677f',
    rawDb: 362,
    db: 361,
    broker: 86,
  },
  'v11.4.5': {
    commit: 'e9c17f77e38ca808761cf27d45b0227db87b3d62',
    rawDb: 361,
    db: 360,
    broker: 86,
  },
  'origin/develop': {
    commit: '14b0b1cbd94c26860ea0ed006d8f928a90eec514',
    rawDb: 398,
    db: 397,
    broker: 89,
  },
};
const BASELINE_UNION = {
  db: 401,
  broker: 90,
  dbKeys: [
    'page_latch_timeout',
    'first_log_pageid',
    'tcp_keepalive_count',
    'tcp_keepalive_interval',
  ],
};

// Evaluator sanity checks; applied to every ref that has the key.
const SPOT_CHECKS = [
  {
    key: 'log_volume_size',
    lowerLimit: '20971520',
    upperLimit: '4294967296',
    defaultValue: '536870912',
  },
  {
    key: 'data_buffer_size',
    prmId: 'PRM_ID_PAGE_BUFFER_SIZE',
    lowerLimit: '1024',
    defaultValue: '32768',
    sizeUnit: true,
    differUnit: true,
  },
  { key: 'log_max_archives', lowerLimit: '0', upperLimit: null, defaultValue: '2147483647' },
  {
    key: 'backup_volume_max_size_bytes',
    lowerLimit: '32768',
    upperLimit: '9223372036854775807',
    defaultValue: '0',
  },
];

// The cub_server release build is what reads cubrid.conf, so conditionals are resolved as it sees them.
const DEFINED = new Set(['NDEBUG', 'SERVER_MODE', 'LINUX', '__cplusplus']);
const UNDEFINED = new Set([
  'CS_MODE',
  'SA_MODE',
  'WINDOWS',
  'ENABLE_UNUSED_FUNCTION',
  'UNUSED_FUNCTIONS',
  'SUPPRESS_STRLEN_WARNING',
  '_ENABLE_SYSTEM_PARAMS_CHECK_',
  '_SYSTEM_PARAMETER_H_',
]);

// <limits.h> values (LP64 Linux); engine constants come from ENGINE_MACRO_HEADERS instead.
const BUILTIN_MACROS = {
  INT_MAX: '2147483647',
  INT_MIN: '(-2147483647 - 1)',
  UINT_MAX: '4294967295U',
  SHRT_MAX: '32767',
  USHRT_MAX: '65535',
  LLONG_MAX: '9223372036854775807LL',
};

// Headers system_parameter.c includes that define constants used in prm_Def initializers. Only
// #defines and top-level `const T NAME = expr;` are taken from them, ignoring #if; a name defined
// with differing values in one header is dropped rather than guessed.
const ENGINE_MACRO_HEADERS = [
  'src/base/porting.h',
  'src/compat/dbtype_def.h',
  'src/storage/storage_common.h',
  'src/connection/connection_globals.h',
  'src/connection/heartbeat.h',
  'src/query/vacuum.h',
  'src/object/deduplicate_key.h',
  'src/transaction/log_storage.hpp',
];

const DATATYPES = {
  PRM_INTEGER: 'integer',
  PRM_BIGINT: 'bigint',
  PRM_FLOAT: 'float',
  PRM_BOOLEAN: 'boolean',
  PRM_STRING: 'string',
  PRM_KEYWORD: 'keyword',
  PRM_INTEGER_LIST: 'integerList',
  PRM_NO_TYPE: 'none',
};

function parseArgs(argv) {
  const args = { repo: path.join(os.homedir(), 'Desktop/CUBRID/cubrid'), refs: DEFAULT_REFS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cubrid-repo') args.repo = argv[++i];
    else if (a === '--refs')
      args.refs = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: node scripts/generate-param-catalog.mjs [--cubrid-repo <path>] [--refs a,b,c]'
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.repo) throw new Error('--cubrid-repo requires a path');
  args.repo = args.repo.replace(/^~(?=$|\/)/, os.homedir());
  return args;
}

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  return cond;
}

function gitShow(repo, ref, file) {
  return execFileSync('git', ['-C', repo, 'show', `${ref}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
}

function gitShowOptional(repo, ref, file) {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${ref}:${file}`], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function gitCommit(repo, ref) {
  return execFileSync('git', ['-C', repo, 'rev-parse', `${ref}^{commit}`], {
    encoding: 'utf8',
  }).trim();
}

/* ---------------------------------------------------------------- lexing / preprocessing */

function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated block comment');
      const body = src.slice(i, end + 2);
      out += ' ' + body.replace(/[^\n]/g, '');
      i = end + 2;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function joinContinuations(src) {
  return src.replace(/\\\r?\n/g, ' ');
}

function evalPpCondition(expr) {
  const tokens = expr.match(/defined\s*\(\s*\w+\s*\)|defined\s+\w+|&&|\|\||!|\(|\)|\w+/g) || [];
  let pos = 0;
  const peek = () => tokens[pos];
  const primary = () => {
    const t = tokens[pos++];
    if (t === undefined) throw new Error(`Bad #if expression: ${expr}`);
    if (t === '!') return !primary();
    if (t === '(') {
      const v = orExpr();
      if (tokens[pos++] !== ')') throw new Error(`Bad #if expression: ${expr}`);
      return v;
    }
    const m = t.match(/^defined\s*\(?\s*(\w+)\s*\)?$/);
    if (m) {
      if (DEFINED.has(m[1])) return true;
      if (UNDEFINED.has(m[1])) return false;
      throw new Error(`Unknown preprocessor symbol in #if: ${m[1]} (add it to DEFINED/UNDEFINED)`);
    }
    if (/^\d+$/.test(t)) return Number(t) !== 0;
    throw new Error(`Unsupported #if expression: ${expr}`);
  };
  const andExpr = () => {
    let v = primary();
    while (peek() === '&&') {
      pos++;
      const r = primary();
      v = v && r;
    }
    return v;
  };
  const orExpr = () => {
    let v = andExpr();
    while (peek() === '||') {
      pos++;
      const r = andExpr();
      v = v || r;
    }
    return v;
  };
  const v = orExpr();
  if (pos !== tokens.length) throw new Error(`Bad #if expression: ${expr}`);
  return v;
}

/** Drops inactive branches and directive lines; collects active object-like #defines. */
function preprocess(src) {
  const lines = joinContinuations(stripComments(src)).split('\n');
  const stack = [];
  const active = () => stack.every((f) => f.active);
  const defines = new Map();
  const out = [];
  for (const line of lines) {
    const d = line.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (!d) {
      out.push(active() ? line : '');
      continue;
    }
    const [, dir, rest] = d;
    const parentActive = active();
    if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef') {
      let v = false;
      if (parentActive) {
        if (dir === 'if') v = evalPpCondition(rest);
        else v = evalPpCondition(`${dir === 'ifndef' ? '!' : ''}defined(${rest.trim()})`);
      }
      stack.push({ active: v, taken: v, parentActive });
    } else if (dir === 'elif') {
      const top = stack[stack.length - 1];
      const v = top.parentActive && !top.taken && evalPpCondition(rest);
      top.active = v;
      top.taken = top.taken || v;
    } else if (dir === 'else') {
      const top = stack[stack.length - 1];
      top.active = top.parentActive && !top.taken;
      top.taken = true;
    } else if (dir === 'endif') {
      stack.pop();
    } else if (dir === 'define' && parentActive) {
      const m = rest.match(/^(\w+)(?!\()\s*(.*)$/);
      if (m && !/^\w+\(/.test(rest)) defines.set(m[1], m[2].trim());
    } else if (dir === 'undef' && parentActive) {
      defines.delete(rest.trim());
    }
    out.push('');
  }
  if (stack.length) throw new Error('Unbalanced #if/#endif');
  return { text: out.join('\n'), defines };
}

/** Returns the text between the braces of the first initializer matched by `headRe`. */
function extractBraced(text, headRe) {
  const m = headRe.exec(text);
  if (!m) throw new Error(`Could not find ${headRe}`);
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  for (; i < text.length && depth > 0; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i++;
      while (text[i] !== c) {
        if (text[i] === '\\') i++;
        i++;
      }
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return text.slice(start, i - 1);
}

/** Splits on top-level commas (outside (), {}, [] and string literals). */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (text[j] !== c) {
        if (text[j] === '\\') j++;
        j++;
      }
      cur += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts.map(normalizeWs).filter((p) => p !== '');
}

function normalizeWs(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function stripOuterBraces(s) {
  s = s.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) throw new Error(`Expected braced initializer: ${s}`);
  return s.slice(1, -1);
}

/* ---------------------------------------------------------------- constant expressions */

const INT_TYPES = new Set([
  'int',
  'unsigned',
  'long',
  'short',
  'signed',
  'INT64',
  'UINT64',
  'INT32',
  'UINT32',
  'size_t',
  'bool',
  'DB_BIGINT',
]);
const FLOAT_TYPES = new Set(['float', 'double']);

function tokenizeExpr(expr) {
  const re =
    /\s*(?:(0[xX][0-9a-fA-F]+|(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+)([uUlLfF]*)|([A-Za-z_]\w*)|(<<|>>|[-+*/%()~|&^]))/y;
  const tokens = [];
  let pos = 0;
  while (pos < expr.length) {
    if (/^\s*$/.test(expr.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m) return null;
    pos = re.lastIndex;
    if (m[1] !== undefined) {
      const isHex = /^0[xX]/.test(m[1]);
      const isFloat = !isHex && (/[.eE]/.test(m[1]) || /[fF]/.test(m[2]));
      tokens.push(
        isFloat ? { t: 'num', v: { f: Number(m[1]) } } : { t: 'num', v: { i: BigInt(m[1]) } }
      );
    } else if (m[3] !== undefined) tokens.push({ t: 'id', v: m[3] });
    else tokens.push({ t: 'op', v: m[4] });
  }
  return tokens;
}

class Unresolvable extends Error {}

function evalConstExpr(expr, macros, seen = new Set()) {
  const tokens = tokenizeExpr(expr);
  if (!tokens || tokens.length === 0) throw new Unresolvable(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const toF = (x) => ('f' in x ? x.f : Number(x.i));
  const arith = (a, b, op) => {
    if ('f' in a || 'f' in b) {
      const x = toF(a);
      const y = toF(b);
      if (op === '+') return { f: x + y };
      if (op === '-') return { f: x - y };
      if (op === '*') return { f: x * y };
      if (op === '/') return { f: x / y };
      throw new Unresolvable(expr);
    }
    const x = a.i;
    const y = b.i;
    switch (op) {
      case '+':
        return { i: x + y };
      case '-':
        return { i: x - y };
      case '*':
        return { i: x * y };
      case '/':
        if (y === 0n) throw new Unresolvable(expr);
        return { i: x / y };
      case '%':
        if (y === 0n) throw new Unresolvable(expr);
        return { i: x % y };
      case '<<':
        return { i: x << y };
      case '>>':
        return { i: x >> y };
      case '|':
        return { i: x | y };
      case '&':
        return { i: x & y };
      case '^':
        return { i: x ^ y };
    }
    throw new Unresolvable(expr);
  };
  const castAhead = () => {
    if (!isOp('(')) return null;
    let j = pos + 1;
    const names = [];
    while (tokens[j] && tokens[j].t === 'id') names.push(tokens[j++].v);
    if (!names.length || !tokens[j] || tokens[j].t !== 'op' || tokens[j].v !== ')') return null;
    if (names.every((n) => INT_TYPES.has(n))) return { kind: 'int', end: j + 1 };
    if (names.every((n) => FLOAT_TYPES.has(n))) return { kind: 'float', end: j + 1 };
    return null;
  };
  const unary = () => {
    const cast = castAhead();
    if (cast) {
      pos = cast.end;
      const v = unary();
      if (cast.kind === 'int') return 'f' in v ? { i: BigInt(Math.trunc(v.f)) } : v;
      return { f: toF(v) };
    }
    if (isOp('-')) {
      pos++;
      const v = unary();
      return 'f' in v ? { f: -v.f } : { i: -v.i };
    }
    if (isOp('+')) {
      pos++;
      return unary();
    }
    if (isOp('~')) {
      pos++;
      const v = unary();
      if ('f' in v) throw new Unresolvable(expr);
      return { i: ~v.i };
    }
    return primary();
  };
  const primary = () => {
    const t = tokens[pos++];
    if (!t) throw new Unresolvable(expr);
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = binary(0);
      if (!isOp(')')) throw new Unresolvable(expr);
      pos++;
      return v;
    }
    if (t.t === 'id') {
      if (isOp('(')) throw new Unresolvable(expr);
      if (seen.has(t.v) || !macros.has(t.v)) throw new Unresolvable(expr);
      return evalConstExpr(macros.get(t.v), macros, new Set([...seen, t.v]));
    }
    throw new Unresolvable(expr);
  };
  const PREC = [['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  const binary = (level) => {
    if (level === PREC.length) return unary();
    let v = binary(level + 1);
    while (peek() && peek().t === 'op' && PREC[level].includes(peek().v)) {
      const op = tokens[pos++].v;
      v = arith(v, binary(level + 1), op);
    }
    return v;
  };
  const v = binary(0);
  if (pos !== tokens.length) throw new Unresolvable(expr);
  return v;
}

function formatNumber(v) {
  if ('i' in v) return v.i.toString();
  return Number.isInteger(v.f) ? v.f.toFixed(1).replace(/\.0$/, '') : String(v.f);
}

function stripPointerCast(expr) {
  return expr.replace(/^\(\s*(?:const\s+)?(?:char|int|void)\s*\*\s*\)\s*/, '').trim();
}

/** Resolves an initializer expression into the catalog string form (or null). */
function renderValue(expr, macros, stats) {
  const raw = normalizeWs(expr);
  const bare = stripPointerCast(raw);
  if (bare === 'NULL') return null;
  if (bare === 'true' || bare === 'false') return bare;
  const str = bare.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (str) return JSON.parse(`"${str[1]}"`);
  try {
    return formatNumber(evalConstExpr(raw, macros));
  } catch (e) {
    if (!(e instanceof Unresolvable)) throw e;
    // Pointer casts are dropped so old-style (static var) and new-style refs read the same.
    stats.unresolved.push(bare);
    return bare;
  }
}

/* ---------------------------------------------------------------- per-ref parsing */

function parseEnum(hText) {
  const body = extractBraced(hText, /enum\s+param_id\s*\{/);
  const ids = [];
  for (const part of splitTopLevel(body)) {
    const name = part.split('=')[0].trim();
    if (name.startsWith('PRM_ID_')) ids.push(name);
    else if (name !== 'PRM_FIRST_ID' && name !== 'PRM_LAST_ID') {
      throw new Error(`Unexpected PARAM_ID member: ${part}`);
    }
  }
  return ids;
}

function collectVarInitializers(cText) {
  const vars = new Map();
  const re =
    /(?:^|[;{}\n])\s*(?:static\s+)?(?:const\s+)?[A-Za-z_][\w\s]*?[\s*]+(prm_\w+)\s*(\[\s*\])?\s*=\s*([^;]+);/g;
  let m;
  while ((m = re.exec(cText))) {
    if (vars.has(m[1])) throw new Error(`Variable ${m[1]} initialized twice after preprocessing`);
    vars.set(m[1], normalizeWs(m[3]));
  }
  return vars;
}

function collectHeaderConstants(src) {
  const text = joinContinuations(stripComments(src));
  const found = new Map();
  const stripSuffix = (v) => v.replace(/(\d)[uUlL]+\b/g, '$1');
  const add = (name, value) => {
    const v = normalizeWs(value);
    if (!v) return;
    const prev = found.get(name);
    if (prev === undefined) found.set(name, v);
    else if (prev !== null && stripSuffix(prev) !== stripSuffix(v)) found.set(name, null);
  };
  for (const m of text.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)(?!\()[ \t]+(.+)$/gm))
    add(m[1], m[2]);
  for (const m of text.matchAll(
    /^(?:static\s+)?const(?:expr)?\s+[\w:]+\s+([A-Z_][A-Z0-9_]*)\s*=\s*([^;]+);/gm
  )) {
    add(m[1], m[2]);
  }
  return new Map([...found].filter(([, v]) => v !== null));
}

function parseDb(cSrc, hSrc, headerSrcs, label) {
  const h = preprocess(hSrc);
  const c = preprocess(cSrc);
  const macros = new Map(Object.entries(BUILTIN_MACROS));
  for (const hs of headerSrcs) for (const [k, v] of collectHeaderConstants(hs)) macros.set(k, v);
  for (const [k, v] of h.defines) macros.set(k, v);
  for (const [k, v] of c.defines) macros.set(k, v);

  const enumIds = parseEnum(h.text);
  const body = extractBraced(c.text, /SYSPRM_PARAM\s+prm_Def\s*\[\s*\]\s*=\s*\{/);
  const entries = splitTopLevel(body);
  const vars = collectVarInitializers(c.text);
  // Old-style limits sometimes point at another param's static default (e.g. `= prm_x_default`).
  for (const [k, v] of vars) if (!macros.has(k)) macros.set(k, v);
  const stats = { unresolved: [], unresolvedByParam: [] };
  const params = [];
  const seenKeys = new Map();
  const usedNames = new Set();

  for (const entryText of entries) {
    const f = splitTopLevel(stripOuterBraces(entryText));
    if (f.length !== 12)
      throw new Error(`${label}: prm_Def entry has ${f.length} fields: ${entryText.slice(0, 120)}`);
    const [prmId, nameMacro, staticFlag, datatypeTok, , defaultExpr, , upperExpr, lowerExpr] = f;

    usedNames.add(nameMacro);
    const nameLit = macros.get(nameMacro);
    const nameMatch = nameLit && nameLit.match(/^"([^"\\]*)"$/);
    if (
      !check(nameMatch, `${label}: ${prmId} name ${nameMacro} does not resolve to a string literal`)
    )
      continue;
    const key = nameMatch[1];

    const datatype = DATATYPES[datatypeTok];
    if (!datatype) throw new Error(`${label}: ${prmId} has unknown datatype ${datatypeTok}`);

    const flags = [...new Set(staticFlag.match(/\bPRM_[A-Z0-9_]+\b/g) || [])].sort();
    const unknownTokens = staticFlag.replace(/\bPRM_[A-Z0-9_]+\b|[()|\s]/g, '');
    if (unknownTokens)
      throw new Error(`${label}: ${prmId} has unexpected static_flag: ${staticFlag}`);

    const before = stats.unresolved.length;
    const resolve = (fieldExpr) => {
      if (fieldExpr === 'NULL_SYSPRM_PARAM_VALUE') return null;
      const newStyle = fieldExpr.match(
        /^\{\s*(true|false)\s*,\s*\{\s*\.(\w+)\s*=\s*([\s\S]*)\}\s*\}$/
      );
      if (newStyle) return newStyle[1] === 'true' ? null : renderValue(newStyle[3], macros, stats);
      const ptr = stripPointerCast(fieldExpr);
      if (ptr === 'NULL') return null;
      const ref = ptr.match(/^&\s*(\w+)$/);
      if (!ref) throw new Error(`${label}: ${prmId} has unrecognized value field: ${fieldExpr}`);
      if (!vars.has(ref[1]))
        throw new Error(`${label}: ${prmId} references ${ref[1]} with no initializer`);
      return renderValue(vars.get(ref[1]), macros, stats);
    };
    const param = {
      key,
      prmId,
      datatype,
      hidden: flags.includes('PRM_HIDDEN'),
      deprecated: flags.includes('PRM_DEPRECATED'),
      obsoleted: flags.includes('PRM_OBSOLETED'),
      sizeUnit: flags.includes('PRM_SIZE_UNIT'),
      timeUnit: flags.includes('PRM_TIME_UNIT'),
      differUnit: flags.includes('PRM_DIFFER_UNIT'),
      flags,
      defaultValue: resolve(defaultExpr),
      lowerLimit: resolve(lowerExpr),
      upperLimit: resolve(upperExpr),
    };
    if (stats.unresolved.length > before) stats.unresolvedByParam.push(key);

    const lower = key.toLowerCase();
    check(
      !seenKeys.has(lower),
      `${label}: duplicate conf key ${key} (${seenKeys.get(lower)} and ${prmId})`
    );
    seenKeys.set(lower, prmId);
    params.push(param);
  }

  const defIds = entries.map((e) => splitTopLevel(stripOuterBraces(e))[0]);
  check(
    defIds.length === enumIds.length,
    `${label}: prm_Def has ${defIds.length} entries but PARAM_ID enum has ${enumIds.length} members`
  );
  const enumSet = new Set(enumIds);
  const defSet = new Set(defIds);
  const onlyDef = defIds.filter((id) => !enumSet.has(id));
  const onlyEnum = enumIds.filter((id) => !defSet.has(id));
  check(
    !onlyDef.length && !onlyEnum.length,
    `${label}: ID set mismatch, prm_Def-only=[${onlyDef}] enum-only=[${onlyEnum}]`
  );
  check(defSet.size === defIds.length, `${label}: duplicate PRM_ID in prm_Def`);
  // prm_Def is indexed by PARAM_ID, so a reordering would silently misattach every later entry.
  check(
    defIds.every((id, i) => id === enumIds[i]),
    `${label}: prm_Def order differs from PARAM_ID enum order`
  );

  const rawBody = extractBraced(stripComments(cSrc), /SYSPRM_PARAM\s+prm_Def\s*\[\s*\]\s*=\s*\{/);
  const rawIds = [...rawBody.matchAll(/\{\s*(PRM_ID_\w+)\s*,/g)].map((m) => m[1]);
  const compiledOut = rawIds.filter((id) => !defSet.has(id));
  check(
    rawIds.length === defIds.length + compiledOut.length,
    `${label}: raw prm_Def scan found ${rawIds.length} entries, preprocessed ${defIds.length}`
  );

  const orphanNames = [...macros.keys()]
    .filter((k) => k.startsWith('PRM_NAME_') && !usedNames.has(k))
    .sort();
  return {
    params,
    enumCount: enumIds.length,
    defCount: defIds.length,
    rawCount: rawIds.length,
    compiledOut,
    stats,
    orphanNames,
  };
}

function normalizeCondition(cond) {
  const c = normalizeWs(cond);
  const m = c.match(/^(!?)\s*defined\s*\(?\s*(\w+)\s*\)?$/);
  return m ? `${m[1]}${m[2]}` : c;
}

function parseBroker(src, label) {
  const text = joinContinuations(stripComments(src));
  const body = extractBraced(text, /const\s+char\s*\*\s*broker_keywords\s*\[\s*\]\s*=\s*\{/);
  const stack = [];
  const keys = [];
  for (const line of body.split('\n')) {
    const d = line.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (d) {
      const [, dir, rest] = d;
      if (dir === 'if') stack.push({ cond: normalizeCondition(rest) });
      else if (dir === 'ifdef') stack.push({ cond: rest.trim() });
      else if (dir === 'ifndef') stack.push({ cond: `!${rest.trim()}` });
      else if (dir === 'else') {
        const top = stack[stack.length - 1];
        top.cond = `!(${top.cond})`;
      } else if (dir === 'endif') stack.pop();
      else throw new Error(`${label}: unsupported directive in broker_keywords: ${line.trim()}`);
      continue;
    }
    for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const entry = { key: m[1] };
      if (stack.length) entry.buildCondition = stack.map((s) => s.cond).join(' && ');
      keys.push(entry);
    }
  }
  const seen = new Set();
  for (const k of keys) {
    check(!seen.has(k.key.toUpperCase()), `${label}: duplicate broker keyword ${k.key}`);
    seen.add(k.key.toUpperCase());
  }
  check(keys.length > 0, `${label}: broker_keywords is empty`);
  return keys;
}

/* ---------------------------------------------------------------- output */

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function tsString(s) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function tsValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return tsString(v);
  if (Array.isArray(v)) return `[${v.map(tsValue).join(', ')}]`;
  return `{ ${Object.entries(v)
    .map(([k, x]) => `${k}: ${tsValue(x)}`)
    .join(', ')} }`;
}

function render(versions) {
  const lines = [];
  lines.push('/**');
  lines.push(' * GENERATED FILE - DO NOT EDIT BY HAND.');
  lines.push(' *');
  lines.push(
    ' * Every conf key the CUBRID engine accepts (hidden ones included), per engine version, parsed'
  );
  lines.push(' * from system_parameter.c/.h (prm_Def[]) and broker_config.c (broker_keywords[]).');
  lines.push(' * Regenerate with:');
  lines.push(' *   npm run param-catalog:generate -- --cubrid-repo <path-to-cubrid-engine-repo>');
  lines.push(
    ' *   (= node scripts/generate-param-catalog.mjs [--cubrid-repo <path>] [--refs a,b,c])'
  );
  lines.push(' *');
  lines.push(
    ' * Conditional code is resolved as the release cub_server build sees it (NDEBUG, SERVER_MODE).'
  );
  lines.push(
    ' * Values are decimal strings when the C expression folds to a constant, otherwise the raw C'
  );
  lines.push(
    ' * expression; null means no value (NULL_SYSPRM_PARAM_VALUE / NULL pointer). The engine matches'
  );
  lines.push(' * cubrid.conf keys and broker keywords case-insensitively.');
  lines.push(' */');
  lines.push('');
  lines.push('export interface EngineCatalogDbParam {');
  lines.push('  key: string;');
  lines.push('  prmId: string;');
  lines.push('  datatype:');
  const datatypeNames = Object.values(DATATYPES);
  datatypeNames.forEach((d, i) =>
    lines.push(`    | ${tsString(d)}${i === datatypeNames.length - 1 ? ';' : ''}`)
  );
  lines.push('  hidden: boolean;');
  lines.push('  deprecated: boolean;');
  lines.push('  obsoleted: boolean;');
  lines.push('  sizeUnit: boolean;');
  lines.push('  timeUnit: boolean;');
  lines.push('  differUnit: boolean;');
  lines.push('  flags: string[];');
  lines.push('  defaultValue: string | null;');
  lines.push('  lowerLimit: string | null;');
  lines.push('  upperLimit: string | null;');
  lines.push('}');
  lines.push('');
  lines.push('export interface EngineCatalogBrokerKey {');
  lines.push('  key: string;');
  lines.push('  buildCondition?: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface EngineCatalogVersion {');
  lines.push('  label: string;');
  lines.push('  ref: string;');
  lines.push('  commit: string;');
  lines.push('  engineVersion: string;');
  lines.push('  db: EngineCatalogDbParam[];');
  lines.push('  broker: EngineCatalogBrokerKey[];');
  lines.push('}');
  lines.push('');
  lines.push('// prettier-ignore');
  lines.push(
    'export const ENGINE_PARAM_CATALOG: { generatedAt: string; versions: EngineCatalogVersion[] } = {'
  );
  lines.push(`  generatedAt: ${tsString(new Date().toISOString())},`);
  lines.push('  versions: [');
  for (const v of versions) {
    lines.push('    {');
    lines.push(`      label: ${tsString(v.label)},`);
    lines.push(`      ref: ${tsString(v.ref)},`);
    lines.push(`      commit: ${tsString(v.commit)},`);
    lines.push(`      engineVersion: ${tsString(v.engineVersion)},`);
    lines.push('      db: [');
    for (const p of v.db) lines.push(`        ${tsValue(p)},`);
    lines.push('      ],');
    lines.push('      broker: [');
    for (const b of v.broker) lines.push(`        ${tsValue(b)},`);
    lines.push('      ],');
    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------------------------------------------- main */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const versions = [];
  const unresolvedSummary = [];

  for (const ref of args.refs) {
    const commit = gitCommit(args.repo, ref);
    const engineVersion = gitShow(args.repo, ref, 'VERSION').trim();
    const label = ref.replace(/^origin\//, '');
    const db = parseDb(
      gitShow(args.repo, ref, 'src/base/system_parameter.c'),
      gitShow(args.repo, ref, 'src/base/system_parameter.h'),
      ENGINE_MACRO_HEADERS.map((f) => gitShowOptional(args.repo, ref, f)).filter((x) => x !== null),
      label
    );
    const broker = parseBroker(gitShow(args.repo, ref, 'src/broker/broker_config.c'), label);

    for (const sc of SPOT_CHECKS) {
      const p = db.params.find((x) => x.key === sc.key);
      if (!p) continue;
      for (const [field, expected] of Object.entries(sc)) {
        if (field === 'key') continue;
        check(
          p[field] === expected,
          `${label}: spot check ${sc.key}.${field} = ${p[field]}, expected ${expected}`
        );
      }
    }

    const base = BASELINE[ref];
    if (base && base.commit === commit) {
      check(
        db.defCount === base.db,
        `${label}: expected ${base.db} prm_Def entries, got ${db.defCount}`
      );
      check(
        db.rawCount === base.rawDb,
        `${label}: expected ${base.rawDb} raw prm_Def entries, got ${db.rawCount}`
      );
      check(
        broker.length === base.broker,
        `${label}: expected ${base.broker} broker keywords, got ${broker.length}`
      );
    } else if (base) {
      console.warn(
        `note: ${ref} moved from baseline ${base.commit.slice(0, 10)} to ${commit.slice(0, 10)}; count baseline skipped`
      );
    }

    console.log(
      `${label.padEnd(14)} ${engineVersion.padEnd(8)} ${commit.slice(0, 10)}  prm_Def=${db.defCount} enum=${db.enumCount}` +
        ` raw=${db.rawCount} compiledOut=[${db.compiledOut}]` +
        `  broker=${broker.length}  unresolvedParams=${db.stats.unresolvedByParam.length}` +
        (db.orphanNames.length ? `  unusedPRM_NAME=[${db.orphanNames.join(',')}]` : '')
    );
    unresolvedSummary.push(...db.stats.unresolved.map((u) => `${label}: ${u}`));

    versions.push({
      label,
      ref,
      commit,
      engineVersion,
      db: [...db.params].sort(byKey),
      broker: [...broker].sort(byKey),
    });
  }

  const dbUnion = new Set(versions.flatMap((v) => v.db.map((p) => p.key)));
  const brokerUnion = new Set(versions.flatMap((v) => v.broker.map((b) => b.key)));
  console.log(`union: db=${dbUnion.size} broker=${brokerUnion.size}`);
  const allAtBaseline =
    args.refs.length === DEFAULT_REFS.length &&
    args.refs.every((r, i) => r === DEFAULT_REFS[i] && BASELINE[r].commit === versions[i].commit);
  if (allAtBaseline) {
    check(
      dbUnion.size === BASELINE_UNION.db,
      `union of db keys is ${dbUnion.size}, expected ${BASELINE_UNION.db}`
    );
    check(
      brokerUnion.size === BASELINE_UNION.broker,
      `union of broker keys is ${brokerUnion.size}, expected ${BASELINE_UNION.broker}`
    );
  }
  for (const k of BASELINE_UNION.dbKeys) {
    if (args.refs.join(',') === DEFAULT_REFS.join(','))
      check(dbUnion.has(k), `union of db keys lacks ${k}`);
  }

  const distinctUnresolved = [
    ...new Set(unresolvedSummary.map((u) => u.replace(/^[^:]+: /, ''))),
  ].sort();
  console.log(`unresolved value expressions: ${distinctUnresolved.length} distinct`);
  for (const u of distinctUnresolved) console.log(`  ${u}`);

  if (failures.length) {
    console.error(`\n${failures.length} self-check failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, render(versions));
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
}

main();
