import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleResourceMonitoringErrors } from '@common';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import {
  BaseCmsRequest,
  BaseCmsResponse,
  CmsGetHostStatResponse,
  CmsGetSysDiskInfoResponse,
} from '@root/src/type';

/**
 * Service for managing resource monitoring operations.
 * Currently a placeholder.
 *
 * @category Infrastructure Services
 * @since 1.0.0
 */
@Injectable()
export class ResourceMonitoringService extends BaseService {
  constructor(
    protected readonly client: CmsHttpsClientService,
    protected readonly hostService: HostService
  ) {
    super(hostService, client);
  }

  @HandleResourceMonitoringErrors()
  async getHostStat(
    userId: string,
    hostUid: string
  ): Promise<Omit<CmsGetHostStatResponse, keyof BaseCmsResponse>> {
    const cmsRequest: BaseCmsRequest = {
      task: 'gethoststat',
    };

    const response = await this.executeCmsRequest<BaseCmsRequest, CmsGetHostStatResponse>(
      userId,
      hostUid,
      cmsRequest
    );
    return this.extractDomainData(response);
  }

  /**
   * Disk usage via CMS `getsysdiskinfo` (gethoststat has no disk fields).
   * Linux reports only the root filesystem ("/").
   */
  @HandleResourceMonitoringErrors()
  async getSysDiskInfo(
    userId: string,
    hostUid: string
  ): Promise<Omit<CmsGetSysDiskInfoResponse, keyof BaseCmsResponse>> {
    const cmsRequest: BaseCmsRequest = {
      task: 'getsysdiskinfo',
    };

    const response = await this.executeCmsRequest<BaseCmsRequest, CmsGetSysDiskInfoResponse>(
      userId,
      hostUid,
      cmsRequest
    );
    const { disk_info } = this.extractDomainData(response);
    // CMS omits the array entirely when there is nothing to report.
    return { disk_info: Array.isArray(disk_info) ? disk_info : [] };
  }
}
