/**
 * An engine sentence (CMS passes utility output on in English) in the UI
 * language: first an exact match in CM[exact], then the first matching
 * [pattern, say] in CM[patterns]. Neither is in the English labels, so
 * English gets the sentence as it is, and so does an unknown sentence.
 */
export function engineSentence(CM, text, { exact, patterns } = {}) {
  const known = exact ? CM[exact]?.[text] : undefined;
  if (known) return known;
  for (const [pattern, say] of (patterns ? CM[patterns] : null) ?? []) {
    const match = pattern.exec(text);
    if (match) return say(match);
  }
  return text;
}
