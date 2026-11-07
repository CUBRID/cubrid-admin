import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleCmsErrors } from '@common';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { assertCmsAdminHost } from './cms-admin';
import {
  AddDbmtUserClientResponse,
  AddDbmtUserRequest,
  DeleteDbmtUserClientResponse,
  GetDbmtUserInfoClientResponse,
  SetDbmtPasswdClientResponse,
  UpdateDbmtUserClientResponse,
  UpdateDbmtUserRequest,
} from '@api-interfaces';
import {
  AddDbmtUserCmsRequest,
  DeleteDbmtUserCmsRequest,
  GetDbmtUserInfoCmsRequest,
  SetDbmtPasswdCmsRequest,
  UpdateDbmtUserCmsRequest,
} from '@type/cms-request';
import {
  AddDbmtUserCmsResponse,
  DeleteDbmtUserCmsResponse,
  GetDbmtUserInfoCmsResponse,
  SetDbmtPasswdCmsResponse,
  UpdateDbmtUserCmsResponse,
} from '@type/cms-response';

/**
 * Service for CMS (DBMT) user operations: get list, update, delete, set password.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class CmsUserService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Add a DBMT (CMS) user on the host.
   * CMS task: adddbmtuser.
   * Request: task, token, targetid, password, casauth, dbcreate, statusmonitorauth.
   * Response: __EXEC_TIME, dblist, note, status, task, userlist.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request targetid, password, casauth, dbcreate, statusmonitorauth
   * @returns AddDbmtUserClientResponse dblist and userlist
   */
  @HandleCmsErrors()
  async addDbmtUser(
    userId: string,
    hostUid: string,
    request: AddDbmtUserRequest
  ): Promise<AddDbmtUserClientResponse> {
    assertCmsAdminHost(await this.hostService.findHostInternal(userId, hostUid));
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
   * Get DBMT user info (dblist, userlist). CMS task: getdbmtuserinfo.
   */
  @HandleCmsErrors()
  async getDbmtUserInfo(
    userId: string,
    hostUid: string
  ): Promise<GetDbmtUserInfoClientResponse> {
    const cmsRequest: GetDbmtUserInfoCmsRequest = { task: 'getdbmtuserinfo' };
    const response = await this.executeCmsRequest<
      GetDbmtUserInfoCmsRequest,
      GetDbmtUserInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      dblist: response.dblist ?? [],
      userlist: response.userlist ?? [],
    };
  }

  /**
   * Update DBMT user. CMS task: updatedbmtuser.
   */
  @HandleCmsErrors()
  async updateDbmtUser(
    userId: string,
    hostUid: string,
    request: UpdateDbmtUserRequest
  ): Promise<UpdateDbmtUserClientResponse> {
    assertCmsAdminHost(await this.hostService.findHostInternal(userId, hostUid));
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

  /**
   * Delete DBMT user. CMS task: deletedbmtuser.
   */
  @HandleCmsErrors()
  async deleteDbmtUser(
    userId: string,
    hostUid: string,
    targetid: string
  ): Promise<DeleteDbmtUserClientResponse> {
    assertCmsAdminHost(await this.hostService.findHostInternal(userId, hostUid));
    const cmsRequest: DeleteDbmtUserCmsRequest = {
      task: 'deletedbmtuser',
      targetid,
    };

    const response = await this.executeCmsRequest<
      DeleteDbmtUserCmsRequest,
      DeleteDbmtUserCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      dblist: response.dblist ?? [],
      userlist: response.userlist ?? [],
    };
  }

  /**
   * Set DBMT user password. CMS task: setdbmtpasswd.
   */
  @HandleCmsErrors()
  async setDbmtPasswd(
    userId: string,
    hostUid: string,
    targetid: string,
    newpassword: string
  ): Promise<SetDbmtPasswdClientResponse> {
    // Every account may change its own password (the host's Change Password);
    // another user's password takes the admin account.
    assertCmsAdminHost(await this.hostService.findHostInternal(userId, hostUid), { targetid });
    const cmsRequest: SetDbmtPasswdCmsRequest = {
      task: 'setdbmtpasswd',
      targetid,
      newpassword,
    };

    const response = await this.executeCmsRequest<
      SetDbmtPasswdCmsRequest,
      SetDbmtPasswdCmsResponse
    >(userId, hostUid, cmsRequest);

    return { success: true };
  }
}
