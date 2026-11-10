import { AuthModule } from '@auth';
import { BrokerModule } from '@broker';
import { ConfigModule } from '@config/config.module';
import { ConfigService } from '@config/config.service';
import { HostModule } from '@host';
import { LockModule } from '@lock';
import { MonitoringModule } from '@monitoring';
import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { UserRepositoryModule } from '@repository';
import { EncryptionService, SecurityModule } from '@security';
import { StorageModule, StorageService } from '@storage';
import { TokenModule } from '@token';
import { UserModule } from '@user';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CmsAuthModule } from '@cms-auth/cms-auth.module';
import { CmsConfigModule } from '@cms-config/cms-config.module';
import { CmsUserModule } from '@cms-user';
import { FileModule } from '@file/file.module';
import { DatabaseModule } from '@database/database.module';
import { CmsHttpsClientModule } from '@cms-https-client/cms-https-client.module';
import { LogModule } from './log/log.module';
import { HaModule } from '@ha';
import { CmsJobModule } from '@cms-job/cms-job.module';
import { selectAppGuard } from './desktop/select-app-guard';
import { DesktopUserService } from './desktop/desktop-user.service';
import { VersionModule } from './version/version.module';

/**
 * Root application module that configures all feature modules and global providers.
 *
 * This module serves as the main entry point for the WebCA server application,
 * importing all necessary feature modules and configuring global providers
 * including JWT authentication guard.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  imports: [
    ConfigModule,
    SecurityModule,
    StorageModule,
    AuthModule,
    UserRepositoryModule,
    UserModule,
    TokenModule,
    MonitoringModule,
    BrokerModule,
    HostModule,
    LockModule,
    CmsAuthModule,
    CmsConfigModule,
    CmsUserModule,
    FileModule,
    DatabaseModule,
    CmsJobModule,
    CmsHttpsClientModule,
    LogModule,
    HaModule,
    VersionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigService,
    EncryptionService,
    StorageService,
    DesktopUserService,
    { provide: APP_GUARD, useFactory: selectAppGuard, inject: [ConfigService, Reflector] },
  ],
})
export class AppModule {}

// Export controllers and services for documentation
export { AppController } from './app.controller';
export { AppService } from './app.service';
