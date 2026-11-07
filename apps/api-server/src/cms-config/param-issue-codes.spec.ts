import {
  ParamGuard,
  ParamSchemaEntry,
  checkEffectiveParams,
  checkParamValue,
  validateConfText,
  validateEffectiveParams,
  validateParamValue,
} from '@api-interfaces';

// The shared parameter checks give each problem a code and the values its
// English message is built from, for a client that shows its own text. The
// messages themselves are unchanged.
describe('parameter check codes', () => {
  describe('checkParamValue', () => {
    const cases: Array<[ParamGuard, string, string, Record<string, unknown> | undefined]> = [
      [{ kind: 'int', min: 1, max: 10 }, '11', 'MAX', { max: 10 }],
      [{ kind: 'int', min: 1, max: 10 }, '0', 'MIN', { min: 1 }],
      [{ kind: 'int' }, 'abc', 'NOT_INT32', undefined],
      [{ kind: 'enum', options: ['yes', 'no'] }, 'maybe', 'NOT_ONE_OF', { options: ['yes', 'no'] }],
      [{ kind: 'size', min: 1024 * 1024 }, '1K', 'MIN', { min: '1M' }],
      [{ kind: 'brokerTime', minSec: 1 }, '0', 'MIN', { min: 1, unit: 's' }],
      [{ kind: 'time', max: 1000 }, '2s', 'MAX', { max: 1000, unit: 'ms' }],
      [{ kind: 'cmsMegabytes', min: 1, max: 4 }, '8M', 'MAX', { max: '4M' }],
      [{ kind: 'brokerSize', defaultUnit: 'K', exactKb: [64, 128] }, '100', 'NOT_ONE_OF', { options: ['64K', '128K'] }],
    ];
    it.each(cases)('%j with %s gives %s', (guard, value, code, params) => {
      const issue = checkParamValue(guard, value);

      expect(issue?.code).toBe(code);
      expect(issue?.params).toEqual(params);
      expect(validateParamValue(guard, value)).toBe(issue?.message);
    });

    it('gives nothing for a valid or empty value', () => {
      expect(checkParamValue({ kind: 'int', max: 10 }, '5')).toBeNull();
      expect(checkParamValue({ kind: 'int', max: 10 }, '')).toBeNull();
    });
  });

  describe('checkEffectiveParams', () => {
    const schema: ParamSchemaEntry[] = [
      { key: 'master_shm_id', category: 'common', guard: { kind: 'int' }, required: true, commonOnly: true },
      { key: 'max_num', category: 'common', guard: { kind: 'int', min: 1 } },
      { key: 'min_num', category: 'common', guard: { kind: 'int' }, crossField: { rule: 'lte', comparedToKey: 'max_num' } },
    ];
    const options = { isCommonSection: false, commonSectionLabel: 'broker', emptyIntIsZero: true };

    it('codes placement, empty-as-zero and cross-field problems, with the same messages', () => {
      const params = { master_shm_id: '30001', max_num: '', min_num: '5' };
      const issues = checkEffectiveParams(schema, params, options);

      expect(issues.master_shm_id).toMatchObject({ code: 'COMMON_SECTION_ONLY', params: { section: 'broker' } });
      expect(issues.max_num).toMatchObject({ code: 'EMPTY_READS_AS_ZERO', params: { cause: 'MIN', min: 1 } });
      expect(Object.fromEntries(Object.entries(issues).map(([key, issue]) => [key, issue.message])))
        .toEqual(validateEffectiveParams(schema, params, options));
    });

    it('codes a required value left blank and a value above the other key', () => {
      const issues = checkEffectiveParams(schema, { max_num: '3', min_num: '9' }, { ...options, isCommonSection: true });

      expect(issues.master_shm_id).toMatchObject({ code: 'REQUIRED' });
      expect(issues.min_num).toMatchObject({ code: 'CROSS_FIELD', params: { rule: 'lte', comparedToKey: 'max_num', current: 3 } });
    });
  });

  describe('validateConfText problems', () => {
    const codes = (problems: ReturnType<typeof validateConfText>) => problems.map(({ code, key, params }) => ({ code, key, params }));

    it('codes syntax errors and repeated keys', () => {
      const problems = validateConfText([], ['[common]', 'this is not a setting', 'a=1', 'a=2'], 'cubridconf');

      expect(codes(problems)).toEqual([
        { code: 'SYNTAX_NOT_KEY_VALUE', key: undefined, params: undefined },
        { code: 'DUPLICATE_KEY', key: 'a', params: { laterLineNo: 4 } },
      ]);
    });

    it('codes broker.conf section collisions', () => {
      const problems = validateConfText([], [
        '[broker]', 'MASTER_SHM_ID=30001',
        '[%one]', 'BROKER_PORT=33000', 'APPL_SERVER_SHM_ID=30001',
        '[%two]', 'BROKER_PORT=33000', 'APPL_SERVER_SHM_ID=30001',
      ], 'brokerconf');

      expect(codes(problems)).toEqual(expect.arrayContaining([
        { code: 'BROKER_PORT_DUPLICATE', key: 'BROKER_PORT', params: { port: 33000, otherSection: '%one' } },
        { code: 'SHM_ID_DUPLICATE', key: 'APPL_SERVER_SHM_ID', params: { otherSection: '%one' } },
        { code: 'SHM_ID_SAME_AS_MASTER', key: 'APPL_SERVER_SHM_ID', params: undefined },
      ]));
    });

    it('codes a broker.conf without its common section', () => {
      expect(codes(validateConfText([], ['[%one]', 'BROKER_PORT=33000'], 'brokerconf')))
        .toContainEqual({ code: 'MISSING_COMMON_SECTION', key: undefined, params: undefined });
    });
  });
});
