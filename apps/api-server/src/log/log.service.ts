import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import {
  GetBrokerLogListClientResponse,
  ViewLogClientResponse,
  GetDatabaseLogListClientResponse,
  LoadAccessLogClientResponse,
  GetAdminLogInfoClientResponse,
} from '@api-interfaces';
import {
  GetLogFileInfoCmsResponse as LogFileInfoCmsResponse,
  ViewLogCmsResponse,
  GetDatabaseLogInfoCmsResponse as LogInfoCmsResponse,
  LoadAccessLogCmsResponse,
  GetAdminLogInfoCmsResponse,
  BaseCmsRequest,
} from '@type';
import { BaseService, HandleCmsErrors } from '@common';
import { DatabaseUserService } from '@database/user/database-user.service';

@Injectable()
export class LogService extends BaseService {
  constructor(
    protected readonly client: CmsHttpsClientService,
    protected readonly hostService: HostService,
    private readonly databaseUserService: DatabaseUserService
  ) {
    super(hostService, client);
  }

  @HandleCmsErrors()
  async getBrokerLogList(userId: string, hostUid: string, bname: string) {
    const cmsRequest: BaseCmsRequest & { broker: string } = {
      task: 'getlogfileinfo',
      broker: bname,
    };

    const cmsResponse = await this.executeCmsRequest<
      BaseCmsRequest & { broker: string },
      LogFileInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    this.logger.debug(JSON.stringify(cmsResponse));
    const response: GetBrokerLogListClientResponse = {
      broker: cmsResponse.broker,
      logfileinfo: cmsResponse.logfileinfo,
    };
    return response;
  }

  async getDatabaseLogList(userId: string, hostUid: string, dbname: string) {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);
    const cmsRequest: BaseCmsRequest & { dbname: string } = {
      task: 'getloginfo',
      dbname: dbname,
    };

    const cmsResponse = await this.executeCmsRequest<
      BaseCmsRequest & { dbname: string },
      LogInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    const response: GetDatabaseLogListClientResponse = {
      dbname: cmsResponse.dbname,
      loginfo: cmsResponse.loginfo,
    };
    return response;
  }

  @HandleCmsErrors()
  async getCMSLogList(userId: string, hostUid: string): Promise<LoadAccessLogClientResponse> {
    const cmsRequest: BaseCmsRequest = {
      task: 'loadaccesslog',
    };

    const cmsResponse = await this.executeCmsRequest<BaseCmsRequest, LoadAccessLogCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    const response: LoadAccessLogClientResponse = {
      accesslog: cmsResponse.accesslog,
      errorlog: cmsResponse.errorlog,
    };
    return response;
  }

  /**
   * View broker log file content.
   * Returns log lines within the specified range.
   *
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @param path - Log file path
   * @param start - Start line number (1-based)
   * @param end - End line number (1-based)
   * @returns ViewLogClientResponse Log file content without CMS envelope fields
   */
  @HandleCmsErrors()
  async viewLog(
    userId: string,
    hostUid: string,
    path: string,
    start: string,
    end: string
  ): Promise<ViewLogClientResponse> {
    const cmsRequest: BaseCmsRequest & { path: string; start: string; end: string } = {
      task: 'viewlog',
      path: path,
      start: start,
      end: end,
    };

    const cmsResponse = await this.executeCmsRequest<
      BaseCmsRequest & { path: string; start: string; end: string },
      ViewLogCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(cmsResponse);
  }

  /**
   * Get admin log information from a CMS host.
   * Returns admin log file information without CMS envelope fields.
   *
   *
   * @param userId - User ID from JWT
   * @param hostUid - Host unique identifier
   * @returns GetAdminLogInfoClientResponse Admin log information without CMS envelope fields
   */
  @HandleCmsErrors()
  async getAdminLogInfo(userId: string, hostUid: string): Promise<GetAdminLogInfoClientResponse> {
    const cmsRequest: BaseCmsRequest = {
      task: 'getadminloginfo',
    };

    const cmsResponse = await this.executeCmsRequest<BaseCmsRequest, GetAdminLogInfoCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return this.extractDomainData(cmsResponse);
  }
}
