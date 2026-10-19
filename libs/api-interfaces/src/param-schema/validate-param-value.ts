import { ParamGuard } from './param-guard';

/**
 * Validates a raw string value against a guard. Returns `null` when
 * valid, or a short human-readable reason when not. Empty string is
 * treated as valid (an unset field falls back to the engine/schema
 * default, not 0) — same contract the frontend's old client-only
 * `validateParamValue` had, now reused unchanged as the backend's actual
 * request validation too.
 */
export function validateParamValue(guard: ParamGuard | undefined, rawValue: unknown): string | null {
  if (!guard) return null;
  const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
  if (value === '') return null;

  switch (guard.kind) {
    case 'enum':
      return guard.options.includes(value) ? null : `Must be one of: ${guard.options.join(', ')}`;
    case 'intList': {
      const parts = value.split(',').map(s => s.trim()).filter(s => s !== '');
      const allInts = parts.length > 0 && parts.every(p => /^-?\d+$/.test(p));
      return allInts ? null : 'Comma-separated integers only (e.g. -493,-494)';
    }
    case 'bigint': {
      if (!/^-?\d+$/.test(value.trim())) return 'Must be an integer';
      const n = BigInt(value.trim());
      if (guard.min !== undefined && n < BigInt(guard.min)) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > BigInt(guard.max)) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'int': {
      if (!/^-?\d+$/.test(value.trim())) return 'Must be an integer';
      const n = Number(value.trim());
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'size': {
      // Digits with an optional trailing K/M/G/T unit suffix.
      const match = /^(\d+)([KMGT])?$/i.exec(value.trim());
      if (!match) return 'Must be a number optionally followed by K/M/G/T (e.g. 512 or 1G)';
      const n = Number(match[1]);
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'float': {
      const n = Number(value.trim());
      if (Number.isNaN(n)) return 'Must be a number';
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    default:
      return null;
  }
}
