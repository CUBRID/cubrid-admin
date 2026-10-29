import { ParamSchemaEntry } from './param-schema-entry';
import { validateParamValue } from './validate-param-value';
import { validateCrossFieldParams } from './validate-cross-field-params';

const NUMERIC_KINDS = ['int', 'float', 'bigint', 'size', 'time'];

export interface ValidateEffectiveParamsOptions {
  /** Is the section being validated the shared one ([common] / [broker])? */
  isCommonSection: boolean;
  /** How to name that shared section in a message, e.g. "common" or "broker". */
  commonSectionLabel: string;
  /**
   * cubrid.conf only. A key that is present with an empty value
   * (`key=`) is not "unset" to the engine: it parses the empty string
   * like any other value, and every datatype except STRING rejects it,
   * failing the whole conf load. `undefined` still means absent.
   */
  emptyValueIsError?: boolean;
  /**
   * broker.conf: ini_getint/ini_gethex turn an empty value into 0 instead
   * of failing, so an empty int is validated as "0" (its own range check
   * then decides); every other broker reader fails on it.
   */
  emptyIntIsZero?: boolean;
  /**
   * cubrid.conf only. sysprm_generate_new_value accepts `DEFAULT` for any
   * parameter and `MIN`/`MAX` (its own limits) for INTEGER/FLOAT/BIGINT
   * ones, case-insensitive, before any type parsing; for every other
   * datatype `MIN`/`MAX` fails the load. broker.conf has no such words.
   */
  sysprmKeywords?: boolean;
  /**
   * For sections that are neither the shared one nor a plain instance —
   * cubrid.conf's HA host sections ([%host|*], [%host|user], read by the
   * host-wide processes alongside [common] when HA is on) and
   * [standalone] (SA-mode utilities). commonOnly/instanceOnly don't map
   * onto them, so placement isn't checked there.
   */
  skipSectionPlacement?: boolean;
}

/**
 * The single rule engine for "is this section's full effective parameter
 * set valid" — every call site that needs to check a conf section against
 * the schema (table-mode inline errors, the raw editor's per-section
 * checks, and the server's post-merge validation) goes through this one
 * function instead of re-assembling the same checks by hand. Before this
 * existed, required/guard/section-placement/cross-field were each
 * duplicated across 4-6 places (two frontend modals, two raw editors, two
 * backend methods) that had to be kept in sync by hand — this is that
 * consolidation.
 *
 * `params` must be each key's RAW, actually-present value for this
 * section — NOT pre-merged with schema defaults. That distinction is the
 * whole point: a key genuinely absent here (never set) and a key
 * deliberately holding its default value are different states, and
 * conflating them (by having the caller spread `{...defaults, ...actual}`
 * before calling this) silently reintroduces a key that was never really
 * set here at all — which previously made a commonOnly/instanceOnly key
 * with a non-blank default (e.g. database-param-schema.ts's
 * `cubrid_port_id`, default `'1523'`) register as "set in the wrong
 * section" purely because its default leaked back in, even though
 * nothing ever actually wrote it there. Defaults are applied internally,
 * only where they're actually needed (`crossField`, where an untouched
 * key's real engine-effective value still has to be known).
 *
 * Checks run per key, in order, first failure wins for that key:
 * 1. Section placement (`commonOnly` in a non-common section /
 *    `instanceOnly` in the common section) — checked FIRST and only as a
 *    violation when the key actually HAS a (raw, non-blank) value here;
 *    a commonOnly key absent from an instance section (or vice versa) is
 *    the normal, expected case (it simply doesn't live here), not an
 *    error, and must be recognized before the required check below even
 *    looks at it — otherwise a commonOnly `required` key (e.g.
 *    broker.conf's MASTER_SHM_ID) would wrongly be flagged "missing" in
 *    every instance section it was never supposed to be in to begin with.
 * 2. `required` + blank (raw), for a key that DOES belong in this section
 *    — no safe engine fallback at all.
 * 3. `guard` (via `validateParamValue`), on the raw value.
 * Then `crossField` relationships are checked across a separately-built
 * defaulted view (raw value, or `entry.default` when raw is blank),
 * filling in only keys that don't already have an error from 1-3.
 *
 * Unknown keys (not in `schema` at all) are silently ignored — this
 * function only ever validates keys it has schema coverage for; callers
 * that need to reject a request containing a truly unknown key (e.g. a
 * typo) do that separately, since "unknown" is a property of a specific
 * request's own diff, not of a section's full effective state.
 */
export function validateEffectiveParams(
  schema: ParamSchemaEntry[],
  params: Record<string, unknown>,
  options: ValidateEffectiveParamsOptions
): Record<string, string> {
  const { isCommonSection, commonSectionLabel, emptyValueIsError, emptyIntIsZero, sysprmKeywords, skipSectionPlacement } = options;
  const errors: Record<string, string> = {};
  const isValueBlank = (value: unknown) => value === undefined || value === null || String(value).trim() === '';

  for (const entry of schema) {
    const raw = params[entry.key];
    const isBlank = isValueBlank(raw);
    const belongsHere = skipSectionPlacement || (!(entry.commonOnly && !isCommonSection) && !(entry.instanceOnly && isCommonSection));

    if (!belongsHere) {
      // Wrong section for this key — but only a real problem if it's
      // actually set here. Blank just means it's (correctly) absent from
      // a section it was never meant to be in.
      if (!isBlank) {
        errors[entry.key] = entry.commonOnly
          ? `Can only be set in [${commonSectionLabel}], not per-instance.`
          : `Cannot be set in [${commonSectionLabel}], only per-instance.`;
      }
      continue;
    }

    if (emptyIntIsZero && isBlank && raw !== undefined && raw !== null && entry.guard.kind === 'int') {
      const reason = validateParamValue(entry.guard, '0');
      if (reason) errors[entry.key] = `Empty value reads as 0 — ${reason}`;
      continue;
    }
    if (emptyValueIsError && isBlank && raw !== undefined && raw !== null && entry.guard.kind !== 'string') {
      errors[entry.key] = 'Empty value — the engine rejects it and fails to load the file.';
      continue;
    }

    if (entry.required && isBlank) {
      errors[entry.key] = 'This parameter is required and cannot be left blank.';
      continue;
    }
    if (isBlank) continue; // nothing else to check for an absent/blank optional key

    if (sysprmKeywords && /^default$/i.test(String(raw).trim())) continue;
    if (sysprmKeywords && /^(min|max)$/i.test(String(raw).trim())) {
      if (!NUMERIC_KINDS.includes(entry.guard.kind)) {
        errors[entry.key] = 'MIN/MAX only apply to numeric parameters — the engine refuses it here and fails to load the file.';
      }
      continue;
    }

    const reason = validateParamValue(entry.guard, raw);
    if (reason) errors[entry.key] = reason;
  }

  // Defaulted view, built fresh here (not by the caller) — only
  // crossField needs a concrete value for a key nobody actually touched.
  const defaultedParams: Record<string, unknown> = {};
  for (const entry of schema) {
    const raw = params[entry.key];
    defaultedParams[entry.key] = isValueBlank(raw) ? entry.default : raw;
  }
  for (const [key, reason] of Object.entries(validateCrossFieldParams(schema, defaultedParams))) {
    if (!errors[key]) errors[key] = reason;
  }

  return errors;
}
