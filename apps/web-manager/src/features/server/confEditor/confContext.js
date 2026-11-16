/**
 * Where the cursor is in a conf file: the section it is in (lowercased
 * name, null before any heading), and whether it is on a heading, on the
 * key, or on the value of a `key = value` line.
 *
 * @returns {{ section: string|null, place: 'heading'|'key'|'value'|'comment',
 *   from: number, text: string, key?: string }}
 *   `from`/`text`: start and typed part of the word being completed.
 */
export function confContextAt(doc, pos) {
  const line = doc.lineAt(pos);
  let section = null;
  for (let n = line.number - 1; n >= 1; n--) {
    const heading = /^\s*\[([^\]]*)\]/.exec(doc.line(n).text);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      break;
    }
  }
  const before = line.text.slice(0, pos - line.from);
  if (/^\s*#/.test(before)) return { section, place: 'comment', from: pos, text: '' };
  const heading = /^(\s*\[)([^\]]*)$/.exec(before);
  if (heading) return { section, place: 'heading', from: line.from + heading[1].length, text: heading[2] };
  const eq = before.indexOf('=');
  if (eq < 0) {
    const key = /^(\s*)(\S*)$/.exec(before);
    if (!key) return { section, place: 'comment', from: pos, text: '' };
    return { section, place: 'key', from: line.from + key[1].length, text: key[2] };
  }
  const value = /^(\s*)(.*)$/.exec(before.slice(eq + 1));
  return {
    section,
    place: 'value',
    key: before.slice(0, eq).trim(),
    from: line.from + eq + 1 + value[1].length,
    text: value[2],
  };
}

/** The key of the `key = value` line at `pos` and its span, if the pointer is on the key. */
export function confKeyAt(doc, pos) {
  const line = doc.lineAt(pos);
  if (/^\s*[#[]/.test(line.text)) return null;
  const match = /^(\s*)([^=\s]+)\s*=/.exec(line.text);
  if (!match) return null;
  const from = line.from + match[1].length;
  const to = from + match[2].length;
  return pos >= from && pos <= to ? { key: match[2], from, to } : null;
}
