import { ParamSchemaEntry } from './param-schema-entry';

// Shared with the frontend (exported through the barrel), unlike the
// version-aware CM_PARAM_SCHEMA master table in cm-param-schema.ts.

/**
 * Keys only in CMS develop / feature/webmanager (CMS PR #141, "async
 * interface for time-consuming APIs", 98bb78a). None of the engine's
 * submodule pins carries them as of 2026-10-26 (v11.4.5 15d1ad9e,
 * release/11.4 8222274b, develop 4ccc2c41), so they are NOT in
 * CM_PARAM_SCHEMA. They are recognized (a CMS built from those branches
 * reads them) and range-checked as warnings only. Move them into the
 * schema once an engine release pins a CMS commit that contains them.
 */
export const CM_PENDING_PARAM_SCHEMA: ParamSchemaEntry[] = [
  // cm_config.h: MIN/MAX_ASYNC_JOB_TTL_SEC 60..604800, default 3600.
  { key: 'async_job_ttl_sec', category: 'general', guard: { kind: 'int', min: 60, max: 604800 }, default: '3600' },
  // 1..MAX_NUM_ASYNC_TASK_LIMIT (12), default 8.
  { key: 'max_num_async_task', category: 'general', guard: { kind: 'int', min: 1, max: 12 }, default: '8' },
  // MIN/MAX_ASYNC_LONG_JOB_SEC 60..604800, default 86400.
  { key: 'async_long_job_sec', category: 'general', guard: { kind: 'int', min: 60, max: 604800 }, default: '86400' },
];

/**
 * Present in the cm.conf template CMS ships (server/cmserver/conf/cm.conf)
 * but read by no CMS code on any checked branch — harmless, no effect.
 */
export const CM_TEMPLATE_ONLY_KEYS = ['server_long_query_time', 'execute_diag'];
