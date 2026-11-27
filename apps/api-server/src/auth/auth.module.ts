import { Module } from '@nestjs/common';
import { ConfigModule } from '@config/config.module';
import { AccountModule } from '@account/account.module';
import { UserRepositoryModule } from '@repository';
import { SecurityModule } from '@security';
import { TokenModule } from '@token';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Authentication module for handling user login and registration.
 *
 * This module provides authentication functionality including user login,
 * registration, and JWT token generation. It integrates with the security
 * module for password hashing and the token module for JWT management.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  imports: [SecurityModule, ConfigModule, UserRepositoryModule, TokenModule, AccountModule],
  exports: [],
})
export class AuthModule {}

// Export controllers and services for documentation
export { AuthController } from './auth.controller';
export { AuthService } from './auth.service';
