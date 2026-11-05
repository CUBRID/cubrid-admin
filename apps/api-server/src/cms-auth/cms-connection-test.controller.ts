import { Body, Controller, Post } from '@nestjs/common';
import { TestHostConnectionDto } from '@type/index';
import { CmsAuthService } from './cms-auth.service';

/**
 * Checks a host's connection settings before the host is saved, so there is
 * no hostUid in the path (Add Host's Test Connection).
 *
 * @category Controllers
 */
@Controller('cms-auth')
export class CmsConnectionTestController {
  constructor(private readonly cmsAuthService: CmsAuthService) {}

  /**
   * Logs in to CMS with the given settings and logs out again; nothing is saved.
   *
   * @route POST /cms-auth/test
   */
  @Post('test')
  async test(@Body() target: TestHostConnectionDto) {
    return this.cmsAuthService.testConnection(target);
  }
}
