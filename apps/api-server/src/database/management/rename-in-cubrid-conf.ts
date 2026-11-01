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
  const sectionOf = (trimmed: string): string | null => {
    const match = /^\[\s*(.*?)\s*\]$/.exec(trimmed);
    if (!match) return null;
    const name = match[1];
    // Same normalization as the engine: `@` names keep their case, others don't.
    return name.startsWith('@') ? `@${name.slice(1).trim()}` : name.toLowerCase();
  };
  const hasNewSection = lines.some((line) => sectionOf(line.trim()) === `@${newName}`);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const header = sectionOf(trimmed);
    if (header !== null) {
      section = header;
      if (header === `@${oldName}` && !hasNewSection) {
        lines[index] = `[@${newName}]`;
        changed = true;
      }
      return;
    }
    if (section !== 'service' || trimmed.startsWith('#') || trimmed.startsWith(';')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 0 || trimmed.slice(0, eq).trim().toLowerCase() !== 'server') return;
    // Read the value as the engine does (parseConfText): a quoted value runs
    // to its closing quote, anything else stops at the first `;` or `#`.
    // The quotes and whatever follows the value are kept.
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
    if (!names.includes(oldName)) return;
    const renamed = [...new Set(names.map((name) => (name === oldName ? newName : name)))].join(',');
    lines[index] = `server=${quote}${renamed}${quote}${tail}`;
    changed = true;
  });

  return changed ? lines : null;
}
