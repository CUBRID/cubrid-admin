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
import { DatabaseError } from '@error/database/database-error';
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

/** A DB login the user made, as ensureDbLogin trusts it. No password is kept. */
type DbLogin = { loggedInAt: number; hostToken: string; dbUser: string };

/** Bounds each re-login after a host login, so one stuck database can't hold the others' requests. */
const DBMT_RELOGIN_TIMEOUT_MS = 30_000;

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
  private readonly dbLoginCache = new Map<string, DbLogin>();
  // Bumped by every logout, same keys. A login that started before a logout
  // finished must not write the cache once its CMS answer arrives.
  private readonly logoutGenerations = new Map<string, number>();
  // Re-logins started by a host login, same keys; ensureDbLogin waits for
  // its own database's.
  private readonly pendingRelogins = new Map<string, Promise<void>>();

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
   * supplied). The cache here only tracks "we believe we recently logged
   * in" — it goes stale whenever the host itself is re-logged into (token
   * changed, so the conlist entry keyed to our old outbound connection is
   * orphaned) or after DBMT_LOGIN_TTL_MS, since CMS never tells us the
   * conlist entry went stale on its own.
   *
   * Only a login the user made counts: a saved profile is never used to log
   * in here. Without a live login this throws MissingDBCredentials with
   * `reason` 'loggedOut' (the user logged out) or 'notLoggedIn', so nothing
   * is read from or done to a database the user isn't logged in to.
   */
  async ensureDbLogin(userId: string, hostUid: string, dbname: string): Promise<void> {
    await this.pendingRelogins.get(`${userId}:${hostUid}:${dbname}`);
    const host = await this.hostService.findHostInternal(userId, hostUid);
    if (this.isDbLoginActive(userId, hostUid, dbname, host.token)) return;
    const reason = host.dbProfiles?.[dbname]?.loggedOut ? 'loggedOut' : 'notLoggedIn';
    throw ValidationError.MissingDBCredentials(dbname, ['id', 'password'], {
      reason,
      message: reason === 'loggedOut'
        ? `Logged out of database ${dbname}. Log in to it first.`
        : `Not logged in to database ${dbname}. Log in to it first.`,
    });
  }

  /**
   * After the host was logged in again (new CMS token), logs the user back in
   * to each database whose login was live under the old token and that has
   * a saved profile for the same database user — CMS keeps DB logins per
   * host login, so they all ended. The login keeps its original time, so it
   * still expires when it would have. A database without such a profile,
   * logged out of, or whose re-login fails is left not logged in; no
   * database gets a login it didn't have. Runs in the background; each
   * re-login is bounded by DBMT_RELOGIN_TIMEOUT_MS, and ensureDbLogin for a
   * database waits for its own. Must be called before anything else awaits
   * after the token is stored, so no request sees the gap.
   */
  restoreDbLoginsAfterHostLogin(userId: string, hostUid: string, newToken: string): void {
    const prefix = `${userId}:${hostUid}:`;
    for (const [key, login] of this.dbLoginCache) {
      if (!key.startsWith(prefix) || login.hostToken === newToken) continue;
      if (Date.now() - login.loggedInAt >= DBMT_LOGIN_TTL_MS) {
        this.dbLoginCache.delete(key);
        continue;
      }
      const dbname = key.slice(prefix.length);
      const generation = this.logoutGeneration(userId, hostUid, dbname);
      // After an earlier re-login of the same database (an earlier host login).
      const earlier = this.pendingRelogins.get(key) ?? Promise.resolve();
      const relogin = earlier.then(() => this.relogin(userId, hostUid, dbname, login, newToken, generation));
      this.pendingRelogins.set(key, relogin);
      void relogin.then(() => {
        if (this.pendingRelogins.get(key) === relogin) this.pendingRelogins.delete(key);
      });
    }
  }

  /** Whether a re-login of this database after a host login is still running. */
  isDbLoginRestoring(userId: string, hostUid: string, dbname: string): boolean {
    return this.pendingRelogins.has(`${userId}:${hostUid}:${dbname}`);
  }

  /**
   * One database of restoreDbLoginsAfterHostLogin; never rejects. `login` is
   * the cache entry it replaces: it only drops or replaces that entry (or
   * fills an empty slot), never a login made or restored in the meantime.
   */
  private async relogin(
    userId: string,
    hostUid: string,
    dbname: string,
    login: DbLogin,
    newToken: string,
    generation: number
  ): Promise<void> {
    const key = `${userId}:${hostUid}:${dbname}`;
    const stillOld = () => {
      const current = this.dbLoginCache.get(key);
      return current === undefined || current === login;
    };
    const dropOld = () => {
      if (this.dbLoginCache.get(key) === login) this.dbLoginCache.delete(key);
    };
    try {
      if (!stillOld()) return;
      const host = await this.hostService.findHostInternal(userId, hostUid);
      const profile = host.dbProfiles?.[dbname];
      if (!profile || profile.loggedOut || profile.id !== login.dbUser || host.token !== newToken) {
        dropOld();
        return;
      }
      await this.executeCmsRequest<LoginDBCmsRequest, BaseCmsResponse>(
        userId,
        hostUid,
        { task: 'dbmtuserlogin', targetid: host.id, dbname, dbuser: profile.id, dbpasswd: profile.password },
        { timeoutMs: DBMT_RELOGIN_TIMEOUT_MS }
      );
      // A logout meanwhile already dropped the login; a newer host login
      // restores it itself; a login made meanwhile is kept.
      if (this.logoutGeneration(userId, hostUid, dbname) !== generation) return;
      if ((await this.hostService.findHostInternal(userId, hostUid)).token !== newToken) return;
      if (!stillOld()) return;
      this.dbLoginCache.set(key, { loggedInAt: login.loggedInAt, hostToken: newToken, dbUser: login.dbUser });
    } catch {
      dropOld();
    }
  }

  /**
   * Read-only: whether ensureDbLogin would treat this (host, db) as already
   * logged in — the exact same cache-hit condition (same host token, within
   * DBMT_LOGIN_TTL_MS), with no side effects. CMS's conlist is keyed to the
   * login connection, so a rotated host token starts with no DB logins.
   */
  isDbLoginActive(userId: string, hostUid: string, dbname: string, hostToken: string | undefined): boolean {
    const cached = this.dbLoginCache.get(`${userId}:${hostUid}:${dbname}`);
    return !!cached && cached.hostToken === hostToken && Date.now() - cached.loggedInAt < DBMT_LOGIN_TTL_MS;
  }

  /**
   * Forgets a database's stored login profile — for a user-initiated
   * "forget saved credentials" action, and when a database is deleted or
   * renamed. Also drops the
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
   * our own bookkeeping. A stored profile is marked loggedOut, so a refused
   * or skipped action can tell "logged out" from "not logged in yet"; the
   * mark is stored with the profile so it outlives an api-server restart.
   * Logging in clears it.
   */
  async logoutDatabase(userId: string, hostUid: string, dbname: string): Promise<void> {
    const key = `${userId}:${hostUid}:${dbname}`;
    await this.setProfileLoggedOut(userId, hostUid, dbname, true);
    // In one synchronous step after the mark is stored: a login that started
    // earlier fails its generation check, and one that already finished is
    // dropped here. One that starts from now on reads the mark.
    this.logoutGenerations.set(key, this.logoutGeneration(userId, hostUid, dbname) + 1);
    this.dbLoginCache.delete(key);
    // A re-login still running can't bring it back (its generation check),
    // so stop counting it as restoring and stop making requests wait for it.
    this.pendingRelogins.delete(key);
  }

  private logoutGeneration(userId: string, hostUid: string, dbname: string): number {
    return this.logoutGenerations.get(`${userId}:${hostUid}:${dbname}`) ?? 0;
  }

  /**
   * With `generation`, only if no logout happened since it was recorded —
   * checked under the user lock, so a logout that lands between a login's
   * CMS answer and this write keeps its mark.
   */
  private async setProfileLoggedOut(
    userId: string,
    hostUid: string,
    dbname: string,
    loggedOut: boolean,
    generation?: number
  ): Promise<void> {
    await this.repository.atomicUpdateUser(userId, async (user) => {
      if (generation !== undefined && this.logoutGeneration(userId, hostUid, dbname) !== generation) return user;
      const profile = getHost(user, hostUid)?.dbProfiles?.[dbname];
      if (!profile) return user;
      if (loggedOut) profile.loggedOut = true;
      else delete profile.loggedOut;
      return user;
    });
  }

  /**
   * Login to a database using profile or client-provided credentials.
   *
   * The logout generation is read before the host lookup. If the user
   * logged out while this login waited for CMS, it fails instead of logging
   * the database back in, since the logout came last.
   */
  @HandleCmsErrors()
  async loginDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    clientId?: string,
    clientPassword?: string
  ): Promise<boolean> {
    const generation = this.logoutGeneration(userId, hostUid, dbname);
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

    if (this.logoutGeneration(userId, hostUid, dbname) !== generation) {
      throw DatabaseError.LoginDatabaseFailed({ dbname, reason: 'LOGGED_OUT_WHILE_LOGGING_IN', message: 'Logged out while logging in.' });
    }

    // Freshen ensureDbLogin's cache regardless of which credentials were
    // used (profile or client-provided) — any successful dbmtuserlogin
    // establishes the same server-side conlist state it checks for.
    this.dbLoginCache.set(`${userId}:${hostUid}:${dbname}`, {
      loggedInAt: Date.now(),
      hostToken: host.token,
      dbUser: dbAuth.id,
    });
    if (host.dbProfiles?.[dbname]?.loggedOut) {
      await this.setProfileLoggedOut(userId, hostUid, dbname, false, generation);
    }

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
   *
   * If the user's real current groups/authorization cannot be confirmed —
   * the userinfo lookup itself throws, or it succeeds but this username
   * isn't in the returned list — the password change is aborted outright
   * rather than falling back to the caller-supplied (empty placeholder)
   * values, which would silently wipe the user's real access.
   */
  @HandleCmsErrors()
  async updateUser(
    userId: string,
    hostUid: string,
    dbname: string,
    username: string,
    userpass: string,
    _groups: { group: string[] },
    _authorization: string[]
  ): Promise<UpdateDbUserResponse> {
    await this.ensureDbLogin(userId, hostUid, dbname);

    let userInfoResponse: { dbname: string; user: Array<Record<string, unknown>> };
    try {
      userInfoResponse = await this.getUserInfo(userId, hostUid, dbname);
    } catch (userInfoError: unknown) {
      this.logger.warn(
        `userinfo failed while preserving groups/authorization for "${username}" on "${dbname}", ` +
        `aborting password change rather than risk wiping real access: ` +
        `${userInfoError instanceof Error ? userInfoError.message : String(userInfoError)}`
      );
      throw userInfoError;
    }

    const existingUser = (userInfoResponse.user ?? []).find(
      (u) => String((u as Record<string, unknown>)['@name'] ?? '').toLowerCase() === username.toLowerCase()
    );

    if (!existingUser) {
      this.logger.warn(
        `User "${username}" not found in userinfo response for "${dbname}" while preserving ` +
        `groups/authorization; aborting password change rather than risk wiping real access.`
      );
      throw DatabaseError.GetUserInfoFailed({
        dbname,
        username,
        reason: 'USER_NOT_IN_USERINFO',
        message:
          `Cannot change password for "${username}": could not confirm their current ` +
          `groups/authorization on "${dbname}" (user not found in userinfo response).`,
      });
    }

    // CMS returns groups as [{ group: [...] }] (an open/close section), and
    // updateuser only reads groups sent back in that same array shape. It
    // drops every existing group before re-adding the requested ones and no
    // longer re-adds PUBLIC itself, so PUBLIC is always included here.
    const fetchedGroups = new Set<string>(['PUBLIC']);
    const rawGroups = (existingUser as Record<string, unknown>).groups;
    const groupSections = Array.isArray(rawGroups) ? rawGroups : [rawGroups];
    for (const section of groupSections) {
      const names = (section as { group?: unknown } | null | undefined)?.group;
      for (const name of Array.isArray(names) ? names : [names]) {
        if (typeof name === 'string' && name) {
          fetchedGroups.add(name.toUpperCase());
        }
      }
    }
    const preservedGroups = [{ group: [...fetchedGroups] }];

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
    const preservedAuthorization = fetchedAuthorization;

    // An empty password keeps the current one. CMS updateuser can't clear a
    // password and leaves it alone when the field is absent, so the field is
    // left out here rather than sent empty.
    const cmsRequest: UpdateUserCmsRequest = {
      task: 'updateuser',
      dbname,
      username,
      ...(userpass === '' ? {} : { userpass }),
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
