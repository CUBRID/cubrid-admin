export type PackageType =
  | 'desktop-mac-arm64'
  | 'desktop-mac-x64'
  | 'desktop-win-x64'
  | 'desktop-linux-x64'
  | 'server';

export interface CheckForUpdateOptions {
  currentVersion: string;
  packageType: PackageType;
  /** GitHub "owner/repo" to query releases from. Defaults to the official repo. */
  repo?: string;
  /** Override for testing; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type UpdateCheckErrorReason = 'network' | 'rate-limited' | 'no-release' | 'parse-error';

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | {
      status: 'update-available';
      latestVersion: string;
      downloadUrl: string;
      releaseNotesUrl: string;
    }
  | { status: 'error'; reason: UpdateCheckErrorReason };

/** Shape returned to UI clients by both the server endpoint and the desktop IPC. */
export interface UpdateStatus {
  currentVersion: string;
  lastCheckedAt: string | null;
  result: UpdateCheckResult;
}
