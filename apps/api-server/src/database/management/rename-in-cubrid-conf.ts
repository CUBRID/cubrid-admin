// Same normalization as the engine: `@` names keep their case, others don't.
function sectionOf(trimmed: string): string | null {
  const match = /^\[\s*(.*?)\s*\]$/.exec(trimmed);
  if (!match) return null;
  const name = match[1];
  return name.startsWith('@') ? `@${name.slice(1).trim()}` : name.toLowerCase();
}

/**
 * A `server=` line of `[service]` with its database list passed through
 * `mapNames`, or null when the line isn't one or the list is unchanged.
 * The value is read as the engine does (parseConfText): a quoted value runs
 * to its closing quote, anything else stops at the first `;` or `#`. The
 * quotes and whatever follows the value are kept.
 */
function rewriteServerLine(line: string, mapNames: (names: string[]) => string[]): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith(';')) return null;
  const eq = trimmed.indexOf('=');
  if (eq < 0 || trimmed.slice(0, eq).trim().toLowerCase() !== 'server') return null;
  const rest = trimmed.slice(eq + 1).trimStart();
  const quote = rest[0] === '"' || rest[0] === "'" ? rest[0] : '';
  let value: string;
  let tail: string;
  if (quote) {
    const close = rest.indexOf(quote, 1);
    value = close === -1 ? rest.slice(1) : rest.slice(1, close);
    tail = close === -1 ? '' : rest.slice(close + 1);
  } else {
    const commentAt = rest.search(/[;#]/);
    value = commentAt === -1 ? rest : rest.slice(0, commentAt);
    tail = commentAt === -1 ? '' : ` ${rest.slice(commentAt)}`;
  }
  const names = value.split(',').map((name) => name.trim()).filter(Boolean);
  const mapped = [...new Set(mapNames(names))];
  if (mapped.length === names.length && mapped.every((name, i) => name === names[i])) return null;
  return `server=${quote}${mapped.join(',')}${quote}${tail}`;
}

/**
 * cubrid.conf lines that still name a database after `renamedb`, which only
 * renames databases.txt and the volume files: the `[service]` autostart list
 * (`server=`) and the database's own `[@dbname]` section. Returns the
 * rewritten lines, or null when nothing names the old database.
 *
 * The `[@dbname]` header is left alone if a `[@newname]` section already
 * exists, so two sections are never merged under one name.
 */
export function renameDbInCubridConf(confdata: string[], oldName: string, newName: string): string[] | null {
  const lines = [...confdata];
  let changed = false;
  let section: string | null = null;
  const hasNewSection = lines.some((line) => sectionOf(line.trim()) === `@${newName}`);

  lines.forEach((line, index) => {
    const header = sectionOf(line.trim());
    if (header !== null) {
      section = header;
      if (header === `@${oldName}` && !hasNewSection) {
        lines[index] = `[@${newName}]`;
        changed = true;
      }
      return;
    }
    if (section !== 'service') return;
    const rewritten = rewriteServerLine(line, (names) => names.map((name) => (name === oldName ? newName : name)));
    if (rewritten !== null) {
      lines[index] = rewritten;
      changed = true;
    }
  });

  return changed ? lines : null;
}

/**
 * cubrid.conf lines after deleting `dbname`: it leaves the `[service]`
 * autostart list, and its own `[@dbname]` section (header up to the next
 * header) is removed so a later database of that name doesn't inherit it.
 * Returns null when nothing names it.
 */
export function forgetDbInCubridConf(confdata: string[], dbname: string): string[] | null {
  const out: string[] = [];
  let changed = false;
  let section: string | null = null;
  for (const line of confdata) {
    const header = sectionOf(line.trim());
    if (header !== null) section = header;
    if (section === `@${dbname}`) {
      changed = true;
      continue;
    }
    if (section === 'service' && header === null) {
      const rewritten = rewriteServerLine(line, (names) => names.filter((name) => name !== dbname));
      if (rewritten !== null) {
        out.push(rewritten);
        changed = true;
        continue;
      }
    }
    out.push(line);
  }
  return changed ? out : null;
}
