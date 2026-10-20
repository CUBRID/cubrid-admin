import {
  AddVolDbRequest,
  BackupDbClientRequest,
  CheckDatabaseRequest,
  CompactDatabaseRequest,
  CopyDbRequest,
  CreateDatabaseWithConfigRequest,
  CmsJobStatus,
  CmsJobType,
  LoadDatabaseRequest,
  OptimizeDatabaseRequest,
  RenameDatabaseRequest,
  RestoreDbClientRequest,
  UnloadDatabaseRequest,
} from '@api-interfaces';

export type CmsJobPayload =
  | UnloadDatabaseRequest
  | LoadDatabaseRequest
  | CreateDatabaseWithConfigRequest
  | OptimizeDatabaseRequest
  | CheckDatabaseRequest
  | CompactDatabaseRequest
  | CopyDbRequest
  | AddVolDbRequest
  | RenameDatabaseRequest
  | BackupDbClientRequest
  | RestoreDbClientRequest;

export type CmsJobRecord = {
  jobId: string;
  userId: string;
  hostUid: string;
  dbname: string;
  type: CmsJobType;
  status: CmsJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  payload: CmsJobPayload;
  result?: unknown;
  error?: { message: string; code?: string; cmsStatus?: string };
  // CMS's own uuid for this async job, persisted as soon as CMS returns it —
  // previously only held in a poll-loop local variable, so a mid-job failure
  // (e.g. the host token going invalid) lost it permanently with no way to
  // reconcile the job against CMS's actual (possibly still-running or
  // already-finished) task afterward.
  cmsUuid?: string;
};

// Deliberately NOT keyed by userId or hostUid — both are per-account values
// (each user registers "the same" physical CMS host under their own hostUid),
// so a userId/hostUid-scoped key can't stop two different users from running
// conflicting jobs (e.g. loaddb twice) against the same physical database at
// once. CUBRID's engine has no notion of "web-manager operation locks" and
// will happily run both loaddb processes concurrently, racing on the same
// catalog/heap pages — this is what actually corrupts the database, not just
// what our lock was supposed to prevent. Keyed by the physical host address
// instead, so the lock is shared across every user who points at that host.
export function buildOperationKey(hostKey: string, dbname: string): string {
  return JSON.stringify([hostKey, dbname]);
}

export function resolveJobDbname(type: CmsJobType, dbname: string, payload: CmsJobPayload): string {
  if (type === 'copy') {
    return (payload as CopyDbRequest).destdbname;
  }
  return dbname;
}
