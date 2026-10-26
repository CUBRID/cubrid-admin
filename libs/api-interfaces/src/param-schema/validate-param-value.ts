import { ParamGuard } from './param-guard';

// system_parameter.c boolean_words, identical on every catalogued version.
const BOOLEAN_WORDS = ['yes', 'y', '1', 'true', 'on', 'no', 'n', '0', 'false', 'off'];

// system_parameter.c allocates 1024 ints for a list, slot 0 holding the count.
const INT_LIST_MAX_ELEMENTS = 1023;

function isInt32(s: string): boolean {
  if (!/^\s*[+-]?\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647;
}

// The numeric prefix strtod() would consume (decimal forms only).
function parseLeadingNumber(value: string): { number: number; rest: string } | null {
  const match = /^[ \t\n\v\f\r]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(value);
  if (!match) return null;
  return { number: Number(match[0].trim()), rest: value.slice(match[0].length) };
}

const ENGINE_TIME_UNIT_MS: Record<string, number> = { '': 1, ms: 1, msec: 1, s: 1000, sec: 1000, min: 60000, h: 3600000 };

const BROKER_TIME_UNIT_SEC: Record<string, number> = { ms: 0.001, msec: 0.001, s: 1, sec: 1, min: 60, h: 3600 };

// C strtol + parse_int's "whole string, 32-bit" rule, for base 10, 16
// (optional 0x) or 0 (0x.. hex, leading-0 octal, else decimal).
function parseCInt(s: string, base: 0 | 10 | 16): number | null {
  const m = /^([+-]?)([\s\S]*)$/.exec(s.replace(/^[ \t\n\v\f\r]+/, ''));
  if (!m) return null;
  const [, sign, body] = m;
  let digits = body;
  let radix: number = base;
  if ((base === 16 || base === 0) && /^0x[0-9a-f]/i.test(body)) { digits = body.slice(2); radix = 16; }
  else if (base === 0) radix = body.length > 1 && body.startsWith('0') ? 8 : 10;
  const valid = { 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i }[radix as 8 | 10 | 16];
  if (!valid.test(digits)) return null;
  const n = (sign === '-' ? -1 : 1) * parseInt(digits, radix);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}

/**
 * An `int` guard's value as its reader parses it (base 10 for cubrid.conf,
 * strtol base 0 or 16 for broker.conf), or null when it would not parse.
 */
export function parseGuardInt(guard: { base?: 0 | 10 | 16 }, value: string): number | null {
  return parseCInt(value.trim(), guard.base ?? 10);
}

const BROKER_SIZE_UNIT_KB: Record<string, number> = { B: 1 / 1024, K: 1, KB: 1, M: 1024, MB: 1024, G: 1024 ** 2, GB: 1024 ** 2 };

const SIZE_UNIT_BYTES: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

const ENGINE_SIZE_UNIT_BYTES: Record<string, number> = {
  '': 1, B: 1, K: 1024, KB: 1024, M: 1024 ** 2, MB: 1024 ** 2, G: 1024 ** 3, GB: 1024 ** 3,
  T: 1024 ** 4, TB: 1024 ** 4, P: 1024 ** 5, PB: 1024 ** 5,
};

/**
 * cubrid.conf size value to bytes, as util_size_string_to_byte reads it:
 * strtod (decimals allowed), then the WHOLE remainder must be one of
 * b/k/kb/m/mb/g/gb/t/tb/p/pb (case-insensitive) or nothing; negative
 * fails; the result is truncated to an integer. Null when the engine
 * would reject it.
 */
export function parseEngineSizeToBytes(value: string): number | null {
  const parsed = parseLeadingNumber(value.trim());
  if (!parsed || parsed.number < 0) return null;
  const factor = ENGINE_SIZE_UNIT_BYTES[parsed.rest.toUpperCase()];
  if (factor === undefined) return null;
  return Math.trunc(parsed.number * factor);
}

/**
 * Renders a byte count back as a K/M/G/T-suffixed size for error messages
 * — picks the largest unit that divides `bytes` evenly (e.g. 20971520 ->
 * "20M", not "20971520"), falling back to raw bytes if none does.
 */
function formatBytesAsSize(bytes: number): string {
  for (const unit of ['T', 'G', 'M', 'K'] as const) {
    const factor = SIZE_UNIT_BYTES[unit];
    if (bytes % factor === 0) return `${bytes / factor}${unit}`;
  }
  return bytes === 1 ? '1 byte' : `${bytes} bytes`;
}

function formatSizeBound(bound: number | string): string {
  const n = Number(bound);
  return Number.isSafeInteger(n) ? formatBytesAsSize(n) : `${bound} bytes`;
}

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
    case 'enum': {
      const lower = value.toLowerCase();
      if (guard.options.some(o => o.toLowerCase() === lower)) return null;
      if (guard.numericRange && isInt32(value)) {
        const n = Number(value);
        if (n >= guard.numericRange.min && n <= guard.numericRange.max) return null;
      }
      return `Must be one of: ${guard.options.join(', ')}`;
    }
    case 'boolean':
      return BOOLEAN_WORDS.includes(value.toLowerCase()) ? null : 'Must be yes/no (also y/n, 1/0, true/false, on/off)';
    case 'intList': {
      // system_parameter.c: a whole value of `null`/`0` (null_words,
      // case-insensitive) means "no list". Otherwise it splits on ',' and
      // runs parse_int on each piece as-is — no trimming, so an empty
      // piece ("1,,2", trailing ",") or trailing whitespace ("1 ,2") fails
      // the load, while leading whitespace is fine (strtol skips it).
      if (/^(null|0)$/i.test(value)) return null;
      const parts = value.split(',');
      if (parts.length > INT_LIST_MAX_ELEMENTS) return `At most ${INT_LIST_MAX_ELEMENTS} values`;
      const ok = parts.every(p => (guard.allowDefaultElement && /^default$/i.test(p)) || isInt32(p));
      return ok ? null : 'Comma-separated integers only, no empty entries (e.g. -493,-494)';
    }
    case 'bigint': {
      if (!/^-?\d+$/.test(value.trim())) return 'Must be an integer';
      const n = BigInt(value.trim());
      if (guard.min !== undefined && n < BigInt(guard.min)) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > BigInt(guard.max)) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'int': {
      const n = parseCInt(value.trim(), guard.base ?? 10);
      if (n === null) return guard.base === 16 ? 'Must be a hexadecimal 32-bit integer' : 'Must be a 32-bit integer';
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'size': {
      const bytes = parseEngineSizeToBytes(value);
      if (bytes === null) return 'Must be a number optionally followed by B, K/KB, M/MB, G/GB, T/TB or P/PB (e.g. 512M or 0.5G)';
      // `bytes` is an integer-valued double, as the engine's own (UINT64) cast
      // of strtod()'s result is, so BigInt compares it exactly.
      if (!Number.isFinite(bytes)) return 'Value is too large';
      if (guard.min !== undefined && BigInt(bytes) < BigInt(guard.min)) return `Must be >= ${formatSizeBound(guard.min)}`;
      if (guard.max !== undefined && BigInt(bytes) > BigInt(guard.max)) return `Must be <= ${formatSizeBound(guard.max)}`;
      return null;
    }
    case 'brokerSize': {
      const parsed = parseLeadingNumber(value);
      if (!parsed) return 'Must be a number optionally followed by B/K/M/G (e.g. 512 or 1G)';
      // ut_size_string_to_kbyte only treats the rest as a unit when it
      // starts with a letter; anything else falls back to the default unit.
      const unit = /^[a-z]/i.test(parsed.rest) ? parsed.rest.toUpperCase() : guard.defaultUnit;
      const factor = BROKER_SIZE_UNIT_KB[unit];
      if (factor === undefined) return 'Unit must be B, K/KB, M/MB or G/GB';
      const kb = parsed.number * factor;
      if (kb > 2147483647) return 'Must be under 2T';
      const truncatedKb = Math.trunc(kb);
      if (guard.minKb !== undefined && truncatedKb < guard.minKb) return `Must be >= ${guard.minKb}K`;
      if (guard.maxKb !== undefined && truncatedKb > guard.maxKb) return `Must be <= ${guard.maxKb}K`;
      return null;
    }
    case 'brokerTime': {
      const parsed = parseLeadingNumber(value);
      if (!parsed) return 'Must be a number optionally followed by ms/s/min/h (e.g. 60 or 1min)';
      const unit = /^[a-z]/i.test(parsed.rest) ? parsed.rest.toLowerCase() : 'sec';
      const factor = BROKER_TIME_UNIT_SEC[unit];
      if (factor === undefined) return 'Unit must be ms/msec, s/sec, min or h';
      const sec = parsed.number * factor;
      if (sec > 2147483647) return 'Too large';
      const checked = guard.truncate ? Math.trunc(sec) : sec;
      if (checked < (guard.minSec ?? 0)) return `Must be >= ${guard.minSec ?? 0} seconds`;
      if (guard.maxSec !== undefined && checked > guard.maxSec) return `Must be <= ${guard.maxSec} seconds`;
      return null;
    }
    case 'time': {
      const parsed = parseLeadingNumber(value.trim());
      if (!parsed) return 'Must be a number optionally followed by ms, s, min or h (e.g. 500ms or 30s)';
      let ms: number;
      if (parsed.number < 0) {
        ms = Math.trunc(parsed.number);
      } else {
        const factor = ENGINE_TIME_UNIT_MS[parsed.rest.toLowerCase()];
        if (factor === undefined) return 'Unit must be ms/msec, s/sec, min or h';
        ms = Math.trunc(parsed.number * factor);
      }
      if (guard.min !== undefined && ms < guard.min) return `Must be >= ${guard.min} ms`;
      if (guard.max !== undefined && ms > guard.max) return `Must be <= ${guard.max} ms`;
      return null;
    }
    case 'float': {
      const n = Number(value.trim());
      if (Number.isNaN(n)) return 'Must be a number';
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'cmsMegabytes': {
      const match = /^(\d+)[mM]?$/.exec(value.trim());
      if (!match) return 'Must be a whole number of megabytes, optionally followed by M (e.g. 4M)';
      const mb = Number(match[1]);
      if (mb < guard.min) return `Must be >= ${guard.min}M`;
      if (mb > guard.max) return `Must be <= ${guard.max}M`;
      return null;
    }
    default:
      return null;
  }
}
