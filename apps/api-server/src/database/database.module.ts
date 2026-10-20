import { Module } from '@nestjs/common';
import { DatabaseController } from './database.controller';
import { DatabaseService } from './database.service';
import { HostModule } from '@host';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { UserRepositoryModule } from '@repository';
import { DatabaseUserModule } from './user/database-user.module';
import { CmsConfigModule } from '@cms-config/cms-config.module';
import { FileModule } from '@file/file.module';
import { DatabaseInfoModule } from './info/database-info.module';
import { HaModule } from '@ha';
import { DatabaseLifecycleController } from './lifecycle/database-lifecycle.controller';
import { DatabaseLifecycleService } from './lifecycle/database-lifecycle.service';
import { DatabaseBackupController } from './backup/database-backup.controller';
import { DatabaseBackupService } from './backup/database-backup.service';
import { DatabaseManagementController } from './management/database-management.controller';
import { DatabaseManagementService } from './management/database-management.service';
import { DatabaseConfigController } from './config/database-config.controller';
import { DatabaseConfigService } from './config/database-config.service';
import { CmsJobModule } from '@cms-job/cms-job.module';
import { CmsJobLockModule } from '@cms-job/cms-job-lock.module';
import { BrokerModule } from '@broker';

/**
 * Module for managing database functionalities.
 * Provides database start information and management operations.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  controllers: [
    DatabaseController,
    DatabaseLifecycleController,
    DatabaseBackupController,
    DatabaseManagementController,
    DatabaseConfigController,
  ],
  providers: [
    DatabaseService,
    DatabaseLifecycleService,
    DatabaseBackupService,
    DatabaseManagementService,
    DatabaseConfigService,
  ],
  imports: [
    HostModule,
    CmsHttpsClientModule,
    UserRepositoryModule,
    DatabaseUserModule,
    CmsConfigModule,
    FileModule,
    DatabaseInfoModule,
    HaModule,
    CmsJobModule,
    CmsJobLockModule,
    BrokerModule,
  ],
})
export class DatabaseModule {}
