import { Module } from '@nestjs/common';
import { CmsConfigController } from './cms-config.controller';
import { CmsConfigService } from './cms-config.service';
import { HostModule } from '@host';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { DatabaseUserModule } from '@database/user/database-user.module';

/**
 * Module for managing CMS configuration operations.
 *
 * Provides functionality to retrieve environment information from CMS hosts
 * including CUBRID version, broker version, database paths, and system information.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  imports: [HostModule, CmsHttpsClientModule, DatabaseUserModule],
  controllers: [CmsConfigController],
  providers: [CmsConfigService],
  exports: [CmsConfigService],
})
export class CmsConfigModule {}
