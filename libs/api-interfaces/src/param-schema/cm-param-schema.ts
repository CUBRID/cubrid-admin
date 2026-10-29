import { VersionedParamSchemaEntry } from './param-schema-entry';

/**
 * cm.conf — read by the CUBRID Manager Server (CMS), not the engine:
 * cm_config.cpp `uReadSystemConfig`. Verified against the CMS commits the
 * engine pins as its `cubridmanager` submodule (v11.4.5: 15d1ad9e,
 * release/11.4: 8222274b, develop: 4ccc2c41) and CMS release/11.0-11.3.
 *
 * How CMS reads it (all versions): each line is trimmed; empty lines and
 * lines starting with '#' are skipped; the key is the first token split on
 * space/tab/'=', the value is the rest (one leading '=' dropped, trimmed).
 * Section lines like `[cm]` and lines without a value are silently
 * skipped, unknown keys are silently ignored, keys match
 * case-insensitively, and key/value are truncated to 127 characters.
 *
 * Almost nothing here fails CMS startup: out-of-range numbers are clamped
 * or replaced by the default, and a yes/no field treats anything but
 * "yes" as no. So these rules do not mirror a CMS rejection; they block
 * values that are clearly wrong before they are written (TOOLS-5043).
 * cm.conf has no per-instance sections, so no section rules apply.
 */
export const CM_PARAM_SCHEMA: VersionedParamSchemaEntry[] = [
  // atoi() into sco.iCMS_port, then bind_socket() — 0/garbage/out-of-range
  // leaves CMS (and this web manager's connection to the host) without its port.
  { key: 'cm_port', category: 'general', guard: { kind: 'int', min: 1, max: 65535 }, default: '8001' },
  // atoi(); anything below DEFAULT_MONITOR_INTERVAL (5) is raised to 5.
  { key: 'cm_process_monitor_interval', aliases: ['MonitorInterval'], category: 'general', guard: { kind: 'int', min: 5 }, default: '5' },
  // strcasecmp(value, "yes") — any other value means no.
  { key: 'allow_user_multi_connection', aliases: ['Allow_UserMultiCon'], category: 'general', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  // atoi(); below MIN_AUTOJOB_TIMEOUT (60) falls back to 43200.
  { key: 'auto_job_timeout', category: 'general', guard: { kind: 'int', min: 60 }, default: '43200' },
  // One trailing M stripped, atoi() > 0 kept, then * 1024 * 1024 into an
  // int — 2048M and up overflow.
  { key: 'max_log_filesize', category: 'general', guard: { kind: 'cmsMegabytes', min: 1, max: 2047 }, default: '4M' },
  // atoi() > 0 kept, else the default (10).
  { key: 'max_log_files', category: 'general', guard: { kind: 'int', min: 1 }, default: '10' },
  { key: 'web_manager_path', category: 'general', guard: { kind: 'string' }, default: '' },
  { key: 'support_mon_statistic', category: 'general', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  // atoi() seconds added to time(NULL) for pthread_cond_timedwait in
  // cm_execute_request_async — 0 or negative times every request out at once.
  { key: 'http_timeout', aliases: ['HttpTimeout'], category: 'general', guard: { kind: 'int', min: 1 }, default: '30' },
  { key: 'auto_update_url', aliases: ['AutoUpdateURL'], category: 'general', guard: { kind: 'string' }, default: '' },
  { key: 'cubrid_server_ver', aliases: ['CubridServerVer'], category: 'general', guard: { kind: 'string' }, default: '' },
  // cm_server_extend_interface.cpp _validate_token_active_time: digits only,
  // at most 10 characters, not 0 — otherwise 7200 seconds is used.
  { key: 'token_active_time', aliases: ['TokenActiveTime'], category: 'general', guard: { kind: 'bigint', min: '1', max: '9999999999' }, default: '7200' },
  // Read by CMS release/11.0-11.3 and the v11.4.5 pin (15d1ad9e); gone in
  // the release/11.4 (8222274b, 11.4.6) and develop pins.
  { key: 'support_web_manager', category: 'general', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no', maxVersion: '11.4.5' },
];
