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
  | { kind: 'enum'; options: string[] }
  | { kind: 'int'; min?: number; max?: number }
  | { kind: 'float'; min?: number; max?: number }
  // 64-bit values travel as decimal-digit strings so they never pass
  // through a JS `number` (precision loss above 2^53). `min`/`max` are
  // themselves decimal strings, compared via BigInt.
  | { kind: 'bigint'; min?: string; max?: string }
  | { kind: 'intList' }
  // Digits with an optional trailing K/M/G/T unit suffix (cubrid.conf's
  // PRM_SIZE_UNIT buffer "_size" keys once their unit letter is appended,
  // and broker.conf's APPL_SERVER_MAX_SIZE family). `min`/`max` bound the
  // numeric part only, before the suffix.
  | { kind: 'size'; min?: number; max?: number }
  | { kind: 'string' };
