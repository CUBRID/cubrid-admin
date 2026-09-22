import {
  CreateDbUserResponse,
  DeleteDbUserResponse,
  UpdateDbUserResponse,
  UserInfoClientResponse,
} from '@api-interfaces';
import {
  BaseService,
  HandleCmsErrors,
} from '@common';
import { HostService } from '@host';
import { getHost } from '@host/host-group.util';
import { Injectable } from '@nestjs/common';
import { UserRepositoryService } from '@repository';
import { DBAuthResolver } from '@util';
import { ValidationError } from '@error/validation/validation-error';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseCmsResponse } from '@type';
import {
  LoginDBCmsRequest,
  UpdateUserCmsRequest,
  UserInfoCmsRequest,
  CreateUserCmsRequest,
  DeleteUserCmsRequest,
  UserVerifyCmsRequest,
} from '@type/cms-request';
import {
  UpdateUserCmsResponse,
  UserInfoCmsResponse,
  CreateUserCmsResponse,
  DeleteUserCmsResponse,
  UserVerifyCmsResponse,
} from '@type/cms-response';

/** How long a dbmtuserlogin is trusted before ensureDbLogin re-checks it — see ensureDbLogin's doc comment. Not yet validated against real usage; tune freely. */
const DBMT_LOGIN_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Service for managing database users.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class DatabaseUserService extends BaseService {
  // In-memory only, keyed by "userId:hostUid:dbname". CMS's own conlist
  // (populated by dbmtuserlogin) has no expiry and is keyed by our outbound
  // ip:port, not by any session we control — we can't ask CMS "is this still
  // valid", we can only track "we believe we last (re-)established it here".
  // Lost on api-server restart, which is safe: worst case is one redundant
  // re-login next time.
  private readonly dbLoginCache = new Map<string, { loggedInAt: number; hostToken: string }>();

  constructor(
    private readonly repository: UserRepositoryService,
    protected readonly cmsClient: CmsHttpsClientService,
    protected readonly hostService: HostService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Get list of database users for a database on a host. CMS task: userinfo.
   */
  @HandleCmsErrors()
  async getDatabaseUsers(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<UserInfoClientResponse> {
    return this.getUserInfo(userId, hostUid, dbname);
  }

  /**
   * Ensures this (host, db) has a live dbmtuserlogin before a CMS task that
   * relies on the server-side conlist cache instead of sending its own
   * dbuser/dbpasswd (userinfo/updateuser/createuser/deleteuser, lockdb,
   * gettransactioninfo on CUBRID 11+, killtransaction when no password is
   * supplied). The cache here only tracks "we believe we recently
   * (re-)logged in" — it goes stale whenever the host itself is re-logged
   * into (token changed, so the conlist entry keyed to our old outbound
   * connection is orphaned) or after DBMT_LOGIN_TTL_MS, since CMS never
   * tells us the conlist entry went stale on its own.
   *
   * If the stored profile's password turns out to be wrong (CUBRID's own
   * "Incorrect or missing password." error), the profile is deleted so the
   * next attempt falls through to the manual Login Database flow instead of
   * repeatedly failing silently against a dead password.
   *
   * No-ops (and never touches the cache) when no profile is stored for this
   * db — the resulting ValidationError.MissingDBCredentials is meant to
   * propagate and prompt for manual login, same as today.
   */
  async ensureDbLogin(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<{ reauthenticated: boolean }> {
    const host = await this.hostService.findHostInternal(userId, hostUid);
    const key = `${userId}:${hostUid}:${dbname}`;
    const cached = this.dbLoginCache.get(key);
    const now = Date.now();

    if (cached && cached.hostToken === host.token && now - cached.loggedInAt < DBMT_LOGIN_TTL_MS) {
      return { reauthenticated: false };
    }

    if (!host.dbProfiles?.[dbname]) {
      throw ValidationError.MissingDBCredentials(dbname, ['id', 'password']);
    }

    try {
      // No clientId/clientPassword — DBAuthResolver falls through to the
      // stored profile, and loginDatabase itself freshens the cache on
      // success.
      await this.loginDatabase(userId, hostUid, dbname);
    } catch (err) {
      if (this.isBadDbPasswordError(err)) {
        await this.deleteDbProfile(userId, hostUid, dbname);
      }
      throw err;
    }

    return { reauthenticated: true };
  }

  /**
   * Detects CUBRID's own "Incorrect or missing password." message
   * (ER_AU_INVALID_PASSWORD, engine error -171) — the one reliable signal
   * that a dbmtuserlogin failure was genuinely a bad password rather than a
   * transient/unrelated one (host unreachable, database not found, etc).
   * Fragile by nature: depends on the engine's English message catalog
   * wording, so a locale or wording change silently stops matching — that
   * just means we stop pruning bad profiles, not a hard failure.
   */
  private isBadDbPasswordError(err: unknown): boolean {
    const message = (err as { additionalData?: { message?: unknown } })?.additionalData?.message;
    return typeof message === 'string' && message.includes('Incorrect or missing password');
  }

  /**
   * Forgets a database's stored login profile — used both automatically
   * (ensureDbLogin, after a confirmed bad-password failure) and directly for
   * a user-initiated "forget saved credentials" action. Also drops the
   * ensureDbLogin cache entry, so the next action re-checks for a profile
   * instead of assuming the login it just forgot is still good.
   */
  async deleteDbProfile(userId: string, hostUid: string, dbname: string): Promise<void> {
    await this.repository.atomicUpdateUser(userId, async (user) => {
      const host = getHost(user, hostUid);
      if (host?.dbProfiles?.[dbname]) {
        delete host.dbProfiles[dbname];
      }
      return user;
    });
    this.dbLoginCache.delete(`${userId}:${hostUid}:${dbname}`);
  }

  /**
   * Explicitly logs out of a database — forgets ensureDbLogin's belief that
   * this (host, db) has a live dbmtuserlogin, so the next database action
   * goes through a fresh login instead of reusing the cached one. Does not
   * touch the stored profile (see deleteDbProfile for that): a "log me out
   * of this session" action, not "forget these credentials".
   *
   * There's no CMS-side counterpart to actually invalidate the server's own
   * conlist entry (no such API exists — see ensureDbLogin's doc comment on
   * conlist having no expiry/removal mechanism at all), so this is purely
   * our own bookkeeping. The next action will re-authenticate using the
   * profile if one is still stored, or prompt for manual login otherwise.
   */
  async logoutDatabase(userId: string, hostUid: string, dbname: string): Promise<void> {
    this.dbLoginCache.delete(`${userId}:${hostUid}:${dbname}`);
  }

  /**
   * Login to a database using profile or client-provided credentials.
   */
  @HandleCmsErrors()
  async loginDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    clientId?: string,
    clientPassword?: string
  ): Promise<boolean> {
    const host = await this.hostService.findHostInternal(userId, hostUid);
    const dbAuth = DBAuthResolver.resolve(host, dbname, clientId, clientPassword);

    const cmsRequest: LoginDBCmsRequest = {
      task: 'dbmtuserlogin',
      targetid: host.id,
      dbname: dbAuth.dbname,
      dbuser: dbAuth.id,
      dbpasswd: dbAuth.password,
    };

    await this.executeCmsRequest<LoginDBCmsRequest, BaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    // Freshen ensureDbLogin's cache regardless of which credentials were
    // used (profile or client-provided) — any successful dbmtuserlogin
    // establishes the same server-side conlist state it checks for.
    this.dbLoginCache.set(`${userId}:${hostUid}:${dbname}`, {
      loggedInAt: Date.now(),
      hostToken: host.token,
    });

    return true;
  }

  /**
   * Update a database user.
   *
   * The frontend no longer exposes group/authorization editing (that UI was
   * removed as deprecated), so it always sends `groups`/`authorization` as
   * empty placeholders. Sending those through to CMS `updateuser` verbatim
   * would silently strip whatever groups/authorization the user actually
   * had — CUBRID's system-catalog SELECT grants for non-DBA/PUBLIC users
   * flow through group membership, so this reads as an ordinary password
   * change but wipes the user's access to db_class/db_user/etc. Every
   * caller's `groups`/`authorization` arguments are therefore ignored in
   * favor of the user's real, current values fetched here — mirrors the
   * preserve step the create-database wizard's DBA-password path already
   * does for the same reason.
   */
  @HandleCmsErrors()
  async updateUser(
    userId: string,
    hostUid: string,
    dbname: string,
    username: string,
    userpass: string,
    groups: { group: string[] },
    authorization: string[]
  ): Promise<UpdateDbUserResponse> {
    await this.ensureDbLogin(userId, hostUid, dbname);

    let preservedGroups = groups;
    let preservedAuthorization = authorization;

    try {
      const userInfoResponse = await this.getUserInfo(userId, hostUid, dbname);
      const existingUser = (userInfoResponse.user ?? []).find(
        (u) => String((u as Record<string, unknown>)['@name'] ?? '').toLowerCase() === username.toLowerCase()
      );

      if (existingUser) {
        const fetchedGroups: string[] = [];
        const rawGroups = (existingUser as Record<string, unknown>).groups as any;
        if (Array.isArray(rawGroups?.group)) {
          fetchedGroups.push(...rawGroups.group.filter((g: unknown) => typeof g === 'string'));
        }
        preservedGroups = { group: fetchedGroups };

        const fetchedAuthorization: string[] = [];
        const rawAuthorization = (existingUser as Record<string, unknown>).authorization;
        if (Array.isArray(rawAuthorization)) {
          for (const entry of rawAuthorization as Array<Record<string, string>>) {
            const name = entry?.['@name'];
            if (typeof name === 'string' && name) {
              fetchedAuthorization.push(name);
            }
          }
        }
        preservedAuthorization = fetchedAuthorization;
      }
    } catch (userInfoError: unknown) {
      this.logger.warn(
        `userinfo failed while preserving groups/authorization for "${username}" on "${dbname}", ` +
        `proceeding with caller-supplied values: ` +
        `${userInfoError instanceof Error ? userInfoError.message : String(userInfoError)}`
      );
    }

    const cmsRequest: UpdateUserCmsRequest = {
      task: 'updateuser',
      dbname,
      username,
      userpass,
      groups: preservedGroups,
      authorization: preservedAuthorization,
    };

    await this.executeCmsRequest<UpdateUserCmsRequest, UpdateUserCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Get user info (list of users) for a database. CMS task: userinfo.
   */
  @HandleCmsErrors()
  async getUserInfo(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<{ dbname: string; user: Array<Record<string, unknown>> }> {
    await this.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: UserInfoCmsRequest = { task: 'userinfo', dbname };

    const response = await this.executeCmsRequest<UserInfoCmsRequest, UserInfoCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return {
      dbname: response.dbname ?? dbname,
      user: response.user ?? [],
    };
  }

  /**
   * Create a database user. CMS task: createuser.
   */
  @HandleCmsErrors()
  async createUser(
    userId: string,
    hostUid: string,
    dbname: string,
    username: string,
    userpass: string,
    groups: { group: string[] },
    authorization: unknown[]
  ): Promise<CreateDbUserResponse> {
    await this.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: CreateUserCmsRequest = {
      task: 'createuser',
      dbname,
      username,
      userpass,
      groups,
      authorization,
    };

    await this.executeCmsRequest<CreateUserCmsRequest, CreateUserCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Delete a database user. CMS task: deleteuser.
   */
  @HandleCmsErrors()
  async deleteUser(
    userId: string,
    hostUid: string,
    dbname: string,
    username: string
  ): Promise<DeleteDbUserResponse> {
    await this.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: DeleteUserCmsRequest = {
      task: 'deleteuser',
      dbname,
      username,
    };

    await this.executeCmsRequest<DeleteUserCmsRequest, DeleteUserCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Verify database user credentials. CMS task: userverify.
   */
  @HandleCmsErrors()
  async userVerify(
    userId: string,
    hostUid: string,
    dbname: string,
    dbuser: string,
    dbpasswd: string
  ): Promise<{ verified: boolean }> {
    const cmsRequest: UserVerifyCmsRequest = {
      task: 'userverify',
      dbname,
      dbuser,
      dbpasswd,
    };

    await this.executeCmsRequest<UserVerifyCmsRequest, UserVerifyCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { verified: true };
  }
}
