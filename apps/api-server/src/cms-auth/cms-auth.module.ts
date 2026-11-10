import { Module } from '@nestjs/common';
import { CmsAuthService } from './cms-auth.service';
import { CmsAuthController } from './cms-auth.controller';
import { CmsConnectionTestController } from './cms-connection-test.controller';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { CmsConfigModule } from '@cms-config/cms-config.module';
import { HaModule } from '@ha';
import { UserRepositoryModule } from '@repository';
import { DatabaseUserModule } from '@database/user/database-user.module';
import { HostModule } from '@host';

/**
 * Module for handling CMS authentication functionalities.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  imports: [CmsHttpsClientModule, UserRepositoryModule, CmsConfigModule, HaModule, DatabaseUserModule, HostModule],
  providers: [CmsAuthService],
  controllers: [CmsAuthController, CmsConnectionTestController],
  exports: [CmsAuthService],
})
export class CmsAuthModule {}
