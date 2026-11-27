import { Module } from '@nestjs/common';
import { AccountModule } from '@account/account.module';
import { UserRepositoryModule } from '@repository';
import { SecurityModule } from '@security';
import { AdminAuditService } from './admin-audit.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** Web Manager account control for administrators (/admin/*). */
@Module({
  imports: [AccountModule, UserRepositoryModule, SecurityModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService],
})
export class AdminModule {}
