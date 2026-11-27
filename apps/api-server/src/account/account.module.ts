import { Module } from '@nestjs/common';
import { ConfigModule } from '@config/config.module';
import { UserRepositoryModule } from '@repository';
import { AccountAccessService } from './account-access.service';
import { AccountSettingsService } from './account-settings.service';
import { InitialAdminService } from './initial-admin.service';

/**
 * Shared account control: the per-request access check (role, status,
 * session version), the admin-set registration setting, and the built-in
 * administrator a fresh install starts with.
 */
@Module({
  imports: [ConfigModule, UserRepositoryModule],
  providers: [AccountAccessService, AccountSettingsService, InitialAdminService],
  exports: [AccountAccessService, AccountSettingsService, InitialAdminService],
})
export class AccountModule {}
