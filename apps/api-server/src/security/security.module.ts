import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption/encryption.service';
import { ConfigModule } from '@config/config.module';
import { PasswordService } from './password/password.service';

/**
 * Module for managing security-related functionalities.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  imports: [ConfigModule],
  exports: [EncryptionService, PasswordService],
  providers: [EncryptionService, PasswordService],
})
export class SecurityModule {}
