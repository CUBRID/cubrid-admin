import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleCmsErrors } from '@common';
import { CmsJobLockService } from '@cms-job/cms-job-lock.service';
import { DatabaseError } from '@error/database/database-error';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import {
  AddDbmtUserClientResponse,
  AddDbmtUserRequest,
  BrokerStartStopClientResponse,
  GetBrokerStatusClientResponse,
  StartAllBrokersClientResponse,
  StopAllBrokersClientResponse,
  UpdateDbmtUserClientResponse,
  UpdateDbmtUserRequest,
} from '@api-interfaces';
import {
  AddDbmtUserCmsRequest,
  BaseCmsRequest,
  BaseCmsResponse,
  GetBrokerStatusCmsRequest,
  GetBrokerStatusCmsResponse,
  GetBrokersInfoCmsResponse,
  HandleBrokerCmsRequest,
  StartAllBrokersCmsRequest,
  StopAllBrokersCmsRequest,
  UpdateDbmtUserCmsRequest,
} from '@type';
import {
  AddDbmtUserCmsResponse,
  StartAllBrokersCmsResponse,
  StopAllBrokersCmsResponse,
  UpdateDbmtUserCmsResponse,
} from '@type/cms-response';

/**
 * Service for managing broker operations.
 *
 * Provides high-level business logic for broker-related operations
 * including message handling and service coordination.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class BrokerService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService,
    private readonly cmsJobLockService: CmsJobLockService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Deliberate policy, not a CMS/engine requirement: block every broker
   * start/stop while any CMS job (load/unload/backup/etc.) is actively
   * running anywhere on this host — restarting brokers underneath a job
   * that's mid-write risks corrupting whatever it's in the middle of.
   */
  private async assertNoActiveJob(userId: string, hostUid: string): Promise<void> {
    const active = await this.cmsJobLockService.hasActiveJobForHost(userId, hostUid);
    if (active) {
      throw DatabaseError.OperationInProgress({
        hostUid,
        dbname: active.dbname,
        existingJobId: active.jobId,
      });
    }
  }

  /**
   * Add a DBMT (CMS) user on the host.
   * CMS task: adddbmtuser.
   */
  @HandleCmsErrors()
  async addDbmtUser(
    userId: string,
    hostUid: string,
    request: AddDbmtUserRequest
  ): Promise<AddDbmtUserClientResponse> {
    const cmsRequest: AddDbmtUserCmsRequest = {
      task: 'adddbmtuser',
      targetid: request.targetid,
      password: request.password,
      casauth: request.casauth,
      dbcreate: request.dbcreate,
      statusmonitorauth: request.statusmonitorauth,
    };

    const response = await this.executeCmsRequest<
      AddDbmtUserCmsRequest,
      AddDbmtUserCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      dblist: response.dblist ?? [],
      userlist: response.userlist ?? [],
    };
  }

  /**
   * Update a DBMT (CMS) user on the host.
   * CMS task: updatedbmtuser.
   */
  @HandleCmsErrors()
  async updateDbmtUser(
    userId: string,
    hostUid: string,
    request: UpdateDbmtUserRequest
  ): Promise<UpdateDbmtUserClientResponse> {
    const cmsRequest: UpdateDbmtUserCmsRequest = {
      task: 'updatedbmtuser',
      targetid: request.targetid,
      dbauth: request.dbauth ?? [],
      casauth: request.casauth,
      dbcreate: request.dbcreate,
      statusmonitorauth: request.statusmonitorauth,
    };

    const response = await this.executeCmsRequest<
      UpdateDbmtUserCmsRequest,
      UpdateDbmtUserCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      dblist: response.dblist ?? [],
      userlist: response.userlist ?? [],
    };
  }

  @HandleCmsErrors()
  async getBrokers(userId: string, hostUid: string) {
    const cmsRequest: BaseCmsRequest = {
      task: 'getbrokersinfo',
    };
    const response = await this.executeCmsRequest<BaseCmsRequest, GetBrokersInfoCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return response.brokersinfo;
  }

  @HandleCmsErrors()
  async stopBroker(
    userId: string,
    hostUid: string,
    bname: string
  ): Promise<BrokerStartStopClientResponse> {
    await this.assertNoActiveJob(userId, hostUid);

    const cmsRequest: HandleBrokerCmsRequest = {
      task: 'broker_stop',
      bname: bname,
    };

    await this.executeAsyncCmsJobRequest<
      HandleBrokerCmsRequest,
      BaseCmsResponse
    >(userId, hostUid, cmsRequest);

    return { success: true };
  }

  @HandleCmsErrors()
  async startBroker(
    userId: string,
    hostUid: string,
    bname: string
  ): Promise<BrokerStartStopClientResponse> {
    await this.assertNoActiveJob(userId, hostUid);

    const cmsRequest: HandleBrokerCmsRequest = {
      task: 'broker_start',
      bname: bname,
    };

    await this.executeAsyncCmsJobRequest<
      HandleBrokerCmsRequest,
      BaseCmsResponse
    >(userId, hostUid, cmsRequest);

    return { success: true };
  }

  @HandleCmsErrors()
  async restartBroker(userId: string, hostUid: string, bname: string): Promise<boolean> {
    await this.stopBroker(userId, hostUid, bname);
    await this.startBroker(userId, hostUid, bname);
    return true;
  }

  /**
   * Get broker status including application server information.
   */
  @HandleCmsErrors()
  async getBrokerStatus(
    userId: string,
    hostUid: string,
    bname: string
  ): Promise<GetBrokerStatusClientResponse> {
    const cmsRequest: GetBrokerStatusCmsRequest = {
      task: 'getbrokerstatus',
      bname: bname,
    };

    const response = await this.executeCmsRequest<
      GetBrokerStatusCmsRequest,
      GetBrokerStatusCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }

  @HandleCmsErrors()
  async stopAllBrokers(
    userId: string,
    hostUid: string
  ): Promise<StopAllBrokersClientResponse> {
    await this.assertNoActiveJob(userId, hostUid);

    const cmsRequest: StopAllBrokersCmsRequest = {
      task: 'stopbroker',
    };
    await this.executeAsyncCmsJobRequest<
      StopAllBrokersCmsRequest,
      StopAllBrokersCmsResponse
    >(userId, hostUid, cmsRequest);

    return { success: true };
  }

  @HandleCmsErrors()
  async startAllBrokers(
    userId: string,
    hostUid: string
  ): Promise<StartAllBrokersClientResponse> {
    await this.assertNoActiveJob(userId, hostUid);

    const cmsRequest: StartAllBrokersCmsRequest = {
      task: 'startbroker',
    };
    await this.executeAsyncCmsJobRequest<
      StartAllBrokersCmsRequest,
      StartAllBrokersCmsResponse
    >(userId, hostUid, cmsRequest);

    return { success: true };
  }
}
