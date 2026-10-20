import { Injectable } from '@nestjs/common';
import { HostService } from '@host';
import { CmsJobStore } from './cms-job.store';
import { isTerminalJobStatus } from './cms-job.cleanup';

/**
 * Read-only view of CmsJobService's job-operation locks, split into its own
 * module so services outside cms-job (DatabaseLifecycleService, BrokerService)
 * can ask "is a job running on this host right now" without depending on
 * CmsJobModule itself — CmsJobModule already imports both DatabaseModule's
 * and BrokerModule's services (its own separate copies, to avoid a cycle the
 * other way), so those modules importing CmsJobModule back would cycle.
 */
@Injectable()
export class CmsJobLockService {
  constructor(
    private readonly store: CmsJobStore,
    private readonly hostService: HostService
  ) {}

  // Same physical-host key CmsJobService locks jobs under (host address:port,
  // not the per-user hostUid) — a job started via one user's hostUid must
  // still block a start/stop reached through a different user's hostUid for
  // the same physical host.
  private async hostKey(userId: string, hostUid: string): Promise<string> {
    const host = await this.hostService.findHostInternal(userId, hostUid);
    return `${host.address}:${host.port}`;
  }

  /**
   * True if any database on this host has a genuinely active (queued/running,
   * not stale) CMS job tracked against it — used to block service/database/
   * broker start-stop while e.g. a load/unload/backup is in flight, since
   * restarting the engine or brokers underneath a running job risks
   * corrupting whatever it's in the middle of writing.
   */
  async hasActiveJobForHost(userId: string, hostUid: string): Promise<{ jobId: string; dbname: string } | null> {
    const hKey = await this.hostKey(userId, hostUid);
    const ops = await this.store.readGlobalOperations();

    for (const [operationKey, entry] of Object.entries(ops)) {
      let parsedHostKey: string;
      let dbname: string;
      try {
        [parsedHostKey, dbname] = JSON.parse(operationKey) as [string, string];
      } catch {
        continue;
      }
      if (parsedHostKey !== hKey) continue;

      // The lock entry can outlive its job (e.g. a crash before the job's
      // finally block cleared it) — only a genuinely active job should block.
      const job = await this.store.getJob(entry.userKey, entry.jobId);
      if (job && !isTerminalJobStatus(job.status)) {
        return { jobId: entry.jobId, dbname };
      }
    }

    return null;
  }
}
