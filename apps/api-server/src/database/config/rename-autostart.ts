import { parseConfText } from '@api-interfaces';

/** Replace exact list tokens, keeping comments, quotes, and unrelated lines. */
export function renameAutostart(confdata: string[], oldName: string, newName: string): string[] {
  const entries = parseConfText(confdata).sections
    .find(section => section.name === 'service')?.entries
    .filter(entry => entry.key.toLowerCase() === 'server') ?? [];
  const updated = [...confdata];
  // Work backwards so collapsing a continued logical line retains earlier indices.
  for (const entry of [...entries].reverse()) {
    if (!entry.value.split(',').some(name => name.trim() === oldName)) continue;
    const start = entry.lineNo - 1;
    let end = start;
    let line = '';
    while (end < confdata.length) {
      const part = confdata[end].trimEnd();
      if (!part.endsWith('\\')) { line += part; break; }
      line += part.slice(0, -1);
      end++;
    }
    const eq = line.indexOf('=');
    const afterEq = eq + 1;
    const leading = line.slice(afterEq).match(/^\s*/)?.[0].length ?? 0;
    const valueStart = afterEq + leading;
    const quote = line[valueStart];
    const quoted = quote === '"' || quote === "'";
    const from = valueStart + (quoted ? 1 : 0);
    const stop = quoted ? line.indexOf(quote, from) : line.slice(from).search(/[;#]/);
    const to = stop < 0 ? line.length : quoted ? stop : from + stop;
    let seenNew = false;
    const value = line.slice(from, to).split(',').map(token =>
      token.trim() === oldName ? token.replace(oldName, () => newName) : token
    ).filter(token => {
      if (token.trim() !== newName) return true;
      if (seenNew) return false;
      seenNew = true;
      return true;
    }).join(',');
    updated.splice(start, end - start + 1, line.slice(0, from) + value + line.slice(to));
  }
  return updated;
}
