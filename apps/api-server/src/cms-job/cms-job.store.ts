import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStoragePath } from '@util';
import { CmsJobRecord } from './cms-job.types';
import {
  getJobRetentionMs,
  getStaleRunningJobMs,
  isTerminalJobStatus,
} from './cms-job.cleanup';

@Injectable()
export class CmsJobStore {
  private jobsRoot(): string {
    return path.join(getStoragePath(), 'jobs');
  }

  private userJobsDir(userKey: string): string {
    return path.join(this.jobsRoot(), userKey);
  }

  private jobPath(userKey: string, jobId: string): string {
    return path.join(this.userJobsDir(userKey), `${jobId}.json`);
  }

  private operationsPath(userKey: string): string {
    return path.join(this.jobsRoot(), 'operations', `${userKey}.json`);
  }

  // Separate from the per-user operations file above: this one is shared by
  // every user, keyed by physical host + dbname (see buildOperationKey), so
  // it can actually stop two different accounts from running conflicting
  // jobs against the same physical database at the same time.
  private globalOperationsPath(): string {
    return path.join(this.jobsRoot(), 'operations', '_global.json');
  }

  async readGlobalOperations(): Promise<Record<string, { jobId: string; userKey: string }>> {
    try {
      const raw = await fs.readFile(this.globalOperationsPath(), 'utf8');
      return JSON.parse(raw) as Record<string, { jobId: string; userKey: string }>;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return {};
      throw err;
    }
  }

  async writeGlobalOperations(ops: Record<string, { jobId: string; userKey: string }>): Promise<void> {
    const file = this.globalOperationsPath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(ops), 'utf8');
  }

  private async removeJobIdFromGlobalOperations(jobId: string): Promise<void> {
    const ops = await this.readGlobalOperations();
    let changed = false;
    for (const [key, entry] of Object.entries(ops)) {
      if (entry.jobId === jobId) {
        delete ops[key];
        changed = true;
      }
    }
    if (changed) {
      await this.writeGlobalOperations(ops);
    }
  }

  async saveJob(userKey: string, record: CmsJobRecord): Promise<void> {
    const dir = this.userJobsDir(userKey);
    await fs.mkdir(dir, { recursive: true });
    const finalPath = this.jobPath(userKey, record.jobId);
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(record), 'utf8');
    // Atomic replace: rename is POSIX-atomic on the same filesystem,
    // so readers never observe a truncated or partially-written file.
    await fs.rename(tmpPath, finalPath);
  }

  async getJob(userKey: string, jobId: string): Promise<CmsJobRecord | null> {
    try {
      const raw = await fs.readFile(this.jobPath(userKey, jobId), 'utf8');
      return JSON.parse(raw) as CmsJobRecord;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }

  async listJobsForUser(userKey: string): Promise<CmsJobRecord[]> {
    const dir = this.userJobsDir(userKey);
    try {
      const files = await fs.readdir(dir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const results = await Promise.allSettled(
        jsonFiles.map((f) => fs.readFile(path.join(dir, f), 'utf8'))
      );
      const jobs: CmsJobRecord[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status !== 'fulfilled') continue;
        try {
          jobs.push(JSON.parse(result.value) as CmsJobRecord);
        } catch {
          // Parse failure: skip this file. Do NOT delete it here —
          // saveJob() writes atomically via tmp+rename, but a concurrent
          // write could still produce a .tmp file that was renamed between
          // readdir and readFile. Deleting on parse failure risks removing
          // a live job file that a worker is about to overwrite correctly.
          // Genuinely corrupt files are collected by the periodic purge.
        }
      }
      return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
  }

  async readOperations(userKey: string): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.operationsPath(userKey), 'utf8');
      return JSON.parse(raw) as Record<string, string>;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return {};
      throw err;
    }
  }

  async writeOperations(userKey: string, ops: Record<string, string>): Promise<void> {
    const file = this.operationsPath(userKey);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(ops), 'utf8');
  }

  async deleteJob(userKey: string, jobId: string): Promise<void> {
    try {
      await fs.unlink(this.jobPath(userKey, jobId));
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  private async listUserJobKeys(): Promise<string[]> {
    const root = this.jobsRoot();
    try {
      const entries = await fs.readdir(root);
      const keys: string[] = [];
      for (const name of entries) {
        if (name === 'operations') continue;
        const dir = path.join(root, name);
        try {
          const stat = await fs.stat(dir);
          if (stat.isDirectory()) keys.push(name);
        } catch {
          // skip
        }
      }
      return keys;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * After API server restart, in-memory workers are gone but JSON may still be queued/running.
   * Mark those jobs failed and release operation locks so clients stop polling.
   */
  async failOrphanedActiveJobs(error: {
    message: string;
    code?: string;
  }): Promise<number> {
    const finishedAt = new Date().toISOString();
    let failed = 0;

    for (const userKey of await this.listUserJobKeys()) {
      const jobs = await this.listJobsForUser(userKey);
      for (const job of jobs) {
        if (job.status !== 'queued' && job.status !== 'running') continue;

        job.status = 'failed';
        job.error = { message: error.message, code: error.code };
        job.finishedAt = finishedAt;
        await this.saveJob(userKey, job);
        await this.removeJobIdFromOperations(userKey, job.jobId);
        await this.removeJobIdFromGlobalOperations(job.jobId);
        failed += 1;
      }
    }

    return failed;
  }

  /**
   * Same candidates `failOrphanedActiveJobs` would fail outright, but returned
   * as-is (not mutated) so the caller can first try to reconcile each one
   * against CMS's real state (via its persisted `cmsUuid`) before giving up.
   */
  async listOrphanedActiveJobs(): Promise<Array<{ userKey: string; job: CmsJobRecord }>> {
    const orphans: Array<{ userKey: string; job: CmsJobRecord }> = [];
    for (const userKey of await this.listUserJobKeys()) {
      const jobs = await this.listJobsForUser(userKey);
      for (const job of jobs) {
        if (job.status === 'queued' || job.status === 'running') {
          orphans.push({ userKey, job });
        }
      }
    }
    return orphans;
  }

  /**
   * Persists an orphaned job's resolved outcome (however the caller decided
   * it — reconciled against CMS's real state, or given up on) and releases
   * its operation lock, exactly like the tail end of a normal job run would.
   */
  async finalizeOrphanedJob(userKey: string, job: CmsJobRecord): Promise<void> {
    await this.saveJob(userKey, job);
    await this.removeJobIdFromOperations(userKey, job.jobId);
    await this.removeJobIdFromGlobalOperations(job.jobId);
  }

  private async removeJobIdFromOperations(userKey: string, jobId: string): Promise<void> {
    const ops = await this.readOperations(userKey);
    let changed = false;
    for (const [key, value] of Object.entries(ops)) {
      if (value === jobId) {
        delete ops[key];
        changed = true;
      }
    }
    if (changed) {
      await this.writeOperations(userKey, ops);
    }
  }

  /**
   * Remove expired terminal jobs and stale queued/running job files.
   * Also clears operation locks that still reference removed job ids.
   */
  async purgeExpiredJobs(
    retentionMs = getJobRetentionMs(),
    staleRunningMs = getStaleRunningJobMs()
  ): Promise<number> {
    const root = this.jobsRoot();
    const now = Date.now();
    let removed = 0;

    let userKeys: string[];
    try {
      userKeys = await fs.readdir(root);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return 0;
      throw err;
    }

    for (const userKey of userKeys) {
      if (userKey === 'operations') continue;

      const dir = path.join(root, userKey);
      let stat;
      try {
        stat = await fs.stat(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let files: string[];
      try {
        files = await fs.readdir(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const jobId = file.slice(0, -5);
        const filePath = path.join(dir, file);

        let job: CmsJobRecord;
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          job = JSON.parse(raw) as CmsJobRecord;
        } catch {
          await fs.unlink(filePath).catch(() => undefined);
          removed += 1;
          continue;
        }

        let shouldRemove = false;

        if (isTerminalJobStatus(job.status)) {
          const endedAt = job.finishedAt ?? job.createdAt;
          if (now - Date.parse(endedAt) >= retentionMs) {
            shouldRemove = true;
          }
        } else if (job.status === 'queued' || job.status === 'running') {
          if (now - Date.parse(job.createdAt) >= staleRunningMs) {
            shouldRemove = true;
          }
        }

        if (!shouldRemove) continue;

        await fs.unlink(filePath);
        await this.removeJobIdFromOperations(userKey, jobId);
        await this.removeJobIdFromGlobalOperations(jobId);
        removed += 1;
      }
    }

    return removed;
  }
}
