import { Injectable, Logger } from '@nestjs/common';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { HaService } from '@ha';
import { checkCmsStatusError } from '@common';
import { BaseCmsRequest, HostInfo, LoginCmsRequest, LoginCmsResponse, User } from '@type/index';
import { findConnectedHostFor, getHost } from '@host/host-group.util';
import { UserRepositoryService } from '@repository';
import { DatabaseUserService } from '@database/user/database-user.service';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';
import type { CmsHostLoginClientResponse, UpdateHostRequest } from '@api-interfaces';
import { CMS_CONFNAME_CM, CMS_CONFNAME_CUBRID } from '@database/database.constants';
import { closeCmsToken, cmsSessionExpiresAt, forgetCmsToken, parseTokenActiveTime } from '@cms-https-client/cms-token-activity';
import { HostService } from '@host';
import {
  clearHostConfCache,
  flattenHanodelist,
  formatAuditLog,
  isHostHaModeOnFromCubridConf,
  resolveCurrentNodeRole,
} from '@util';

// The browser gives up on a request after 60s (apiClient.js). `connect` saves
// only when the CMS login succeeded by CONNECT_LOGIN_DEADLINE_MS, and answers
// by CONNECT_ANSWER_DEADLINE_MS, so the screen never shows a failure for
// settings that were saved. Both count from the request, host queue included.
export const CONNECT_LOGIN_DEADLINE_MS = 40_000;
export const CONNECT_ANSWER_DEADLINE_MS = 50_000;

/** Rejects with `late()` when `promise` has not settled by `deadlineAt`. */
async function settleBy<T>(promise: Promise<T>, deadlineAt: number, late: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(late()), Math.max(0, deadlineAt - Date.now()));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// CMS installs with admin/admin; the client suggests changing it.
const defaultPasswordFlag = (host: HostInfo) =>
  host.id === 'admin' && host.password === 'admin' ? { usesDefaultPassword: true } : {};

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
    private readonly haService: HaService,
    private readonly databaseUserService: DatabaseUserService,
    private readonly hostService: HostService
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
    const host = await this.loadHost(userId, uid);
    const token = await this.requestToken(userId, uid, host);
    await this.adoptToken(userId, uid, token);
    this.restoreDbLogins(userId, uid, token);
    return this.finishLogin(userId, uid, host, token);
  }

  /**
   * Logs in with changed connection settings and saves them (with the new
   * session) only once that login succeeds, so a failed attempt leaves the
   * stored settings as they were.
   *
   * Answers within CONNECT_ANSWER_DEADLINE_MS, before the browser gives up on
   * the request: a CMS that has not let the login through by
   * CONNECT_LOGIN_DEADLINE_MS fails it without saving, even if the CMS answers
   * later. After saving it always reports success; HA details that cannot be
   * read by the deadline come back as `haInfoUnavailable` for the client to
   * read again.
   *
   * A connected host whose address, port, CMS user and password are
   * unchanged is not logged in again: the other changes are saved, and its
   * CMS session and DB logins stay as they are.
   */
  public async connect(
    userId: string,
    uid: string,
    changes: UpdateHostRequest
  ): Promise<CmsHostLoginClientResponse> {
    const startedAt = Date.now();
    const loginBy = startedAt + CONNECT_LOGIN_DEADLINE_MS;
    const stored = await this.loadHost(userId, uid);
    // The save's own checks first: a login that the save then refuses would
    // only start a CMS session for nothing.
    await this.hostService.checkHostUpdate(userId, uid, changes);
    const host: HostInfo = {
      ...stored,
      address: changes.address ?? stored.address,
      port: changes.port ?? stored.port,
      id: changes.id ?? stored.id,
      password: changes.password ?? stored.password,
    };
    // Before the save below, which may update `stored` in place.
    const sameServer = isSameCmsServer(stored, host);

    // Nothing CMS sees changed (address, port, CMS user, password; a password
    // left unchanged counts as the same) and the host is connected: save the
    // other changes only. A login would start a new CMS session, and the DB
    // logins without a saved profile would end with the old one.
    if (isSameConnection(stored, host) && (cmsSessionExpiresAt(stored) ?? 0) > startedAt) {
      await this.hostService.updateHost(userId, uid, changes);
      try {
        return await settleBy(
          this.getHaInfo(userId, uid).then((haInfo) => ({ ...haInfo, ...defaultPasswordFlag(host) })),
          startedAt + CONNECT_ANSWER_DEADLINE_MS,
          () => new Error(`not finished within ${CONNECT_ANSWER_DEADLINE_MS}ms`)
        );
      } catch (err) {
        this.logger.warn(`Saved the settings of connected host ${uid}, but could not read its HA details: ${err}`);
        return { success: true, isHA: false, haInfoUnavailable: true, ...defaultPasswordFlag(host) };
      }
    }

    const token = await settleBy(
      this.requestToken(userId, uid, host, { notAfter: loginBy }),
      loginBy,
      () => CmsError.NoResponse({ hostUid: uid, deadlineMs: CONNECT_LOGIN_DEADLINE_MS })
    );

    await this.hostService.updateHost(userId, uid, { ...changes, token });
    if (sameServer) {
      this.restoreDbLogins(userId, uid, token);
    } else {
      // Another CMS server or account: the earlier DB logins were on the old
      // one, and logging back in would send the saved DB passwords to the new.
      this.databaseUserService.forgetDbLoginsOfHost(userId, uid);
    }
    await this.adoptToken(userId, uid, token);
    try {
      return await settleBy(
        this.finishLogin(userId, uid, host, token),
        startedAt + CONNECT_ANSWER_DEADLINE_MS,
        () => new Error(`not finished within ${CONNECT_ANSWER_DEADLINE_MS}ms`)
      );
    } catch (err) {
      this.logger.warn(`Connected to host ${uid} and saved its settings, but could not read its HA details: ${err}`);
      return { success: true, isHA: false, haInfoUnavailable: true, ...defaultPasswordFlag(host) };
    }
  }

  private async loadHost(userId: string, uid: string): Promise<HostInfo> {
    const user = await this.repository.loadUserById(userId);
    const host: HostInfo | null = getHost(user, uid);
    if (!host) {
      throw HostError.NoSuchHost({ uid: uid });
    }
    return host;
  }

  /** Sends the CMS login for `host` and resolves to the token it returns. */
  private async requestToken(
    userId: string,
    uid: string,
    host: HostInfo,
    options?: { notAfter?: number }
  ): Promise<string> {
    const url = `https://${host.address}:${host.port}/cm_api`;
    // A new CMS session: start-info reads the host's conf files afresh.
    clearHostConfCache(uid);
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

    const response = await this.client.postPublic<LoginCmsRequest, LoginCmsResponse>(url, request, options);

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
        reason: 'NO_TOKEN',
        message: 'CMS login did not return a token',
        response,
      });
    }
    return response.token;
  }

  /** Stores `token` as the host's CMS session. */
  private async adoptToken(userId: string, uid: string, token: string): Promise<void> {
    await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const persisted = getHost(user, uid);
      if (!persisted) {
        throw HostError.NoSuchHost({ uid });
      }
      if (persisted.token !== token) forgetCmsToken(persisted.token);
      persisted.token = token;
      persisted.initialLogin = false;
      persisted.cmsTokenIssuedAt = Date.now();
      delete persisted.cmsTokenActiveTimeSec;
      return user;
    });
  }

  /**
   * The new token ended every DB login CMS held for the old one. Called right
   * after the token is stored, before anything else awaits, so a DB request
   * in between waits for the re-login instead of finding no login.
   */
  private restoreDbLogins(userId: string, uid: string, token: string): void {
    this.databaseUserService.restoreDbLoginsAfterHostLogin(userId, uid, token);
  }

  /** What follows a stored login and its DB logins: the token lifetime, HA details. */
  private async finishLogin(
    userId: string,
    uid: string,
    host: HostInfo,
    token: string
  ): Promise<CmsHostLoginClientResponse> {
    await this.rememberTokenActiveTime(userId, uid, token);

    const haInfo = await this.getHaInfo(userId, uid);
    return { ...haInfo, ...defaultPasswordFlag(host) };
  }

  /**
   * Stores the host's cm.conf token_active_time with its session, so the
   * host list can tell when an unused token expires. Without it the CMS
   * default (7200s) is assumed. CMS reads the value at startup, so an edit
   * not yet followed by a CMS restart is read here before it takes effect.
   */
  private async rememberTokenActiveTime(userId: string, uid: string, token: string): Promise<void> {
    let seconds: number;
    try {
      seconds = parseTokenActiveTime(
        await this.cmsConfigService.getAllSystemParam(userId, uid, CMS_CONFNAME_CM)
      );
    } catch (err) {
      this.logger.warn(`Could not read token_active_time from cm.conf for host ${uid}: ${err}`);
      return;
    }
    await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const persisted = getHost(user, uid);
      // Skip if another login replaced the token meanwhile.
      if (persisted?.token === token) persisted.cmsTokenActiveTimeSec = seconds;
      return user;
    });
  }

  /**
   * Marks the host's CMS session as closed by the user, so a reload no longer
   * shows it as connected. The CMS session is not logged out (CMS's logout
   * task would end it for other tabs still using the token); their requests
   * sent from now on reopen it (ones already in flight do not).
   */
  public async disconnect(userId: string, uid: string): Promise<void> {
    await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const persisted = getHost(user, uid);
      if (!persisted) {
        throw HostError.NoSuchHost({ uid });
      }
      closeCmsToken(persisted.token);
      delete persisted.cmsTokenIssuedAt;
      return user;
    });
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

    // Only node roles are used here: skip the per-database changemode runs.
    const hb = await this.haService.heartbeatlistInternal(userId, uid, 'n');
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
  public async testLogin(host: Pick<HostInfo, 'address' | 'port' | 'id' | 'password'>): Promise<string> {
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
        reason: 'NO_TOKEN',
        message: 'CMS login did not return a token',
        response,
      });
    }

    return response.token;
  }

  /**
   * Checks that the given address, port, account and password log in to CMS,
   * saving nothing (Add Host's Test Connection). The test session is logged
   * out at once: left open it would pile up in CMS, and where CMS keeps one
   * session per account a later login would end it anyway.
   */
  public async testConnection(
    userId: string,
    target: Pick<HostInfo, 'address' | 'port' | 'id' | 'password'>,
    editedUid?: string
  ): Promise<{ success: true }> {
    await this.refuseTestOverConnectedHost(userId, target, editedUid);
    const token = await this.testLogin(target);
    const url = `https://${target.address}:${target.port}/cm_api`;
    try {
      await this.client.postAuthenticated<BaseCmsRequest, unknown>(url, { task: 'logout', token });
    } catch (error: unknown) {
      // The login worked, which is what was asked; CMS ends an unused session itself.
      this.logger.warn(`CMS logout after a connection test failed: ${String(error)}`);
    } finally {
      forgetCmsToken(token);
    }
    return { success: true };
  }

  /**
   * Test Connection for a saved host (Edit Host): its stored settings with
   * the dialog's changes, the password only when it was changed. Nothing is
   * saved.
   */
  public async testConnectionFor(userId: string, uid: string, changes: UpdateHostRequest): Promise<{ success: true }> {
    const stored = await this.loadHost(userId, uid);
    return this.testConnection(userId, {
      address: changes.address ?? stored.address,
      port: changes.port ?? stored.port,
      id: changes.id ?? stored.id,
      password: changes.password ?? stored.password,
    }, uid);
  }

  /**
   * Refuses a test login that could end a connected host's CMS session: one
   * with the same address, port and CMS user, or the host being edited while
   * it is connected (the dialog's Test Connection is off then too).
   */
  private async refuseTestOverConnectedHost(
    userId: string,
    target: Pick<HostInfo, 'address' | 'port' | 'id'>,
    editedUid?: string
  ): Promise<void> {
    const user = await this.repository.loadUserById(userId);
    const connected = findConnectedHostFor(user, target, editedUid);
    if (connected) {
      throw HostError.HostConnected({ hostUid: connected.uid, alias: connected.alias, reason: 'HOST_CONNECTED' });
    }
  }
}

/** Whether two host settings point at the same CMS server and account. */
function isSameCmsServer(a: Pick<HostInfo, 'address' | 'port' | 'id'>, b: Pick<HostInfo, 'address' | 'port' | 'id'>): boolean {
  return (
    a.address?.trim().toLowerCase() === b.address?.trim().toLowerCase() &&
    String(a.port) === String(b.port) &&
    a.id === b.id
  );
}

/**
 * Whether the settings a CMS login uses are unchanged, compared the way
 * HostService.updateHost does before it keeps the stored session.
 */
function isSameConnection(
  a: Pick<HostInfo, 'address' | 'port' | 'id' | 'password'>,
  b: Pick<HostInfo, 'address' | 'port' | 'id' | 'password'>
): boolean {
  return String(a.address) === String(b.address) && String(a.port) === String(b.port) &&
    String(a.id) === String(b.id) && String(a.password) === String(b.password);
}
