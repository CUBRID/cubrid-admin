import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@config/config.module';
import { UserRepositoryModule } from '@repository';
import { ApiLogService } from './api-log.service';

/** The API log store; main.ts adds the request logger that fills it. */
@Global()
@Module({
  imports: [ConfigModule, UserRepositoryModule],
  providers: [ApiLogService],
  exports: [ApiLogService],
})
export class ApiLogModule {}
