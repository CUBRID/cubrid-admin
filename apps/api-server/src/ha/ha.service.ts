import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleCmsErrors } from '@common';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import {
  HaReloadCmsRequest,
  HaStartDatabaseCmsRequest,
  HaStopDatabaseCmsRequest,
  HeartbeatListCmsRequest,
} from '@type/cms-request';
import {
  HaReloadCmsResponse,
  HaStartDatabaseCmsResponse,
  HaStopDatabaseCmsResponse,
  HeartbeatListCmsResponse,
} from '@type/cms-response';
import { HeartbeatListClientRequest, HeartbeatListClientResponse } from '@api-interfaces';

@Injectable()
export class HaService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Get HA heartbeat list data.
   * CMS task: heartbeatlist.
   */
  @HandleCmsErrors()
  async heartbeatList(
    userId: string,
    hostUid: string,
    request: HeartbeatListClientRequest
  ): Promise<HeartbeatListClientResponse> {
    const cmsRequest: HeartbeatListCmsRequest = {
      task: 'heartbeatlist',
      dbmodeall: request.dbmodeall,
    };

    const response = await this.executeCmsRequest<
      HeartbeatListCmsRequest,
      HeartbeatListCmsResponse
    >(userId, hostUid, cmsRequest);

    const data = this.extractDomainData(response);
    const hadbinfolist = Array.isArray(data.hadbinfolist)
      ? data.hadbinfolist
      : (data.hadbinfolist ?? {});

    return {
      ...data,
      hadbinfolist,
      hanodelist: data.hanodelist ?? [],
    };
  }

  @HandleCmsErrors()
  async heartbeatlistInternal(userId: string, hostUid: string): Promise<HeartbeatListCmsResponse> {
    const cmsRequest: HeartbeatListCmsRequest = {
      task: 'heartbeatlist',
      dbmodeall: 'y',
    };
    return this.executeCmsRequest(userId, hostUid, cmsRequest);
  }

  /**
   * CMS `ha_start` — `{ task, dbname }` + token; success envelope `task: 'ha_start'`.
   * `dbname` omitted starts every HA-configured database on the host in one call
   * (confirmed empirically: `cubrid heartbeat start` with no dbname brings up
   * HA processes + cub_server + cub_pl for the whole `ha_db_list`) — used for
   * whole-service start instead of one `ha_start` per HA database, which was
   * racing cub_master's global HA activation when done in parallel.
   */
  @HandleCmsErrors()
  async haStart(
    userId: string,
    hostUid: string,
    dbname?: string
  ): Promise<HaStartDatabaseCmsResponse> {
    const cmsRequest: HaStartDatabaseCmsRequest = {
      task: 'ha_start',
      ...(dbname && { dbname }),
    };
    return this.executeAsyncCmsJobRequest<HaStartDatabaseCmsRequest, HaStartDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );
  }

  /**
   * CMS `ha_stop` — `{ task, dbname }` + token; success envelope `task: 'ha_stop'`.
   * `dbname` omitted stops every HA-configured database on the host in one
   * call — see HaStopDatabaseCmsRequest for the cub_master node-info nuance.
   */
  @HandleCmsErrors()
  async haStop(
    userId: string,
    hostUid: string,
    dbname?: string
  ): Promise<HaStopDatabaseCmsResponse> {
    const cmsRequest: HaStopDatabaseCmsRequest = {
      task: 'ha_stop',
      ...(dbname && { dbname }),
    };
    return this.executeAsyncCmsJobRequest<HaStopDatabaseCmsRequest, HaStopDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );
  }

  /**
   * CMS `ha_reload` — `{ task: 'ha_reload' }` + token; success envelope `task: 'ha_reload'`.
   */
  @HandleCmsErrors()
  async haReload(userId: string, hostUid: string): Promise<HaReloadCmsResponse> {
    const cmsRequest: HaReloadCmsRequest = {
      task: 'ha_reload',
    };
    return this.executeAsyncCmsJobRequest<HaReloadCmsRequest, HaReloadCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );
  }
}
