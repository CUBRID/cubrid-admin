import { Controller, Get, Param, Request } from '@nestjs/common';
import { ResourceMonitoringService } from './resource-monitoring.service';
import { BaseCmsResponse, CmsGetHostStatResponse, CmsGetSysDiskInfoResponse } from '@type/cms-response';

/**
 * Controller for handling resource monitoring operations.
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/resource-monitoring') // Base path for this controller
export class ResourceMonitoringController {
  constructor(private readonly resourceMonitoringService: ResourceMonitoringService) {}

  /**
   * Retrieves raw host statistics (gethoststat) from the CMS API.
   * The client is expected to perform further calculations.
   *
   * @param hostUid The UID of the host.
   * @param req The request object containing user information.
   * @returns A promise that resolves with the raw CmsGetHostStatResponse.
   */
  @Get('get-host-stat') // Specific endpoint for get-host-stat
  async getHostStat(
    @Param('hostUid') hostUid: string,
    @Request() req
  ): Promise<Omit<CmsGetHostStatResponse, keyof BaseCmsResponse>> {
    const userId = req.user.sub;
    return await this.resourceMonitoringService.getHostStat(userId, hostUid);
  }

  /**
   * Retrieves disk usage (getsysdiskinfo) from the CMS API: one entry per
   * filesystem with total/free bytes. On Linux this is the root filesystem only.
   *
   * @param hostUid The UID of the host.
   * @param req The request object containing user information.
   */
  @Get('get-sys-disk-info')
  async getSysDiskInfo(
    @Param('hostUid') hostUid: string,
    @Request() req
  ): Promise<Omit<CmsGetSysDiskInfoResponse, keyof BaseCmsResponse>> {
    const userId = req.user.sub;
    return await this.resourceMonitoringService.getSysDiskInfo(userId, hostUid);
  }
}
