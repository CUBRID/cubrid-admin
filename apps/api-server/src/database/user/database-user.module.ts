import { Module } from '@nestjs/common';
import { HostModule } from '@host';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { UserRepositoryModule } from '@repository';
import { DatabaseUserController } from './database-user.controller';
import { DatabaseUserService } from './database-user.service';

/**
 * Standalone module for DatabaseUserService — split out of DatabaseModule so
 * other modules (e.g. CmsConfigModule) can depend on the dbmt-login gate
 * without importing the whole database module and risking a circular import
 * back into it.
 */
@Module({
  imports: [HostModule, CmsHttpsClientModule, UserRepositoryModule],
  controllers: [DatabaseUserController],
  providers: [DatabaseUserService],
  exports: [DatabaseUserService],
})
export class DatabaseUserModule {}
