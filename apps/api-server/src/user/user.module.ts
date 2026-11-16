import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepositoryModule } from '@repository';
import { SecurityModule } from '@security';
import { UserService } from './user.service';
import { TokenModule } from '@token';
import { ConfigModule } from '@config/config.module';

/**
 * User management module for handling user-related operations.
 *
 * This module provides user management functionality including user data
 * retrieval, password changes, account updates, and user deletion.
 * It integrates with the security module for password operations.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  controllers: [UserController],
  providers: [UserService],
  imports: [UserRepositoryModule, SecurityModule, TokenModule, ConfigModule],
  exports: [UserService],
})
export class UserModule {}

// Export controllers and services for documentation
export { UserController } from './user.controller';
export { UserService } from './user.service';
