const TYPE_KEYS = {
  unload: 'jobTypeUnload',
  load: 'jobTypeLoad',
  create: 'jobTypeCreate',
  optimize: 'jobTypeOptimize',
  check: 'jobTypeCheck',
  compact: 'jobTypeCompact',
  copy: 'jobTypeCopy',
  addvol: 'jobTypeAddVol',
  rename: 'jobTypeRename',
  backupdb: 'jobTypeBackupDb',
  restore: 'jobTypeRestore',
};

export function getCmsJobTypeLabel(type, CM) {
  const key = TYPE_KEYS[type];
  return key && CM[key] ? CM[key] : type || 'Job';
}

const GUIDANCE_KEYS = {
  unload: 'unloadDbGuidance',
  load: 'loadDbGuidance',
  create: 'createDbGuidance',
  optimize: 'optimizeDbGuidance',
  check: 'checkDbGuidance',
  compact: 'compactDbGuidance',
  copy: 'copyDbGuidance',
  addvol: 'addVolumeGuidance',
  rename: 'renameDbGuidance',
  backupdb: 'backupDbGuidance',
  restore: 'restoreDbGuidance',
};

export function getCmsJobGuidance(type, CM) {
  const key = GUIDANCE_KEYS[type];
  return key ? CM[key] : undefined;
}

export function getCmsJobStatusLabel(status, CM) {
  switch (status) {
    case 'queued':
      return CM.jobStatusQueued;
    case 'running':
      return CM.jobStatusRunning;
    case 'succeeded':
      return CM.jobStatusSucceeded;
    case 'failed':
      return CM.jobStatusFailed;
    default:
      return status || '—';
  }
}

export function isTerminalCmsJobStatus(status) {
  return status === 'succeeded' || status === 'failed';
}
