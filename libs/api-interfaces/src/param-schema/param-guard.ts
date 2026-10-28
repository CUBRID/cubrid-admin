/**
 * Value-constraint rule for one conf parameter, shared between the
 * frontend (client-side input validation / Select-vs-Input rendering) and
 * the backend (request validation before a conf write). A single
 * definition here replaces what used to be two hand-maintained copies —
 * `apps/web-manager/src/constants/paramGuards.js` and the per-field
 * class-validator decorators in `config-params.dto.ts`.
 *
 * `enum` subsumes boolean fields (yes/no, ON/OFF, …) — CUBRID's own
 * conf parser treats both the same way (a case-insensitive keyword-table
 * lookup), so there is no real distinction to preserve.
 */
export type ParamGuard =
  // Keyword lookups are case-insensitive in both engines (system_parameter.c
  // prm_keyword → intl_mbs_casecmp, broker_config.c get_conf_value →
  // strcasecmp). `numericRange`: cubrid.conf PRM_KEYWORD values also
  // accept a plain integer within the parameter's limits when no keyword
  // matches; broker keyword tables never do.
  | { kind: 'enum'; options: string[]; numericRange?: { min: number; max: number } }
  // cubrid.conf PRM_BOOLEAN — the engine's boolean_words table:
  // yes/y/1/true/on and no/n/0/false/off, case-insensitive.
  | { kind: 'boolean' }
  // `base`: how the reader parses it. cubrid.conf (parse_int) is base 10.
  // broker.conf ini_getint is strtol base 0 (0x.. hex, leading-0 octal)
  // and ini_gethex is base 16 — and both silently turn an unparsable value
  // into 0 rather than failing, which then trips the key's own range check.
  | { kind: 'int'; min?: number; max?: number; base?: 0 | 10 | 16 }
  | { kind: 'float'; min?: number; max?: number }
  // 64-bit values travel as decimal-digit strings so they never pass
  // through a JS `number` (precision loss above 2^53). `min`/`max` are
  // themselves decimal strings, compared via BigInt.
  | { kind: 'bigint'; min?: string; max?: string }
  // PRM_INTEGER_LIST. `allowDefaultElement`: only call_stack_dump_activation_list
  // expands a literal `default` element (to the engine's built-in error
  // code list); for every other list the engine rejects it.
  | { kind: 'intList'; allowDefaultElement?: boolean }
  // Digits with an optional trailing K/M/G/T unit suffix (cubrid.conf's
  // PRM_SIZE_UNIT buffer "_size" keys once their unit letter is appended,
  // and broker.conf's APPL_SERVER_MAX_SIZE family). `min`/`max` are in
  // BYTES — the value is decomposed into its numeric part and unit letter
  // and converted to bytes (K=1024, M=1024^2, G=1024^3, T=1024^4, no
  // suffix=as-is) before being compared, so "20K" and "20M" are correctly
  // told apart instead of both reading as the numeric prefix "20". No
  // existing entry relied on the old numeric-prefix-only comparison (only
  // `APPL_SERVER_MAX_SIZE_HARD_LIMIT`'s `min: 1` used it, and "reject
  // exactly zero regardless of unit" behaves identically either way).
  // Bounds may be decimal strings: the engine compares the parsed byte count
  // as a UINT64 against INT64-sized limits (prm_check_range), which a JS
  // number cannot hold exactly (e.g. 9223372036854775807).
  | { kind: 'size'; min?: number | string; max?: number | string }
  // broker.conf sizes (broker_util.c ut_size_string_to_kbyte) — NOT the
  // engine's size rules: a value with no unit is read in `defaultUnit`
  // (MB for APPL_SERVER_MAX_SIZE*, KB for the log sizes), only
  // b/k/kb/m/mb/g/gb exist, and the result is kilobytes that must fit an
  // int. `minKb` applies to the int-truncated kilobytes the broker keeps.
  | { kind: 'brokerSize'; defaultUnit: 'K' | 'M'; minKb?: number; maxKb?: number }
  // broker.conf times (broker_util.c ut_time_string_to_sec): ms/msec,
  // s/sec, min, h, default seconds, decimals allowed; > INT_MAX or < 0
  // fails. `truncate`: the broker keeps (int) seconds and range-checks
  // that; otherwise the raw float seconds are checked.
  | { kind: 'brokerTime'; minSec?: number; maxSec?: number; truncate?: boolean }
  // cubrid.conf PRM_TIME_UNIT (util_time_string_to_msec): ms/msec, s/sec,
  // min, h, no unit = ms, decimals allowed; a negative number is taken
  // as-is with no unit check (the engine's "unlimited" convention).
  // `min`/`max` are in milliseconds.
  | { kind: 'time'; min?: number; max?: number }
  // A keyword value whose word table isn't modeled (generated from the
  // engine catalog for keys with no schema entry): only non-emptiness is
  // checked, since the engine's own word list isn't known here.
  | { kind: 'opaque' }
  // cm.conf max_log_filesize: whole megabytes with an optional trailing
  // m/M (cm_config.cpp strips one 'M' then atoi()s and multiplies by
  // 1024 * 1024 into an int).
  | { kind: 'cmsMegabytes'; min: number; max: number }
  | { kind: 'string' };
