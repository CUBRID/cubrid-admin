import { describe, expect, it } from 'vitest';
import { parseCmConfText, validateConfText, isBlockingConfTextProblem } from '@api-interfaces';
import { resolveParamSchema } from '@api-interfaces/param-schema/resolve-param-schema';
import { CM_PARAM_SCHEMA } from '@api-interfaces/param-schema/cm-param-schema';
import { CM_PENDING_PARAM_SCHEMA } from '@api-interfaces/param-schema/cm-unreleased-keys';

const cm1145 = resolveParamSchema(CM_PARAM_SCHEMA, 'CUBRID 11.4.5 (11.4.5.1907-7077e91)');
const check = (text, schema = cm1145) => validateConfText(schema, text, 'cmconf');
const blocking = (text, schema) => check(text, schema).filter(isBlockingConfTextProblem);

describe('parseCmConfText — CMS uReadSystemConfig line reader', () => {
  it('splits on the first space/tab/"=" and drops one leading "=" from the value', () => {
    expect(parseCmConfText('cm_port=8001\ncm_port 8002\n  cm_port\t=\t8003  \ncm_port==8004').entries.map(e => e.value))
      .toEqual(['8001', '8002', '8003', '8004']);
  });
  it('skips comments, blank lines, [cm] and lines without a value', () => {
    const { entries, skipped } = parseCmConfText('# c\n\n[cm]\ncm_port=\ncm_port');
    expect(entries).toEqual([]);
    expect(skipped.map(e => e.key)).toEqual(['[cm]', 'cm_port', 'cm_port']);
  });
  it('does not strip inline comments (CMS reads them as part of the value)', () => {
    expect(parseCmConfText('cm_port=8001 # port').entries[0].value).toBe('8001 # port');
  });
});

describe('cm.conf rules (CM_PARAM_SCHEMA)', () => {
  it('accepts edge values', () => {
    expect(blocking('cm_port=1\ncm_port=65535\ncm_process_monitor_interval=5\nauto_job_timeout=60\nmax_log_filesize=2047M\nmax_log_filesize=1\nmax_log_files=1\nhttp_timeout=1\ntoken_active_time=9999999999\nallow_user_multi_connection=YES\nsupport_mon_statistic=no')).toEqual([]);
  });
  it('rejects out-of-range and mistyped values', () => {
    const keys = text => blocking(text).map(p => p.key);
    expect(keys('cm_port=0\ncm_port=65536\ncm_port=80a')).toEqual(['cm_port', 'cm_port', 'cm_port']);
    expect(keys('cm_process_monitor_interval=4\nauto_job_timeout=59\nmax_log_files=0\nhttp_timeout=0')).toEqual(['cm_process_monitor_interval', 'auto_job_timeout', 'max_log_files', 'http_timeout']);
    expect(keys('max_log_filesize=2048M\nmax_log_filesize=4G\ntoken_active_time=0\ntoken_active_time=10000000000\nallow_user_multi_connection=maybe'))
      .toEqual(['max_log_filesize', 'max_log_filesize', 'token_active_time', 'token_active_time', 'allow_user_multi_connection']);
  });
  it('accepts CMS aliases, case-insensitively', () => {
    expect(blocking('MonitorInterval=10\nallow_usermulticon=yes\nHttpTimeout=30\nTOKENACTIVETIME=7200')).toEqual([]);
  });
  it('rejects unknown keys and a known key with no value', () => {
    expect(blocking('cm_prot=8001\ncm_port')).toEqual([
      expect.objectContaining({ lineNo: 1, key: 'cm_prot' }),
      expect.objectContaining({ lineNo: 2, key: 'cm_port' }),
    ]);
  });
  it('template-only keys and develop-only async keys are warnings, never blocking', () => {
    const problems = check('server_long_query_time=10\nasync_job_ttl_sec=3600\nmax_num_async_task=13');
    expect(problems.filter(isBlockingConfTextProblem)).toEqual([]);
    expect(problems.map(p => p.key)).toEqual(['server_long_query_time', 'max_num_async_task']);
  });
  it('the async keys stay out of the released schema', () => {
    for (const { key } of CM_PENDING_PARAM_SCHEMA) expect(CM_PARAM_SCHEMA.some(e => e.key === key)).toBe(false);
  });
});

describe('cm.conf version gating', () => {
  it('support_web_manager resolves up to the 11.4.5 CMS pin and is an unknown key after it', () => {
    expect(cm1145.some(e => e.key === 'support_web_manager')).toBe(true);
    const cm1146 = resolveParamSchema(CM_PARAM_SCHEMA, '11.4.6');
    expect(cm1146.some(e => e.key === 'support_web_manager')).toBe(false);
    expect(blocking('support_web_manager=yes', cm1146)).toEqual([expect.objectContaining({ key: 'support_web_manager' })]);
  });
});
