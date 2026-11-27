import { Body, Controller, Post, Request } from '@nestjs/common';
import { TestHostConnectionDto } from '@type/index';
import { CmsAuthService } from './cms-auth.service';
import { SkipActionLog } from '@api-log/log-action.decorator';

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
  @SkipActionLog()
  @Post('test')
  async test(@Request() request: any, @Body() target: TestHostConnectionDto) {
    return this.cmsAuthService.testConnection(request.user.sub, target);
  }
}
