export type CmsJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type CmsJobType =
  | 'unload'
  | 'load'
  | 'create'
  | 'optimize'
  | 'check'
  | 'compact'
  | 'copy'
  | 'addvol'
  | 'rename'
  | 'backupdb'
  | 'restore';

/**
 * Returned when a long-running CMS operation is accepted (HTTP 202).
 */
export type CreateCmsJobResponse = {
  jobId: string;
};

/** Allowlisted execution options; never includes database credentials. */
export type MaintenanceSummary =
  | {
      operation: 'statistics-update';
      scope: 'all-classes' | 'selected-class';
      className?: string;
      scanMethod: 'unknown' | 'sampling' | 'fullscan';
    }
  | {
      operation: 'consistency-check';
      scope: 'entire-database';
      repairRequested: boolean;
    };

export type MaintenanceResult = {
  success: boolean;
  /** Utility text only, with request secrets redacted; absent when CMS returns no detail. */
  output?: string;
};

/**
 * Job status polled by the client until terminal state.
 */
export type CmsJobStatusResponse = {
  jobId: string;
  type: CmsJobType;
  /** Job lifecycle (not HTTP status — avoids SuccessResponseInterceptor collision). */
  jobStatus: CmsJobStatus;
  hostUid: string;
  dbname: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  maintenanceSummary?: MaintenanceSummary;
  result?: unknown;
  error?: { message: string; code?: string; cmsStatus?: string };
};
