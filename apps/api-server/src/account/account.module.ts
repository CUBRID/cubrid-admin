import { Module } from '@nestjs/common';
import { ConfigModule } from '@config/config.module';
import { UserRepositoryModule } from '@repository';
import { AccountAccessService } from './account-access.service';
import { AccountSettingsService } from './account-settings.service';

/**
 * Shared account control: the per-request access check (role, status,
 * session version) and the admin-set registration setting.
 */
@Module({
  imports: [ConfigModule, UserRepositoryModule],
  providers: [AccountAccessService, AccountSettingsService],
  exports: [AccountAccessService, AccountSettingsService],
})
export class AccountModule {}
