import { ParamSchemaEntry } from './param-schema-entry';
import { validateParamValue } from './validate-param-value';

export interface ParamsValidationResult {
  /** key -> reason, for keys that exist in the schema but failed their guard. */
  errors: Record<string, string>;
  /** Keys present in `params` that aren't in the schema at all (nothing to validate them against, and nowhere to write them either). */
  unknownKeys: string[];
}

/**
 * Validates every key in `params` against `schema` (a resolved,
 * per-host-version entry list). Used identically on both sides: the
 * frontend runs it against the schema it just fetched to disable Apply /
 * show inline errors, and the backend runs it again against the same
 * schema (re-resolved server-side, never trusting the client's copy)
 * before writing anything to conf — replacing the old per-field
 * class-validator DTOs, which couldn't vary by engine version.
 */
export function validateParams(
  schema: ParamSchemaEntry[],
  params: Record<string, unknown>
): ParamsValidationResult {
  const schemaByKey = new Map(schema.map(entry => [entry.key, entry]));
  const errors: Record<string, string> = {};
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    const entry = schemaByKey.get(key);
    if (!entry) {
      unknownKeys.push(key);
      continue;
    }
    const reason = validateParamValue(entry.guard, value);
    if (reason) errors[key] = reason;
  }

  return { errors, unknownKeys };
}
