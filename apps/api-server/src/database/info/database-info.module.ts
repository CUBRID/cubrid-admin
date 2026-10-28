import { Module } from '@nestjs/common';
import { HostModule } from '@host';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { CmsConfigModule } from '@cms-config/cms-config.module';
import { DatabaseUserModule } from '../user/database-user.module';
import { DatabaseInfoService } from './database-info.service';

@Module({
  imports: [HostModule, CmsHttpsClientModule, CmsConfigModule, DatabaseUserModule],
  providers: [DatabaseInfoService],
  exports: [DatabaseInfoService],
})
export class DatabaseInfoModule {}
