import { Module } from '@nestjs/common';
import { DatabaseManagementService } from '@database/management/database-management.service';
import { DatabaseLifecycleService } from '@database/lifecycle/database-lifecycle.service';
import { DatabaseBackupService } from '@database/backup/database-backup.service';
import { DatabaseUserModule } from '@database/user/database-user.module';
import { DatabaseConfigService } from '@database/config/database-config.service';
import { DatabaseInfoModule } from '@database/info/database-info.module';
import { HostModule } from '@host';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { CmsConfigModule } from '@cms-config/cms-config.module';
import { LockModule } from '@lock';
import { FileModule } from '@file/file.module';
import { SecurityModule } from '@security';
import { UserRepositoryModule } from '@repository';
import { HaModule } from '@ha';
import { BrokerModule } from '@broker';
import { CmsJobLockModule } from './cms-job-lock.module';
import { CmsJobController } from './cms-job.controller';
import { CmsJobService } from './cms-job.service';
import { CmsJobStore } from './cms-job.store';

@Module({
  imports: [
    HostModule,
    CmsHttpsClientModule,
    DatabaseInfoModule,
    CmsConfigModule,
    FileModule,
    UserRepositoryModule,
    HaModule,
    LockModule,
    SecurityModule,
    BrokerModule,
    // DatabaseLifecycleService below is CmsJobModule's own separate copy
    // (see its class doc — duplicated here to avoid a real cycle with
    // DatabaseModule) and now needs CmsJobLockService itself.
    CmsJobLockModule,
    // The shared DatabaseUserService, not a private copy: its dbLoginCache
    // must be the same one start-info reads for each database's isLoggedIn,
    // or a login made inside a job (e.g. createdb) would read as logged out.
    DatabaseUserModule,
  ],
  controllers: [CmsJobController],
  providers: [
    CmsJobStore,
    CmsJobService,
    DatabaseManagementService,
    DatabaseLifecycleService,
    DatabaseBackupService,
    DatabaseConfigService,
  ],
  exports: [CmsJobService],
})
export class CmsJobModule {}
