import { parseConfText } from '@api-interfaces';

// Edits to cubrid.conf that change only the part they must: the database
// names inside a `[service] server=` value, or the name inside a `[@dbname]`
// header. Indentation, key case, spacing, quotes, comments and every other
// line are kept as the file had them.

const isIniSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\v' || c === '\f' || c === '\r';

function trimIniEnd(s: string): string {
  let end = s.length;
  while (end > 0 && isIniSpace(s[end - 1])) end--;
  return s.slice(0, end);
}

/**
 * The physical lines a key starting at `start` spans, and the logical line
 * the engine reads from them: a line ending in `\` (after trailing spaces)
 * continues on the next, joined with nothing in between (parseConfText).
 */
function logicalLine(confdata: string[], start: number): { end: number; line: string } {
  let line = '';
  for (let i = start; i < confdata.length; i++) {
    const stripped = trimIniEnd(confdata[i].replace(/\r$/, ''));
    if (!stripped.endsWith('\\')) return { end: i, line: line + confdata[i] };
    line += stripped.slice(0, -1);
  }
  return { end: confdata.length - 1, line };
}

/**
 * `line` (a `server=` key) with its database names passed through `edit`, or
 * null when they don't change. The value is found as the engine reads it
 * (parseKeyValue): inside the quotes when quoted, otherwise up to the first
 * `;` or `#`. A name keeps the spacing of the list position it lands on;
 * for a key that was `continued` over lines, the spacing a continuation
 * line's indentation left between names becomes a single space.
 */
function editServerValue(line: string, edit: (names: string[]) => string[], continued: boolean): string | null {
  const eq = line.indexOf('=');
  let from = eq + 1;
  while (from < line.length && isIniSpace(line[from])) from++;
  let to: number;
  const quote = line[from];
  if (quote === '"' || quote === "'") {
    const close = line.indexOf(quote, from + 1);
    from += 1;
    to = close === -1 ? line.length : close;
  } else {
    const commentAt = line.slice(from).search(/[;#]/);
    to = commentAt === -1 ? line.length : from + commentAt;
  }
  const value = line.slice(from, to);
  const pre = value.match(/^\s*/)?.[0] ?? '';
  const core = value.trim();
  const post = core === '' ? value.slice(pre.length) : value.slice(value.lastIndexOf(core) + core.length);
  const raw = core === '' ? [] : core.split(',');
  const names = raw.map((token) => token.trim()).filter(Boolean);
  const edited = edit(names);
  if (edited.length === names.length && edited.every((name, i) => name === names[i])) return null;

  const lead = raw.map((token, i) => {
    const ws = token.match(/^\s*/)?.[0] ?? '';
    return continued && i > 0 && ws !== '' ? ' ' : ws;
  });
  const trail = raw.map((token) => token.slice(token.trimEnd().length));
  const sepLead = lead.find((ws, i) => i > 0) ?? '';
  const tokens = edited.map((name, i) => (i < raw.length ? `${lead[i]}${name}${trail[i]}` : `${sepLead}${name}`));
  return `${line.slice(0, from)}${pre}${tokens.join(',').trimEnd()}${post}${line.slice(to)}`;
}

/**
 * cubrid.conf with the database list of `[service] server=` passed through
 * `edit` (every such key, or only the first with `firstOnly`). A key whose
 * list changes and that was continued over several lines with `\` becomes one
 * line, since its pieces can't be told apart once names move. Returns
 * `confdata` itself when nothing changes.
 */
export function editServerList(
  confdata: string[],
  edit: (names: string[]) => string[],
  { firstOnly = false }: { firstOnly?: boolean } = {}
): string[] {
  const entries = serverEntries(confdata);
  let updated = confdata;
  // Back to front, so joining a continued key keeps the earlier indexes.
  for (const entry of (firstOnly ? entries.slice(0, 1) : entries).reverse()) {
    const start = entry.lineNo - 1;
    const { end, line } = logicalLine(confdata, start);
    const rewritten = editServerValue(line, edit, end > start);
    if (rewritten === null) continue;
    if (updated === confdata) updated = [...confdata];
    updated.splice(start, end - start + 1, rewritten);
  }
  return updated;
}

/** The `[service] server=` keys, as the engine reads them, in file order. */
export function serverEntries(confdata: string[]): Array<{ value: string; lineNo: number }> {
  return (
    parseConfText(confdata)
      .sections.find((section) => section.name === 'service')
      ?.entries.filter((entry) => entry.key.toLowerCase() === 'server') ?? []
  );
}

/** 1-based line of the `[service]` header, or undefined without one. */
export function serviceHeaderLine(confdata: string[]): number | undefined {
  return parseConfText(confdata).sections.find((section) => section.name === 'service')?.lineNo;
}

const listNames = (value: string) => value.split(',').map((name) => name.trim()).filter(Boolean);

/** Whether some `[service] server=` key lists `dbname`. */
export function isAutostart(confdata: string[], dbname: string): boolean {
  return serverEntries(confdata).some((entry) => listNames(entry.value).includes(dbname));
}

/** `oldName` renamed in every autostart list; a resulting duplicate is dropped. */
export function renameAutostart(confdata: string[], oldName: string, newName: string): string[] {
  return editServerList(confdata, (names) => {
    if (!names.includes(oldName)) return names;
    return [...new Set(names.map((name) => (name === oldName ? newName : name)))];
  });
}

/** `dbname` taken out of every autostart list. */
export function removeAutostart(confdata: string[], dbname: string): string[] {
  return editServerList(confdata, (names) => names.filter((name) => name !== dbname));
}

// Same normalization as the engine: `@` names keep their case, others don't.
function sectionOf(line: string): string | null {
  const match = /^\[\s*(.*?)\s*\]$/.exec(line.trim());
  if (!match) return null;
  const name = match[1];
  return name.startsWith('@') ? `@${name.slice(1).trim()}` : name.toLowerCase();
}

/**
 * cubrid.conf after a rename, for the database's own `[@dbname]` section:
 * only the name inside the `[@oldName]` header becomes `newName`. renamedb
 * leaves cubrid.conf alone, and the engine reads `[@dbname]` by the
 * database's name, so without this the renamed database loses its own
 * settings (on an HA host, `ha_mode=off`) and a later database of the old
 * name inherits them. The `[service] server=` list is renameAutostart's.
 *
 * When a `[@newName]` section already exists, `[@oldName]` is kept so two
 * sections are never merged under one name; `kept` says so.
 */
export function renameDbSection(confdata: string[], oldName: string, newName: string): { lines: string[]; kept: boolean } {
  const hasOld = confdata.some((line) => sectionOf(line) === `@${oldName}`);
  const hasNew = confdata.some((line) => sectionOf(line) === `@${newName}`);
  if (!hasOld) return { lines: confdata, kept: false };
  if (hasNew) return { lines: confdata, kept: true };
  return {
    lines: confdata.map((line) =>
      sectionOf(line) === `@${oldName}`
        ? line.replace(/^(\s*\[\s*@\s*)(.*?)(\s*\]\s*)$/, (_m, head: string, _name: string, tail: string) => `${head}${newName}${tail}`)
        : line
    ),
    kept: false,
  };
}

/**
 * cubrid.conf lines after deleting `dbname`: it leaves the `[service]`
 * autostart list, and its own `[@dbname]` section is removed so a later
 * database of that name doesn't inherit it. The section runs from its
 * header to its last key; comment and blank lines after that are kept, as
 * they usually introduce the next section. Returns null when nothing names
 * it.
 */
export function forgetDbInCubridConf(confdata: string[], dbname: string): string[] | null {
  const drop = new Set<number>();
  for (let i = 0; i < confdata.length; i++) {
    if (sectionOf(confdata[i]) !== `@${dbname}`) continue;
    let last = i;
    let j = i + 1;
    for (; j < confdata.length && sectionOf(confdata[j]) === null; j++) {
      const trimmed = confdata[j].trim();
      if (trimmed !== '' && !trimmed.startsWith('#')) last = j;
    }
    for (let k = i; k <= last; k++) drop.add(k);
    i = j - 1;
  }
  const kept = drop.size > 0 ? confdata.filter((_line, i) => !drop.has(i)) : confdata;
  const updated = removeAutostart(kept, dbname);
  return updated === confdata ? null : updated;
}
