import { ParamSchemaEntry } from './param-schema-entry';
import { parseGuardInt } from './validate-param-value';

/**
 * Checks every `crossField` constraint in `schema` against `effectiveParams`
 * — the FULL current value for every key that matters (already merged with
 * schema defaults for anything not explicitly set), not a partial diff.
 * Returns `key -> reason` for the constrained key (not `comparedToKey`).
 *
 * Unlike `validateParams`, this never flags `unknownKeys` or per-value
 * guard errors — it's purely the relationship check, meant to run
 * alongside (not instead of) `validateParams`. Silently skips a
 * constraint when either side's effective value is missing or not a
 * parseable number — a non-numeric guard failure on either key is
 * already caught by `validateParams`'s own per-key check, so this avoids
 * producing a second, confusing error about the same bad input.
 */
export function validateCrossFieldParams(
  schema: ParamSchemaEntry[],
  effectiveParams: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const entry of schema) {
    if (!entry.crossField) continue;
    const selfRaw = effectiveParams[entry.key];
    const otherRaw = effectiveParams[entry.crossField.comparedToKey];
    // Read each side the way its own reader does — broker ini_getint is
    // strtol base 0, so "010" is 8, not 10.
    const otherEntry = schema.find((e) => e.key === entry.crossField?.comparedToKey);
    const selfValue = toComparable(entry, selfRaw);
    const otherValue = toComparable(otherEntry, otherRaw);
    if (Number.isNaN(selfValue) || Number.isNaN(otherValue)) continue;
    const ok = entry.crossField.rule === 'gte' ? selfValue >= otherValue : selfValue <= otherValue;
    if (!ok) {
      const op = entry.crossField.rule === 'gte' ? '>=' : '<=';
      errors[entry.key] = `Must be ${op} ${entry.crossField.comparedToKey} (currently ${otherValue})`;
    }
  }
  return errors;
}

function toComparable(entry: ParamSchemaEntry | undefined, raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return NaN;
  if (entry?.guard.kind === 'int') return parseGuardInt(entry.guard, String(raw)) ?? NaN;
  return Number(raw);
}
