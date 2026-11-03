// Both --estimated-size and --periodic-commit are ARG_INTEGER options read
// with utility_get_option_int_value (CUBRID util_admin.c / load_db.c).
export const LOAD_COUNT_MIN = 1;
export const LOAD_COUNT_MAX = 2_147_483_647;

/** Decimal strings only: keep the value sent to CMS consistent with validation. */
export function isValidLoadCount(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]+$/.test(value)
    && Number(value) >= LOAD_COUNT_MIN && Number(value) <= LOAD_COUNT_MAX;
}

/** CMS omits the corresponding CLI option when its value is "none". */
export function isValidLoadCountOption(value: unknown): value is string {
  return value === 'none' || isValidLoadCount(value);
}
