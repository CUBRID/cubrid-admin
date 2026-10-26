import { describe, expect, it } from 'vitest';
import { validateParamValue } from '@api-interfaces';
// Master schema table — backend-only subpath (not re-exported through the
// main `@api-interfaces` barrel), same import CmsConfigService.getEnv uses.
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { BROKER_PARAM_SCHEMA } from '@api-interfaces/param-schema/broker-param-schema';

describe('validateParamValue', () => {
  it('treats an empty/undefined/null value as valid for every guard kind — falls back to the engine default', () => {
    const guards = [
      { kind: 'enum', options: ['yes', 'no'] },
      { kind: 'int', min: 1, max: 10 },
      { kind: 'float', min: 0 },
      { kind: 'bigint', min: '1' },
      { kind: 'intList' },
      { kind: 'size', min: 1024 },
      { kind: 'string' },
    ];
    for (const guard of guards) {
      expect(validateParamValue(guard, '')).toBeNull();
      expect(validateParamValue(guard, undefined)).toBeNull();
      expect(validateParamValue(guard, null)).toBeNull();
    }
  });

  it('returns null when no guard is given at all', () => {
    expect(validateParamValue(undefined, 'anything')).toBeNull();
  });

  describe('enum — engine keyword lookup', () => {
    const guard = { kind: 'enum', options: ['ON', 'OFF'] };
    it('accepts a listed option in any case', () => {
      expect(validateParamValue(guard, 'ON')).toBeNull();
      expect(validateParamValue(guard, 'on')).toBeNull();
    });
    it('rejects an unlisted option', () => {
      expect(validateParamValue(guard, 'maybe')).toBe('Must be one of: ON, OFF');
    });
    it('accepts an integer inside numericRange (cubrid.conf PRM_KEYWORD fallback) and nothing outside it', () => {
      const keyword = { kind: 'enum', options: ['read_committed'], numericRange: { min: 4, max: 6 } };
      expect(validateParamValue(keyword, '5')).toBeNull();
      expect(validateParamValue(keyword, '7')).not.toBeNull();
      expect(validateParamValue(guard, '1')).not.toBeNull();
    });
  });

  describe('boolean — engine boolean_words', () => {
    it('accepts every synonym in any case', () => {
      for (const v of ['yes', 'Y', '1', 'TRUE', 'on', 'no', 'N', '0', 'False', 'OFF']) {
        expect(validateParamValue({ kind: 'boolean' }, v)).toBeNull();
      }
    });
    it('rejects anything else', () => {
      expect(validateParamValue({ kind: 'boolean' }, 'enable')).not.toBeNull();
    });
  });

  describe('regression: real cubrid.conf keyword values the schema used to reject', () => {
    const entry = key => DATABASE_PARAM_SCHEMA.find(e => e.key === key);
    it('isolation_level: lowercase names, synonyms, and the numeric form', () => {
      for (const v of ['TRAN_READ_COMMITTED', 'read_committed', 'cursor_stability', 'tran_rep_read', '4', '6']) {
        expect(validateParamValue(entry('isolation_level').guard, v)).toBeNull();
      }
      expect(validateParamValue(entry('isolation_level').guard, '3')).not.toBeNull();
    });
    it('ha_mode: role-change, repl, and the numeric form', () => {
      for (const v of ['ON', 'role-change', 'repl', 'fail-back', '5']) {
        expect(validateParamValue(entry('ha_mode').guard, v)).toBeNull();
      }
      expect(validateParamValue(entry('ha_mode').guard, '6')).not.toBeNull();
    });
  });

  describe('intList — engine parse_int per element, no trimming', () => {
    const guard = { kind: 'intList' };
    it('accepts a comma-separated list of integers, including negatives', () => {
      expect(validateParamValue(guard, '-493,-494')).toBeNull();
    });
    it('accepts leading whitespace inside an element (strtol skips it)', () => {
      expect(validateParamValue(guard, '1, 2')).toBeNull();
    });
    it('accepts the null keywords for "no list"', () => {
      expect(validateParamValue(guard, 'NULL')).toBeNull();
      expect(validateParamValue(guard, '0')).toBeNull();
    });
    it('rejects what the engine fails to load', () => {
      for (const v of ['1,two,3', '1,,2', '1,2,', '1 ,2', '1,2147483648']) {
        expect(validateParamValue(guard, v)).not.toBeNull();
      }
    });
    it('rejects more elements than the engine has room for', () => {
      expect(validateParamValue(guard, Array(1023).fill('1').join(','))).toBeNull();
      expect(validateParamValue(guard, Array(1024).fill('1').join(','))).toBe('At most 1023 values');
    });
    it('accepts a "default" element only where the engine expands it', () => {
      expect(validateParamValue({ kind: 'intList', allowDefaultElement: true }, 'default,-1')).toBeNull();
      expect(validateParamValue(guard, 'default,-1')).not.toBeNull();
    });
  });

  describe('bigint', () => {
    const guard = { kind: 'bigint', min: '10', max: '100' };
    it('accepts a value inside the range', () => expect(validateParamValue(guard, '50')).toBeNull());
    it('rejects below min', () => expect(validateParamValue(guard, '9')).toBe('Must be >= 10'));
    it('rejects above max', () => expect(validateParamValue(guard, '101')).toBe('Must be <= 100'));
    it('rejects a non-integer', () => expect(validateParamValue(guard, '1.5')).toBe('Must be an integer'));
  });

  describe('int', () => {
    const guard = { kind: 'int', min: 10, max: 4000 };
    it('accepts a value inside the range', () => expect(validateParamValue(guard, '100')).toBeNull());
    it('accepts an explicit + sign like strtol', () => expect(validateParamValue(guard, '+100')).toBeNull());
    it('rejects below min', () => expect(validateParamValue(guard, '9')).toBe('Must be >= 10'));
    it('rejects above max', () => expect(validateParamValue(guard, '4001')).toBe('Must be <= 4000'));
    it('rejects a non-integer', () => expect(validateParamValue(guard, '3.5')).toBe('Must be a 32-bit integer'));
    it('rejects values outside 32-bit range even with no declared limits (engine parse_int)', () => {
      expect(validateParamValue({ kind: 'int' }, '2147483647')).toBeNull();
      expect(validateParamValue({ kind: 'int' }, '2147483648')).toBe('Must be a 32-bit integer');
      expect(validateParamValue({ kind: 'int' }, '-2147483649')).toBe('Must be a 32-bit integer');
    });
  });

  describe('float', () => {
    const guard = { kind: 'float', min: 0.05, max: 16.0 };
    it('accepts a value inside the range', () => expect(validateParamValue(guard, '4')).toBeNull());
    it('rejects below min', () => expect(validateParamValue(guard, '0.01')).toBe('Must be >= 0.05'));
    it('rejects above max', () => expect(validateParamValue(guard, '16.5')).toBe('Must be <= 16'));
    it('rejects a non-number', () => expect(validateParamValue(guard, 'abc')).toBe('Must be a number'));
    it('accepts what strtod reads in full', () => {
      for (const v of ['1', '+1.5', '.5', '5.', '1e1', '1.5E-1', '0x4']) expect(validateParamValue(guard, v)).toBeNull();
    });
    it('rejects forms strtod stops early on', () => {
      for (const v of ['0b1', '0o7', '1_0', 'Infinity', '1e']) expect(validateParamValue(guard, v)).toBe('Must be a number');
    });
  });

  describe('string', () => {
    it('never rejects anything (no constraint to check)', () => {
      expect(validateParamValue({ kind: 'string' }, 'literally anything at all')).toBeNull();
    });
  });

  describe('size — decomposes <number><unit> and validates in bytes, not just the numeric prefix', () => {
    it('rejects malformed input outright (garbage trailing the unit letter)', () => {
      expect(validateParamValue({ kind: 'size' }, '512MAAA')).toMatch(/^Must be a number optionally followed by/);
    });
    it('accepts every unit spelling and decimal the engine reads (util_size_string_to_byte)', () => {
      for (const v of ['512MB', '512mb', '1GB', '0.5G', '512B', '1P', '1pb', '1.5k', '1e3']) {
        expect(validateParamValue({ kind: 'size' }, v)).toBeNull();
      }
    });
    it('rejects what the engine rejects: negatives, a space before the unit, unknown units', () => {
      for (const v of ['-1M', '512 M', '1E', '1KiB']) expect(validateParamValue({ kind: 'size' }, v)).not.toBeNull();
    });
    it('compares 0.5G as 512M worth of bytes', () => {
      expect(validateParamValue({ kind: 'size', min: 512 * 1024 ** 2 }, '0.5G')).toBeNull();
    });
    it('accepts a bare number as bytes', () => {
      expect(validateParamValue({ kind: 'size', min: 100, max: 1000 }, '500')).toBeNull();
    });
    it('tells "20K" and "20M" apart instead of reading both as numeric prefix "20"', () => {
      const guard = { kind: 'size', min: 20 * 1024 * 1024 }; // 20M floor, in bytes
      expect(validateParamValue(guard, '20K')).toBe('Must be >= 20M'); // 20*1024 bytes, way under
      expect(validateParamValue(guard, '20M')).toBeNull(); // exactly the floor
    });
    it('enforces min/max at the exact byte boundary (inclusive)', () => {
      const guard = { kind: 'size', min: 20 * 1024 * 1024, max: 4 * 1024 ** 3 }; // 20M..4G
      expect(validateParamValue(guard, '19M')).toBe('Must be >= 20M');
      expect(validateParamValue(guard, '20M')).toBeNull();
      expect(validateParamValue(guard, '4G')).toBeNull();
      expect(validateParamValue(guard, '5G')).toBe('Must be <= 4G');
    });
    it('is case-insensitive on the unit letter', () => {
      const guard = { kind: 'size', min: 1024 };
      expect(validateParamValue(guard, '1k')).toBeNull();
      expect(validateParamValue(guard, '1K')).toBeNull();
    });
    // The engine casts strtod()'s result to UINT64 and compares it with the
    // INT64-sized upper limit as integers (prm_check_range), so the largest
    // value it accepts is the largest double below 2^63.
    it('compares INT64-sized bounds exactly, as the engine does (backup_volume_max_size_bytes)', () => {
      const { guard } = DATABASE_PARAM_SCHEMA.find(e => e.key === 'backup_volume_max_size_bytes');
      expect(validateParamValue(guard, '8191P')).toBeNull();
      expect(validateParamValue(guard, '8192P')).toBe('Must be <= 9223372036854775807 bytes'); // 2^63
      expect(validateParamValue(guard, '9223372036854775807')).not.toBeNull(); // strtod rounds it up to 2^63
      expect(validateParamValue(guard, '32K')).toBeNull();
      expect(validateParamValue(guard, '31K')).toBe('Must be >= 32K');
    });
  });

  describe('regression: log_volume_size / db_volume_size (previously entirely missing from the schema)', () => {
    const logVolumeSize = DATABASE_PARAM_SCHEMA.find(e => e.key === 'log_volume_size');
    const dbVolumeSize = DATABASE_PARAM_SCHEMA.find(e => e.key === 'db_volume_size');

    it('both keys now exist in the schema', () => {
      expect(logVolumeSize).toBeDefined();
      expect(dbVolumeSize).toBeDefined();
    });

    it('log_volume_size rejects the exact garbage value a user hit live ("512MAAA")', () => {
      expect(validateParamValue(logVolumeSize.guard, '512MAAA')).not.toBeNull();
    });

    it('log_volume_size rejects a value below the engine\'s real 20M floor ("512K")', () => {
      expect(validateParamValue(logVolumeSize.guard, '512K')).toBe('Must be >= 20M');
    });

    it('log_volume_size accepts its own schema default (512M)', () => {
      expect(validateParamValue(logVolumeSize.guard, logVolumeSize.default)).toBeNull();
    });

    it('log_volume_size rejects a value above the engine\'s real 4G ceiling', () => {
      expect(validateParamValue(logVolumeSize.guard, '5G')).toBe('Must be <= 4G');
    });

    it('db_volume_size rejects a value above the engine\'s real 20G ceiling', () => {
      expect(validateParamValue(dbVolumeSize.guard, '21G')).toBe('Must be <= 20G');
    });
  });

  describe('regression: engine-fatal values the schema used to accept', () => {
    const entry = key => DATABASE_PARAM_SCHEMA.find(e => e.key === key);

    it('backup_volume_max_size_bytes: explicit 0 fails the engine range check (lower 32K); size units are accepted', () => {
      const { guard } = entry('backup_volume_max_size_bytes');
      expect(validateParamValue(guard, '0')).toBe('Must be >= 32K');
      expect(validateParamValue(guard, '32K')).toBeNull();
      expect(validateParamValue(guard, '1G')).toBeNull();
    });

    it('data_buffer_size: below 1024 pages on every page size is rejected, a 4K-page-sized minimum is not', () => {
      const { guard } = entry('data_buffer_size');
      expect(validateParamValue(guard, '1M')).not.toBeNull();
      expect(validateParamValue(guard, '4M')).toBeNull(); // exactly 1024 pages at 4K
      expect(validateParamValue(guard, '512M')).toBeNull();
    });

    it('data/sort/log_buffer_size: more than INT_MAX pages even at 16K is rejected', () => {
      for (const key of ['data_buffer_size', 'sort_buffer_size', 'log_buffer_size']) {
        expect(validateParamValue(entry(key).guard, '33T')).not.toBeNull();
      }
    });

    it('sort_buffer_size: only 0 is below its 1-page floor', () => {
      expect(validateParamValue(entry('sort_buffer_size').guard, '0')).toBe('Must be >= 1 byte');
      expect(validateParamValue(entry('sort_buffer_size').guard, '1')).toBeNull();
    });

    it('log_buffer_size: below 128 log pages on every page size is rejected', () => {
      const { guard } = entry('log_buffer_size');
      expect(validateParamValue(guard, '256K')).not.toBeNull(); // 64 pages at 4K
      expect(validateParamValue(guard, '512K')).toBeNull(); // 128 pages at 4K
    });

    it('index_scan_oid_buffer_size: outside [0.05, 16] pages on every page size is rejected', () => {
      const { guard } = entry('index_scan_oid_buffer_size');
      expect(validateParamValue(guard, '100')).not.toBeNull();
      expect(validateParamValue(guard, '64K')).toBeNull();
      expect(validateParamValue(guard, '256K')).toBeNull();
      expect(validateParamValue(guard, '257K')).not.toBeNull();
    });
  });

  describe('brokerSize — broker.conf ut_size_string_to_kbyte rules', () => {
    const hardLimit = BROKER_PARAM_SCHEMA.find(e => e.key === 'APPL_SERVER_MAX_SIZE_HARD_LIMIT').guard;
    const maxSize = BROKER_PARAM_SCHEMA.find(e => e.key === 'APPL_SERVER_MAX_SIZE').guard;

    it('reads a unitless value in the default unit (MB here), not bytes', () => {
      expect(validateParamValue(hardLimit, '512')).toBeNull();
    });
    it('accepts B/K/KB/M/MB/G/GB in any case, and decimals', () => {
      for (const v of ['1G', '1gb', '512MB', '1024k', '1.5G']) expect(validateParamValue(hardLimit, v)).toBeNull();
    });
    it('rejects what the broker refuses to load', () => {
      expect(validateParamValue(hardLimit, '512B')).toBe('Must be >= 1K'); // 0.5K truncates to 0
      expect(validateParamValue(hardLimit, '0')).toBe('Must be >= 1K');
      expect(validateParamValue(hardLimit, '1T')).toBe('Unit must be B, K/KB, M/MB or G/GB');
      expect(validateParamValue(hardLimit, '512MAAA')).toBe('Unit must be B, K/KB, M/MB or G/GB');
      expect(validateParamValue(hardLimit, '3000G')).toBe('Must be under 2T');
      expect(validateParamValue(maxSize, '-1')).toBe('Must be >= 0K');
    });
    it('allows 0 for APPL_SERVER_MAX_SIZE (the broker only rejects < 0)', () => {
      expect(validateParamValue(maxSize, '0')).toBeNull();
    });
  });

  describe('broker int readers (strtol base 0 / hex)', () => {
    const entry = key => BROKER_PARAM_SCHEMA.find(e => e.key === key).guard;
    it('BROKER_PORT: accepts hex and octal like strtol base 0, rejects what parses to garbage', () => {
      expect(validateParamValue(entry('BROKER_PORT'), '30000')).toBeNull();
      expect(validateParamValue(entry('BROKER_PORT'), '0x7530')).toBeNull();
      expect(validateParamValue(entry('BROKER_PORT'), '08')).not.toBeNull(); // invalid octal -> broker reads 0
      expect(validateParamValue(entry('BROKER_PORT'), '0x10000')).toBe('Must be <= 65535');
    });
    it('MASTER_SHM_ID: hex, must fit 32 bits', () => {
      expect(validateParamValue(entry('MASTER_SHM_ID'), '30001')).toBeNull();
      expect(validateParamValue(entry('MASTER_SHM_ID'), '3000a')).toBeNull();
      expect(validateParamValue(entry('MASTER_SHM_ID'), '99999999')).not.toBeNull(); // 0x99999999 > INT_MAX -> 0
    });
  });

  describe('brokerTime — ut_time_string_to_sec', () => {
    const entry = key => BROKER_PARAM_SCHEMA.find(e => e.key === key).guard;
    it('accepts the broker\'s unit words and decimals', () => {
      for (const v of ['120', '2min', '1h', '500ms', '1.5s', '30sec']) expect(validateParamValue(entry('TIME_TO_KILL'), v)).toBeNull();
    });
    it('rejects unknown units and out-of-range values the broker refuses', () => {
      expect(validateParamValue(entry('TIME_TO_KILL'), '2days')).toBe('Unit must be ms/msec, s/sec, min or h');
      expect(validateParamValue(entry('TIME_TO_KILL'), '-1')).not.toBeNull();
      expect(validateParamValue(entry('MAX_QUERY_TIMEOUT'), '25h')).toBe('Must be <= 86400 seconds');
      expect(validateParamValue(entry('LONG_QUERY_TIME'), '86400.5')).not.toBeNull();
    });
    it('checks int-truncated seconds where the broker keeps an int', () => {
      expect(validateParamValue(entry('MAX_QUERY_TIMEOUT'), '86400.5')).toBeNull();
    });
  });

  describe('SQL_LOG_MAX_SIZE — broker size in KB by default', () => {
    const guard = BROKER_PARAM_SCHEMA.find(e => e.key === 'SQL_LOG_MAX_SIZE').guard;
    it('accepts its own engine default and unitless KB', () => {
      expect(validateParamValue(guard, '10M')).toBeNull();
      expect(validateParamValue(guard, '100000')).toBeNull();
    });
    it('rejects above 2G', () => {
      expect(validateParamValue(guard, '3G')).toBe('Must be <= 2097152K');
    });
  });
});

