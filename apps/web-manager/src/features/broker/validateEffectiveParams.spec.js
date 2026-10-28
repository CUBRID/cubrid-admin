import { describe, expect, it } from 'vitest';
import { validateEffectiveParams } from '@api-interfaces';

// A trimmed-down stand-in for BROKER_PARAM_SCHEMA/DATABASE_PARAM_SCHEMA
// covering just the shapes that matter here: a commonOnly+required key
// with a blank default (MASTER_SHM_ID), an instanceOnly+required key
// (BROKER_PORT), a commonOnly key with a NON-blank default
// (cubrid_port_id's exact shape - this is what the leaked-default
// regression needs, since a blank default can't expose it), and a
// crossField pair (MIN/MAX_NUM_APPL_SERVER).
const SCHEMA = [
  { key: 'MASTER_SHM_ID', guard: { kind: 'int', min: 1 }, default: '', commonOnly: true, required: true },
  { key: 'BROKER_PORT', guard: { kind: 'int', min: 1, max: 65535 }, default: '', instanceOnly: true, required: true },
  { key: 'cubrid_port_id', guard: { kind: 'int', min: 1, max: 65535 }, default: '1523', commonOnly: true },
  { key: 'MIN_NUM_APPL_SERVER', guard: { kind: 'int', min: 1 }, default: '5' },
  { key: 'MAX_NUM_APPL_SERVER', guard: { kind: 'int', min: 1, max: 4096 }, default: '40', crossField: { comparedToKey: 'MIN_NUM_APPL_SERVER', rule: 'gte' } },
];

describe('validateEffectiveParams', () => {
  it('takes raw, un-defaulted params - a key simply absent produces no errors on its own', () => {
    const errors = validateEffectiveParams(SCHEMA, {}, { isCommonSection: true, commonSectionLabel: 'broker' });
    // MASTER_SHM_ID is required+commonOnly and genuinely absent here too,
    // so it's the one real error - everything else being absent is fine.
    expect(Object.keys(errors)).toEqual(['MASTER_SHM_ID']);
  });

  it('does not flag a commonOnly key with a NON-blank default as "set in the wrong section" merely for being absent', () => {
    // This is the exact regression: cubrid_port_id's default ('1523') is
    // not blank, so if a caller pre-merged defaults before calling this
    // function, the key would look "present" here even though nothing
    // ever actually wrote it into this instance section.
    const errors = validateEffectiveParams(SCHEMA, { BROKER_PORT: '30000' }, {
      isCommonSection: false,
      commonSectionLabel: 'broker',
    });
    expect(errors.cubrid_port_id).toBeUndefined();
  });

  it('does not flag a required commonOnly key as missing while validating an instance section', () => {
    // MASTER_SHM_ID genuinely has no value here - it belongs in [broker],
    // not this broker's own section - so its absence must NOT read as
    // "required and missing" just because this is an instance section.
    const errors = validateEffectiveParams(SCHEMA, { BROKER_PORT: '30000' }, {
      isCommonSection: false,
      commonSectionLabel: 'broker',
    });
    expect(errors.MASTER_SHM_ID).toBeUndefined();
  });

  it('does not flag a required instanceOnly key as missing while validating the common section', () => {
    const errors = validateEffectiveParams(SCHEMA, { MASTER_SHM_ID: '30001' }, {
      isCommonSection: true,
      commonSectionLabel: 'broker',
    });
    expect(errors.BROKER_PORT).toBeUndefined();
  });

  it('still flags a required key genuinely blank in the section it belongs to', () => {
    const errors = validateEffectiveParams(SCHEMA, { BROKER_PORT: '' }, {
      isCommonSection: false,
      commonSectionLabel: 'broker',
    });
    expect(errors.BROKER_PORT).toBeTruthy();
  });

  it('still flags a commonOnly key actually set in an instance section', () => {
    const errors = validateEffectiveParams(SCHEMA, { BROKER_PORT: '30000', MASTER_SHM_ID: '30001' }, {
      isCommonSection: false,
      commonSectionLabel: 'broker',
    });
    expect(errors.MASTER_SHM_ID).toBeTruthy();
  });

  it('flags a cross-field violation using internally-defaulted values for an untouched key', () => {
    // MIN_NUM_APPL_SERVER is never set here - the function must fall back
    // to its own default (5) internally to know MAX=3 actually violates
    // the relationship, without the caller having pre-merged anything.
    const errors = validateEffectiveParams(SCHEMA, { BROKER_PORT: '30000', MAX_NUM_APPL_SERVER: '3' }, {
      isCommonSection: false,
      commonSectionLabel: 'broker',
    });
    expect(errors.MAX_NUM_APPL_SERVER).toBeTruthy();
  });

  it('does not flag a satisfied cross-field relationship', () => {
    const errors = validateEffectiveParams(SCHEMA, { BROKER_PORT: '30000', MIN_NUM_APPL_SERVER: '5', MAX_NUM_APPL_SERVER: '40' }, {
      isCommonSection: false,
      commonSectionLabel: 'broker',
    });
    expect(errors.MAX_NUM_APPL_SERVER).toBeUndefined();
  });
});
