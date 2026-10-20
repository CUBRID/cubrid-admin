import { Injectable, Logger } from '@nestjs/common';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { HaService } from '@ha';
import { checkCmsStatusError } from '@common';
import { HostInfo, LoginCmsRequest, LoginCmsResponse, User } from '@type/index';
import { getHost } from '@host/host-group.util';
import { UserRepositoryService } from '@repository';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';
import type { CmsHostLoginClientResponse } from '@api-interfaces';
import { CMS_CONFNAME_CUBRID } from '@database/database.constants';
import {
  flattenHanodelist,
  formatAuditLog,
  isHostHaModeOnFromCubridConf,
  resolveCurrentNodeRole,
} from '@util';

/**
 * Service for handling authentication with the CMS (Central Management System).
 * This service manages the login process to CMS hosts, including retrieving host credentials,
 * performing the login request, and storing the obtained authentication token.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class CmsAuthService {
  private readonly logger = new Logger(CmsAuthService.name);

  constructor(
    private readonly client: CmsHttpsClientService,
    private readonly repository: UserRepositoryService,
    private readonly cmsConfigService: CmsConfigService,
    private readonly haService: HaService
  ) {}

  /**
   * Performs a login operation to a specific CMS host for a given user.
   * Retrieves host details, constructs a login request, sends it to the CMS,
   * and stores the received authentication token in the user's host information.
   *
   * @param userId - The ID of the user performing the login.
   * @param uid - The unique identifier of the host to log in to.
   * @returns HA-aware login payload (`isHA` false has no extra fields; true includes node role and peers).
   * @throws HostError.NoSuchHost if the specified host is not found for the user.
   */
  public async login(userId: string, uid: string): Promise<CmsHostLoginClientResponse> {
    const user = await this.repository.loadUserById(userId);
    Logger.log(uid);
    const host: HostInfo | null = getHost(user, uid);
    if (!host) {
      throw HostError.NoSuchHost({ uid: uid });
    }

    const url = `https://${host.address}:${host.port}/cm_api`;
    const request: LoginCmsRequest = {
      task: 'login',
      host: host.address,
      port: host.port.toString(),
      id: host.id,
      password: host.password,
      clientver: '11.4', // Request-shaped only; arbitrary string, no CMS behavior impact
    };

    this.logger.log(
      formatAuditLog('cms_request', {
        user: userId,
        method: 'POST',
        address: url,
        hostUid: uid,
        task: request.task,
        body: request,
      })
    );

    const response = await this.client.postPublic<LoginCmsRequest, LoginCmsResponse>(url, request);

    this.logger.log(
      formatAuditLog('cms_response', {
        user: userId,
        method: 'POST',
        address: url,
        hostUid: uid,
        task: request.task,
        status: response?.status ?? 'unknown',
        execTime: response?.__EXEC_TIME,
        payload: response,
      })
    );

    checkCmsStatusError(response, 'CMS login failed');
    if (!response.token) {
      throw CmsError.RequestFailed({
        message: 'CMS login did not return a token',
        response,
      });
    }

    const token = response.token;
    await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const persisted = getHost(user, uid);
      if (!persisted) {
        throw HostError.NoSuchHost({ uid });
      }
      persisted.token = token;
      persisted.initialLogin = false;
      return user;
    });

    return this.getHaInfo(userId, uid);
  }

  /**
   * Re-derives the same HA role/peer payload `login` returns, without
   * re-authenticating — for refreshing a host's HA badge after something
   * that can change its role (e.g. Service Start/Stop's `ha_start`/`ha_stop`)
   * without the client having to log in again.
   *
   * @param userId User ID from JWT
   * @param uid Host UID
   * @returns HA-aware payload (`isHA` false has no extra fields; true includes node role and peers)
   */
  public async getHaInfo(userId: string, uid: string): Promise<CmsHostLoginClientResponse> {
    const conf = await this.cmsConfigService.getAllSystemParam(userId, uid, CMS_CONFNAME_CUBRID);
    if (!isHostHaModeOnFromCubridConf(conf)) {
      return { success: true, isHA: false };
    }

    const hb = await this.haService.heartbeatlistInternal(userId, uid);
    const haNodes = flattenHanodelist(hb.hanodelist);
    const currentNodeType =
      resolveCurrentNodeRole(hb.currentnode, hb.currentnodestate, haNodes) || 'unknown';

    return {
      success: true,
      isHA: true,
      currentNodeType,
      haNodes,
    };
  }

  /**
   * Tests a login operation to a CMS host using provided host information.
   * This method is typically used for testing connectivity and credentials without
   * associating the host with a specific user.
   *
   * @param host - The host information to use for the login test.
   * @returns A Promise that resolves with the authentication token received from the CMS.
   */
  public async testLogin(host: HostInfo): Promise<string> {
    const url = `https://${host.address}:${host.port}/cm_api`;

    const requestData: LoginCmsRequest = {
      task: 'login',
      host: host.address,
      port: host.port.toString(),
      id: host.id,
      password: host.password,
      clientver: '13.23', // Same as login: request placeholder, no behavioral effect
    };

    this.logger.log(
      formatAuditLog('cms_request', {
        method: 'POST',
        address: url,
        task: requestData.task,
        body: requestData,
      })
    );

    const response = await this.client.postPublic<LoginCmsRequest, LoginCmsResponse>(
      url,
      requestData
    );

    this.logger.log(
      formatAuditLog('cms_response', {
        method: 'POST',
        address: url,
        task: requestData.task,
        status: response?.status ?? 'unknown',
        execTime: response?.__EXEC_TIME,
        payload: response,
      })
    );

    checkCmsStatusError(response, 'CMS login failed');
    if (!response.token) {
      throw CmsError.RequestFailed({
        message: 'CMS login did not return a token',
        response,
      });
    }

    return response.token;
  }
}
