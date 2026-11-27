import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@config/config.module';
import { ConfigService } from '@config/config.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { ACCESS_TOKEN_EXPIRES } from './token.constants';

/**
 * Module for managing JWT authentication and token-related functionalities.
 *
 * @category Modules
 * @since 1.0.0
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getSecretKey(),
        signOptions: { expiresIn: ACCESS_TOKEN_EXPIRES },
      }),
    }),
  ],
  exports: [JwtModule, RefreshTokenService, TokenBlacklistService],
  providers: [RefreshTokenService, TokenBlacklistService],
})
export class TokenModule {}
