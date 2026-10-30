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
    // The engine stops a value at the first `;` or `#`; that tail is kept.
    const rest = trimmed.slice(eq + 1);
    const commentAt = rest.search(/[;#]/);
    const value = commentAt === -1 ? rest : rest.slice(0, commentAt);
    const comment = commentAt === -1 ? '' : ` ${rest.slice(commentAt)}`;
    const names = value.split(',').map((name) => name.trim()).filter(Boolean);
    if (!names.includes(oldName)) return;
    const renamed = names.map((name) => (name === oldName ? newName : name));
    lines[index] = `server=${[...new Set(renamed)].join(',')}${comment}`;
    changed = true;
  });

  return changed ? lines : null;
}
