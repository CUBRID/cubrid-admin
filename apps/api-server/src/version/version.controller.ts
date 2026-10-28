import { Controller, Get } from '@nestjs/common';
import { VersionService } from './version.service';

@Controller('version')
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  getVersion() {
    return { version: this.versionService.getCurrentVersion() };
  }

  /**
   * Request-driven check, in addition to VersionService's own periodic
   * background one. runCheck()'s in-flight guard means this never causes a
   * burst of outbound GitHub requests even with several admins' browser
   * tabs open at once — they all just await the same call.
   */
  @Get('check')
  async checkForUpdate() {
    await this.versionService.runCheck();
    return this.versionService.getState();
  }
}
