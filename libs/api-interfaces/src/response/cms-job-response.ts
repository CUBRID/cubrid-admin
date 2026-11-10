/**
 * A warning's code (e.g. RENAME_SECTION_KEPT) and the values in its English
 * text (dbname, oldName, newName, ...), for a client that shows its own text.
 */
export type WarningDetail = { code: string; [field: string]: string };

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
  | 'delete'
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
  /** Follow-up work requiring attention after the main operation succeeded. */
  warnings?: string[];
  /** Each warning's code and the values in its text, in the order of `warnings`. */
  warningDetails?: WarningDetail[];
  /**
   * `message` as shown, with what a client maps it by, as in an error
   * response's `data`: `type`, `code`, `reason`, `cmsNote` (CMS's own text),
   * `cmsTask`, values like `dbname`.
   */
  error?: { message: string; code?: string; cmsStatus?: string; type?: string; cmsNote?: string; [field: string]: unknown };
};
