import { ParamSchemaEntry } from './param-schema-entry';

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
    const selfValue = selfRaw === undefined || selfRaw === '' ? NaN : Number(selfRaw);
    const otherValue = otherRaw === undefined || otherRaw === '' ? NaN : Number(otherRaw);
    if (Number.isNaN(selfValue) || Number.isNaN(otherValue)) continue;
    const ok = entry.crossField.rule === 'gte' ? selfValue >= otherValue : selfValue <= otherValue;
    if (!ok) {
      const op = entry.crossField.rule === 'gte' ? '>=' : '<=';
      errors[entry.key] = `Must be ${op} ${entry.crossField.comparedToKey} (currently ${otherValue})`;
    }
  }
  return errors;
}
