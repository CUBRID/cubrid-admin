/**
 * Port of the CUBRID engine's own INI reader (`src/base/ini_parser.c`:
 * `ini_parser_load` + `ini_parse_line`) — the parser every cubrid.conf
 * and cubrid_broker.conf load actually goes through. Anything this
 * function accepts or rejects should match what the engine does, because
 * a line the engine can't parse makes the WHOLE file fail to load (the
 * server or broker then refuses to start), while a value the engine reads
 * differently than NCA does gets validated against the wrong thing.
 *
 * Not for cm.conf — CMS reads that with its own, different parser.
 */

export interface ConfTextEntry {
  /** Key as written, trimmed (the engine lowercases it for lookup). */
  key: string;
  /** Value after the engine's own quote/comment stripping and trim. `''` = present but empty. */
  value: string;
  /** 1-based physical line the logical line starts on. */
  lineNo: number;
}

export interface ConfTextSection {
  /**
   * Engine-normalized section name: `null` for keys before any `[...]`
   * header, otherwise lowercased — except an `@`-prefixed name, which the
   * engine keeps case-sensitive. A leading `@`/`%` is kept.
   */
  name: string | null;
  /** Line of the first header for this section (absent for the headerless prelude). */
  lineNo?: number;
  entries: ConfTextEntry[];
}

export interface ConfTextSyntaxError {
  lineNo: number;
  message: string;
}

export interface ParsedConfText {
  /** Same-named sections are merged, in first-appearance order — the engine stores keys as one "section:key" namespace. */
  sections: ConfTextSection[];
  syntaxErrors: ConfTextSyntaxError[];
}

// ini_parser.c: INI_BUFSIZ (512); fgets() leaves room for the terminator,
// and a read that fills the buffer without reaching '\n' (>= 511 chars
// accumulated, continuation lines included) fails the whole load.
const INI_MAX_LINE_LENGTH = 510;

// char_isspace(): ' ', \t, \n, \v, \f, \r
const isIniSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\v' || c === '\f' || c === '\r';

function iniTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isIniSpace(s[start])) start++;
  while (end > start && isIniSpace(s[end - 1])) end--;
  return s.slice(start, end);
}

function skipSpaces(s: string, i: number): number {
  while (i < s.length && isIniSpace(s[i])) i++;
  return i;
}

/**
 * The engine tries, in order:
 *   sscanf (line, "%[^=] = \"%[^\"]\"", key, value)
 *   sscanf (line, "%[^=] = '%[^\']'", key, value)
 *   sscanf (line, "%[^=] = %[^;#]", key, value)
 * and then, for an empty value, "%[^=] = %[;#]" / "%[^=] %[=]".
 * sscanf counts conversions, not literal matches, so an unterminated
 * quote still yields the text after it, and anything after a closing
 * quote is silently ignored. Returns null when every pattern fails.
 */
function parseKeyValue(line: string): { key: string; value: string } | null {
  const eq = line.indexOf('=');
  if (eq <= 0) return null; // %[^=] needs at least one char before '='
  const key = line.slice(0, eq);
  const afterEq = skipSpaces(line, eq + 1);
  const quote = line[afterEq];

  if (quote === '"' || quote === "'") {
    const close = line.indexOf(quote, afterEq + 1);
    const quoted = close === -1 ? line.slice(afterEq + 1) : line.slice(afterEq + 1, close);
    if (quoted.length > 0) return { key, value: quoted };
    // "" / '' fall through: the next pattern reads the quotes themselves,
    // and the engine then maps exactly `""` / `''` to an empty value.
  }

  const rest = line.slice(afterEq);
  const commentAt = rest.search(/[;#]/);
  const value = commentAt === -1 ? rest : rest.slice(0, commentAt);
  if (value.length > 0) return { key, value };
  // "key=", "key=;...", "key=#...", "key =" — all legal, empty value.
  return { key, value: '' };
}

function normalizeSectionName(raw: string): string {
  const trimmed = iniTrim(raw);
  const lead = trimmed[0];
  const name = lead === '@' || lead === '%' ? `${lead}${iniTrim(trimmed.slice(1))}` : trimmed;
  return lead === '@' ? name : name.toLowerCase();
}

export function parseConfText(input: string | string[]): ParsedConfText {
  const physical = Array.isArray(input) ? input : input.split('\n');
  const syntaxErrors: ConfTextSyntaxError[] = [];
  const byName = new Map<string | null, ConfTextSection>();
  const order: ConfTextSection[] = [];
  const sectionFor = (name: string | null, lineNo?: number) => {
    let section = byName.get(name);
    if (!section) {
      section = { name, entries: [], ...(lineNo !== undefined ? { lineNo } : {}) };
      byName.set(name, section);
      order.push(section);
    }
    return section;
  };
  let current = sectionFor(null);

  let pending = '';
  let pendingStart = 0;
  for (let i = 0; i < physical.length; i++) {
    const lineNo = i + 1;
    if (pending === '') pendingStart = lineNo;
    // ini_parser_load strips '\n' and trailing whitespace before looking
    // for a continuation backslash; the backslash itself is overwritten
    // by the next read, so the pieces are joined with nothing in between.
    const raw = physical[i].replace(/\r$/, '');
    let stripped = raw;
    while (stripped.length > 0 && isIniSpace(stripped[stripped.length - 1])) stripped = stripped.slice(0, -1);
    const accumulated = pending + stripped;
    if (pending.length + raw.length > INI_MAX_LINE_LENGTH) {
      syntaxErrors.push({ lineNo, message: `Line is longer than the engine's ${INI_MAX_LINE_LENGTH}-character limit` });
      pending = '';
      continue;
    }
    if (accumulated.endsWith('\\')) {
      pending = accumulated.slice(0, -1);
      continue;
    }
    pending = '';

    const line = iniTrim(accumulated);
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const close = line.indexOf(']');
      const inner = line.slice(1, close);
      // sscanf ("[%[^]]") fails on "[]" and the engine keeps the previous
      // section name, so keys below keep landing in the current section.
      if (inner.length > 0) current = sectionFor(normalizeSectionName(inner), pendingStart);
      continue;
    }

    const kv = parseKeyValue(line);
    if (!kv) {
      syntaxErrors.push({ lineNo: pendingStart, message: 'Not a valid "key = value" line, section header, or # comment' });
      continue;
    }
    let value = iniTrim(kv.value);
    if (value === '""' || value === "''") value = '';
    current.entries.push({ key: iniTrim(kv.key), value, lineNo: pendingStart });
  }
  // A continuation still pending at EOF is dropped by the engine (fgets
  // returns NULL before it's ever parsed) — no error, no value.

  return { sections: order.filter((s) => s.name !== null || s.entries.length > 0), syntaxErrors };
}
