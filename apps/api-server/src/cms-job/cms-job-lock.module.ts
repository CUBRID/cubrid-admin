import { Module } from '@nestjs/common';
import { HostModule } from '@host';
import { CmsJobLockService } from './cms-job-lock.service';
import { CmsJobStore } from './cms-job.store';

/**
 * Standalone module for CmsJobLockService — see its class doc for why this
 * is split out of CmsJobModule rather than importing CmsJobModule directly.
 */
@Module({
  imports: [HostModule],
  providers: [CmsJobStore, CmsJobLockService],
  exports: [CmsJobLockService],
})
export class CmsJobLockModule {}
