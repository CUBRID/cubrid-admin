import { Body, Controller, Logger, Param, Post, Request } from '@nestjs/common';
import { HeartbeatListClientResponse } from '@api-interfaces';
import { HaReloadCmsResponse } from '@type/cms-response';
import { HeartbeatListDto } from '@type/index';
import { HaService } from './ha.service';
import { LogAction, SkipActionLog } from '@api-log/log-action.decorator';

@Controller(':hostUid/ha')
export class HaController {
  private readonly logger = new Logger(HaController.name);

  constructor(private readonly haService: HaService) {}

  /**
   * Get HA heartbeat information.
   * CMS task: heartbeatlist
   *
   * @route POST /:hostUid/ha/heartbeat-list
   */
  @SkipActionLog()
  @Post('heartbeat-list')
  async heartbeatList(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: HeartbeatListDto
  ): Promise<HeartbeatListClientResponse> {
    const userId = req.user.sub;
    this.logger.debug(`Getting HA heartbeat list on host: ${hostUid}`);
    return await this.haService.heartbeatList(userId, hostUid, body);
  }

  /**
   * Reload HA configuration on the CMS host.
   * CMS task: ha_reload
   *
   * @route POST /:hostUid/ha/reload
   */
  @LogAction('ha.reload')
  @Post('reload')
  async haReload(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<HaReloadCmsResponse> {
    const userId = req.user.sub;
    this.logger.log(`HA reload on host: ${hostUid}`);
    return await this.haService.haReload(userId, hostUid);
  }
}

