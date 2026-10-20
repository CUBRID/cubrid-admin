import {
  AddBackupInfoClientRequest,
  AddBackupInfoClientResponse,
  DeleteBackupInfoClientRequest,
  DeleteBackupInfoClientResponse,
  GetBackupInfoClientResponse,
  BackupDbListClientRequest,
  BackupDbListClientResponse,
  SetBackupInfoClientRequest,
  SetBackupInfoClientResponse,
  GetAutoBackupDbErrLogRequest,
  GetAutoBackupDbErrLogResponse,
  BackupDbInfoClientRequest,
  BackupDbInfoClientResponse,
  BackupDbClientRequest,
  BackupDbClientResponse,
  RestoreDbClientRequest,
  RestoreDbClientResponse,
} from '@api-interfaces';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import {
  BaseService,
  HandleCmsErrors,
} from '@common';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { DatabaseUserService } from '@database/user/database-user.service';
import { DatabaseInfoService } from '@database/info/database-info.service';
import { DatabaseError } from '@error/database/database-error';
import {
  AddBackupInfoCmsRequest,
  DeleteBackupInfoCmsRequest,
  GetBackupInfoCmsRequest,
  GetBackupListCmsRequest,
  SetBackupInfoCmsRequest,
  GetAutoBackupDbErrLogCmsRequest,
  BackupDbInfoCmsRequest,
  BackupDbCmsRequest,
  RestoreDbCmsRequest,
} from '@type/cms-request';
import {
  AddBackupInfoCmsResponse,
  DeleteBackupInfoCmsResponse,
  GetBackupInfoCmsResponse,
  GetBackupListCmsResponse,
  SetBackupInfoCmsResponse,
  GetAutoBackupDbErrLogCmsResponse,
  BackupDbInfoCmsResponse,
  BackupDbCmsResponse,
  RestoreDbCmsResponse,
  BackupInfo,
} from '@type/cms-response';

/**
 * Service for managing database backup operations.
 * Handles automated backup schedule management.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class DatabaseBackupService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService,
    private readonly databaseUserService: DatabaseUserService,
    private readonly databaseInfoService: DatabaseInfoService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Add automated backup schedule information for a database.
   * Returns empty object on success (CMS envelope fields removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param backupInfo Backup information
   * @returns AddBackupInfoClientResponse Empty object on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async addBackupSchedule(
    userId: string,
    hostUid: string,
    dbname: string,
    backupInfo: AddBackupInfoClientRequest
  ): Promise<AddBackupInfoClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: AddBackupInfoCmsRequest = {
      task: 'addbackupinfo',
      dbname: dbname,
      backupid: backupInfo.backupid,
      path: backupInfo.path,
      period_type: backupInfo.period_type,
      period_date: backupInfo.period_date,
      time: backupInfo.time,
      level: backupInfo.level,
      archivedel: backupInfo.archivedel,
      updatestatus: backupInfo.updatestatus,
      storeold: backupInfo.storeold,
      onoff: backupInfo.onoff,
      zip: backupInfo.zip,
      check: backupInfo.check,
      mt: backupInfo.mt,
      bknum: backupInfo.bknum,
    };

    await this.executeCmsRequest<AddBackupInfoCmsRequest, AddBackupInfoCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Set automated backup schedule information for a database.
   * Returns empty object on success (CMS envelope fields removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param backupInfo Backup information
   * @returns SetBackupInfoClientResponse Empty object on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async setBackupSchedule(
    userId: string,
    hostUid: string,
    dbname: string,
    backupInfo: SetBackupInfoClientRequest
  ): Promise<SetBackupInfoClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: SetBackupInfoCmsRequest = {
      task: 'setbackupinfo',
      dbname: dbname,
      backupid: backupInfo.backupid,
      path: backupInfo.path,
      period_type: backupInfo.period_type,
      period_date: backupInfo.period_date,
      time: backupInfo.time,
      level: backupInfo.level,
      archivedel: backupInfo.archivedel,
      updatestatus: backupInfo.updatestatus,
      storeold: backupInfo.storeold,
      onoff: backupInfo.onoff,
      zip: backupInfo.zip,
      check: backupInfo.check,
      mt: backupInfo.mt,
      bknum: backupInfo.bknum,
    };

    await this.executeCmsRequest<SetBackupInfoCmsRequest, SetBackupInfoCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Delete automated backup schedule information for a database.
   * Returns response with execution details.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param backupInfo Backup information to delete
   * @returns DeleteBackupInfoClientResponse Response with execution details
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async deleteBackupSchedule(
    userId: string,
    hostUid: string,
    dbname: string,
    backupInfo: DeleteBackupInfoClientRequest
  ): Promise<DeleteBackupInfoClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: DeleteBackupInfoCmsRequest = {
      task: 'deletebackupinfo',
      dbname: dbname,
      backupid: backupInfo.backupid,
    };

    await this.executeCmsRequest<DeleteBackupInfoCmsRequest, DeleteBackupInfoCmsResponse>(
      userId,
      hostUid,
      cmsRequest
    );

    return { success: true };
  }

  /**
   * Get automated backup schedule information for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @returns GetBackupInfoClientResponse Backup information
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getBackupSchedule(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<GetBackupInfoClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: GetBackupInfoCmsRequest = {
      task: 'getbackupinfo',
      dbname: dbname,
    };

    this.logger.debug(`Getting backup schedule information for database: ${dbname}`);

    const response = await this.executeCmsRequest<
      GetBackupInfoCmsRequest,
      GetBackupInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    // Extract dbname before extractDomainData to preserve string type
    const responseDbname = response.dbname as string;
    const { dbname: _, ...rest } = this.extractDomainData(response);
    // CMS API returns backup info with database name as a dynamic key
    const backupArray = (rest[dbname] as BackupInfo[] | undefined) || [];

    return {
      dbname: responseDbname,
      backups: backupArray || [],
    };
  }

  /**
   * Get backup DB physical info (dbdir, freespace, level0/1/2 backup list).
   * CMS task: backupdbinfo. level0, level1, level2 may be empty arrays.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request Client request with dbname
   * @returns BackupDbInfoClientResponse dbdir, freespace, level0, level1, level2
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getBackupDbInfo(
    userId: string,
    hostUid: string,
    request: BackupDbInfoClientRequest
  ): Promise<BackupDbInfoClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, request.dbname);

    const cmsRequest: BackupDbInfoCmsRequest = {
      task: 'backupdbinfo',
      dbname: request.dbname,
    };

    this.logger.debug(`Getting backup db info for database: ${request.dbname}`);

    const response = await this.executeCmsRequest<
      BackupDbInfoCmsRequest,
      BackupDbInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      dbdir: response.dbdir ?? '',
      freespace: response.freespace ?? '',
      level0: Array.isArray(response.level0) ? response.level0 : [],
      level1: Array.isArray(response.level1) ? response.level1 : [],
      level2: Array.isArray(response.level2) ? response.level2 : [],
    };
  }

  /**
   * Get backup DB list (level0/1/2 entries only).
   * CMS task: getbackuplist.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request Client request with dbname
   * @returns BackupDbListClientResponse level0/1/2, note, status, task
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getBackupList(
    userId: string,
    hostUid: string,
    request: BackupDbListClientRequest
  ): Promise<BackupDbListClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, request.dbname);

    const cmsRequest: GetBackupListCmsRequest = {
      task: 'getbackuplist',
      dbname: request.dbname,
    };

    this.logger.debug(`Getting backup db list for database: ${request.dbname}`);

    const response = await this.executeCmsRequest<
      GetBackupListCmsRequest,
      GetBackupListCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      level0: response.level0 ?? 'none',
      level1: response.level1 ?? 'none',
      level2: response.level2 ?? 'none',
    };
  }

  /**
   * Execute database backup (level 0, 1, or 2). CMS task: backupdb.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request (level, backupdir, removelog?, check?, mt?, zip?, safereplication?)
   * @returns BackupDbClientResponse empty body on success (CMS envelope omitted)
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async backupDb(
    userId: string,
    hostUid: string,
    dbname: string,
    request: BackupDbClientRequest,
    onUuid?: (uuid: string) => void | Promise<void>
  ): Promise<BackupDbClientResponse> {
    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: BackupDbCmsRequest = {
      task: 'backupdb',
      dbname,
      level: request.level,
      backupdir: request.backupdir,
      // Fixed per dbname (not per level): CMS builds without CBRD-27065 always
      // do `snprintf(path, "%s/%s", backupdir, volname)` with no null check,
      // so an omitted volname renders as a literal "(null)" path segment on
      // any CMS that hasn't picked up that fix yet (which is every currently
      // deployed release — it only lands from 11.5). Sending the SAME
      // volname for every level keeps backupdir/volname as one shared
      // directory across levels (needed for restoredb's single -B argument)
      // on both old and fixed CMS builds, without needing to detect which.
      volname: `${dbname}_backup`,
      removelog: request.removelog ?? 'y',
      check: request.check ?? 'n',
      mt: request.mt ?? '0',
      zip: request.zip ?? 'n',
      safereplication: request.safereplication ?? 'n',
    };

    this.logger.debug(`Executing backup for database: ${dbname} level: ${request.level}`);

    await this.executeAsyncCmsJobRequest<BackupDbCmsRequest, BackupDbCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { onUuid }
    );

    return { success: true };
  }

  /**
   * Restore database from backup.
   * CMS task: restoredb.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Restore information
   * @returns RestoreDbClientResponse empty body on success (CMS envelope omitted)
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async restoreDb(
    userId: string,
    hostUid: string,
    dbname: string,
    request: RestoreDbClientRequest,
    onUuid?: (uuid: string) => void | Promise<void>
  ): Promise<RestoreDbClientResponse> {
    // restoredb never touches the ha_apply_info catalog (the replication
    // apply-position bookmark) — CUBRID ships a dedicated `restoreslave`
    // utility specifically because plain restoredb leaves that catalog
    // stale after restoring, which desyncs the HA peer's replication apply
    // position. Webmanager only ever invokes restoredb, never restoreslave.
    if (await this.databaseInfoService.effectiveHaDbForDbname(userId, hostUid, dbname)) {
      throw DatabaseError.RestoreNotSupportedForHaDatabase({ dbname });
    }

    await this.databaseUserService.ensureDbLogin(userId, hostUid, dbname);

    const cmsRequest: RestoreDbCmsRequest = {
      task: 'restoredb',
      dbname,
      date: request.date,
      level: request.level,
      partial: request.partial,
      pathname: request.pathname,
      recoverypath: request.recoverypath,
    };

    this.logger.debug(`Restoring database: ${dbname} on host: ${hostUid}`);

    await this.executeAsyncCmsJobRequest<RestoreDbCmsRequest, RestoreDbCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { onUuid }
    );

    return { success: true };
  }

  /**
   * Get auto-backup database error log.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request Client request (empty object)
   * @returns GetAutoBackupDbErrLogResponse Error log entries
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getAutoBackupDbErrLog(
    userId: string,
    hostUid: string,
    _request: GetAutoBackupDbErrLogRequest
  ): Promise<GetAutoBackupDbErrLogResponse> {
    const cmsRequest: GetAutoBackupDbErrLogCmsRequest = {
      task: 'getautobackupdberrlog',
    };

    this.logger.debug('Getting auto-backup database error log');

    const response = await this.executeCmsRequest<
      GetAutoBackupDbErrLogCmsRequest,
      GetAutoBackupDbErrLogCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }
}
