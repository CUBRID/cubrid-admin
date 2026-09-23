/**
 * Public API for shared helpers. Prefer importing from `@util`.
 * Subfolders group concerns: `auth/`, `config/`, `cubrid/`, `ha/`, `network/`, `redaction/`, `ssl/`, `validation/`.
 * `resolve-storage-path.ts` lives at util root (not under a `storage/` folder) so it is not ignored by `.gitignore` (`storage/`).
 */
export { omitPassword, omitPasswordArray, omitPasswordHashMap, omitHashMap } from './redaction/omit_password';
export { REDACTED_VALUE, isSensitiveLogKey, sanitizeForLog, sanitizeHeadersForLog } from './redaction/sanitize-for-log';
export { buildLogLine, formatLogPayload } from './logging/format-log-payload';
export { formatAuditLog } from './logging/format-audit-log';
export { resolveClientIp } from './logging/resolve-client-ip';
export { logStartupBanner } from './logging/log-startup-banner';
export { createWinstonLogger } from './logging/winston-logger';
export { startLogConfigWatcher } from './logging/watch-log-config';
export { getLogPath } from './resolve-log-path';
export { passwordValidityChecker } from './validation/password-validity-checker';
export { getOrCreateSSLCert, getHttpsOptions } from './ssl/ssl-util';
export { getStoragePath, resolveUserFilePath } from './resolve-storage-path';
export { isValidIPv4, isValidIPv6 } from './network/ip-checker';
export { DBAuthResolver, ResolvedDBAuth } from './auth/db-auth-resolver';
export { validateRequiredFields } from './validation/validate-required-fields';
export {
  parseConfigParams,
  parseConfigParamsBySection,
  getConfigParam,
  getSectionParams,
} from './config/parse-config-params';
export {
  parseExvolString,
  parseExvolArray,
  convertExvolInfoToCmsFormat,
  convertExvolArrayToCmsFormat,
} from './cubrid/parse-exvol';
export { mapWithConcurrency } from './concurrency/map-with-concurrency';
export {
  parseHaDbListDbNamesFromHaConf,
  isHostHaModeOnFromCubridConf,
  getPerDbHaModeOffDbNames,
  extractDbNamesFromStartInfo,
  extractDbNamesFromHeartbeatList,
  computeHaDbTopology,
  flattenHanodelist,
  resolveCurrentNodeRole,
  type HaDbTopologyRow,
} from './ha/ha-topology-utils';
