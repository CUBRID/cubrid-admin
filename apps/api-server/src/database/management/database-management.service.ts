import {
  AddVolDbRequest,
  AddVolDbResponse,
  CheckDatabaseRequest,
  CheckDatabaseResponse,
  CompactDatabaseRequest,
  CompactDatabaseResponse,
  CopyDbRequest,
  CmsSuccessClientResponse,
  GetAddVolStatusResponse,
  LoadDatabaseRequest,
  LoadDatabaseResponse,
  LockDatabaseRequest,
  LockDatabaseResponse,
  GetTransactionInfoRequest,
  GetTransactionInfoResponse,
  KillTransactionRequest,
  KillTransactionResponse,
  OptimizeDatabaseRequest,
  OptimizeDatabaseResponse,
  RenameDatabaseRequest,
  StartInfoClientResponse,
  UnloadDatabaseRequest,
  UnloadInfoClientResponse,
} from '@api-interfaces';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { DatabaseInfoService } from '@database/info/database-info.service';
import { DatabaseUserService } from '@database/user/database-user.service';
import {
  BaseService,
  HandleCmsErrors,
  checkCmsStatusError,
} from '@common';
import { DatabaseError } from '@error/database/database-error';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import {
  AddVolDbCmsRequest,
  CheckDatabaseCmsRequest,
  CompactDatabaseCmsRequest,
  CopyDbCmsRequest,
  GetAddVolStatusCmsRequest,
  LoadDatabaseCmsRequest,
  LockDatabaseCmsRequest,
  GetTransactionInfoCmsRequest,
  KillTransactionCmsRequest,
  OptimizeDatabaseCmsRequest,
  RenameDatabaseCmsRequest,
  UnloadDatabaseCmsRequest,
  UnloadInfoCmsRequest,
} from '@type/cms-request';
import {
  AddVolDbCmsResponse,
  CheckDatabaseCmsResponse,
  CompactDatabaseCmsResponse,
  CopyDbCmsResponse,
  GetAddVolStatusCmsResponse,
  LoadDatabaseCmsResponse,
  LockDatabaseCmsResponse,
  GetTransactionInfoCmsResponse,
  KillTransactionCmsResponse,
  OptimizeDatabaseCmsResponse,
  RenameDatabaseCmsResponse,
  UnloadDatabaseCmsResponse,
  UnloadInfoCmsResponse,
} from '@type/cms-response';

/**
 * Service for managing database management operations.
 * Handles database unloading, loading, optimization, checking, and related management tasks.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class DatabaseManagementService extends BaseService {
  constructor(
    hostService: HostService,
    cmsClient: CmsHttpsClientService,
    private readonly databaseInfoService: DatabaseInfoService,
    private readonly databaseUserService: DatabaseUserService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * CMS authorizes tasks like optimizedb/checkdb/compactdb against a
   * per-connection credential cache ("conlist") on the CMS host, populated
   * only by a prior dbmtuserlogin call — not from these tasks' own request
   * fields. Log in first so the cache is populated before running the
   * operation. Skipped when dbuser isn't provided (offline databases run
   * through a CLI path on the CMS side that doesn't need this).
   */
  private async loginIfCredentialsProvided(
    userId: string,
    hostUid: string,
    dbname: string,
    dbuser?: string,
    dbpasswd?: string
  ): Promise<void> {
    if (!dbuser) return;
    await this.databaseUserService.loginDatabase(userId, hostUid, dbname, dbuser, dbpasswd);
  }

  /**
   * Copy a database (CMS task: copydb).
   * volume is only included when advanced is "on" (or "y").
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param request Client request (srcdbname, destdbname, destdbpath, exvolpath, logpath, overwrite, move, advanced, volume?)
   * @returns Empty object on success
   */
  @HandleCmsErrors()
  async copyDb(
    userId: string,
    hostUid: string,
    request: CopyDbRequest
  ): Promise<CmsSuccessClientResponse> {
    const response = await this.copyDbCmsResponse(userId, hostUid, request);
    checkCmsStatusError(response);
    return { success: true };
  }

  async copyDbCmsResponse(
    userId: string,
    hostUid: string,
    request: CopyDbRequest
  ): Promise<CopyDbCmsResponse> {
    const cmsRequest: CopyDbCmsRequest = {
      task: 'copydb',
      srcdbname: request.srcdbname,
      destdbname: request.destdbname,
      destdbpath: request.destdbpath,
      exvolpath: request.exvolpath,
      logpath: request.logpath,
      overwrite: request.overwrite,
      move: request.move,
      advanced: request.advanced,
    };
    if (request.advanced === 'on' || request.advanced === 'y') {
      if (request.volume && request.volume.length > 0) {
        cmsRequest.volume = request.volume;
      }
    }

    return this.executeLongRunningCmsRequest<CopyDbCmsRequest, CopyDbCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  async getDatabaseStartInfo(userId: string, hostUid: string): Promise<StartInfoClientResponse> {
    return this.databaseInfoService.startInfo(userId, hostUid);
  }

  /**
   * Unload a database.
   * Returns empty object on success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing unload information
   * @returns Empty object on success
   * @throws DatabaseError If request fails or parameters are invalid
   */
  @HandleCmsErrors()
  async unloadDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: UnloadDatabaseRequest
  ): Promise<UnloadDatabaseCmsResponse['result']> {
    const response = await this.unloadDatabaseCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    return response.result;
  }

  /**
   * Full CMS response for background jobs (caller checks CMS `status`, not WM error codes).
   */
  async unloadDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: UnloadDatabaseRequest
  ): Promise<UnloadDatabaseCmsResponse> {
    let target: 'schema' | 'object' | 'both';

    if (request.isSchemaIncluded && request.isDataIncluded) {
      target = 'both';
    } else if (request.isSchemaIncluded) {
      target = 'schema';
    } else if (request.isDataIncluded) {
      target = 'object';
    } else {
      throw DatabaseError.InvalidParameter(
        'Both isSchemaIncluded and isDataIncluded cannot be false',
        {
          isSchemaIncluded: request.isSchemaIncluded,
          isDataIncluded: request.isDataIncluded,
        }
      );
    }

    const cmsRequest: UnloadDatabaseCmsRequest = {
      task: 'unloaddb',
      dbname: dbname,
      targetdir: request.targetdir,
      target: target,
      dbuser: request.dbuser,
      dbpasswd: request.dbpasswd,
      usehash: request.usehash,
      hashdir: request.hashdir,
      class: request.class,
      ref: request.ref,
      classonly: request.classonly,
      'as-dba': request['as-dba'],
      'skip-index-detail': request['skip-index-detail'],
      'split-schema-files': request['split-schema-files'],
      delimit: request.delimit,
      estimate: request.estimate,
      prefix: request.prefix,
      cach: request.cach,
      lofile: request.lofile,
    };

    return this.executeLongRunningCmsRequest<UnloadDatabaseCmsRequest, UnloadDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Get unload information for databases on a host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns UnloadInfoClientResponse Unload information without CMS envelope fields
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getUnloadInfo(
    userId: string,
    hostUid: string
  ): Promise<UnloadInfoClientResponse> {
    const request: UnloadInfoCmsRequest = {
      task: 'unloadinfo',
    };

    const response = await this.executeCmsRequest<
      UnloadInfoCmsRequest,
      UnloadInfoCmsResponse
    >(userId, hostUid, request);

    const dataOnly = this.extractDomainData(response);

    return {
      database: dataOnly.database || [],
    };
  }

  /**
   * Load a database from schema and object files.
   * Returns empty object on success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing load configuration
   * @returns LoadDatabaseResponse Empty object on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async loadDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: LoadDatabaseRequest
  ): Promise<LoadDatabaseResponse> {
    const response = await this.loadDatabaseCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    return { success: true };
  }

  /**
   * Full CMS response for background jobs (caller checks CMS `status`, not WM error codes).
   */
  async loadDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: LoadDatabaseRequest
  ): Promise<LoadDatabaseCmsResponse> {
    const cmsRequest: LoadDatabaseCmsRequest = {
      task: 'loaddb',
      dbname: dbname,
      checkoption: request.checkoption,
      period: request.period,
      user: request.user,
      _DBID: request._DBID ?? request.user,
      _DBPASSWD: request._DBPASSWD ?? '',
      estimated: request.estimated,
      oiduse: request.oiduse,
      statisticsuse: request.statisticsuse,
      nolog: request.nolog,
      schema: request.schema,
      object: request.object,
      index: request.index,
      errorcontrolfile: request.errorcontrolfile,
      ignoreclassfile: request.ignoreclassfile,
    };

    return this.executeLongRunningCmsRequest<LoadDatabaseCmsRequest, LoadDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Optimize a database.
   * Returns empty object on success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing optional class information
   * @returns OptimizeDatabaseResponse Empty object on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async optimizeDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: OptimizeDatabaseRequest
  ): Promise<OptimizeDatabaseResponse> {
    const response = await this.optimizeDatabaseCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    return { success: true };
  }

  async optimizeDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: OptimizeDatabaseRequest
  ): Promise<OptimizeDatabaseCmsResponse> {
    await this.loginIfCredentialsProvided(userId, hostUid, dbname, request.dbuser, request.dbpasswd);

    const cmsRequest: OptimizeDatabaseCmsRequest = {
      task: 'optimizedb',
      dbname: dbname,
      ...(request.classname && { classname: request.classname }),
    };

    return this.executeLongRunningCmsRequest<OptimizeDatabaseCmsRequest, OptimizeDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Check a database.
   * Returns empty object on success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing repair option
   * @returns CheckDatabaseResponse Empty object on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async checkDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: CheckDatabaseRequest
  ): Promise<CheckDatabaseResponse> {
    const response = await this.checkDatabaseCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    return { success: true };
  }

  async checkDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: CheckDatabaseRequest
  ): Promise<CheckDatabaseCmsResponse> {
    await this.loginIfCredentialsProvided(userId, hostUid, dbname, request.dbuser, request.dbpasswd);

    const cmsRequest: CheckDatabaseCmsRequest = {
      task: 'checkdb',
      dbname: dbname,
      repairdb: request.repairdb,
    };

    return this.executeLongRunningCmsRequest<CheckDatabaseCmsRequest, CheckDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Compact a database.
   * Returns log output if verbose is 'y', otherwise returns empty object.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing verbose option
   * @returns CompactDatabaseResponse Log output if verbose is 'y', otherwise empty object
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async compactDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: CompactDatabaseRequest
  ): Promise<CompactDatabaseResponse> {
    const response = await this.compactDatabaseCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    if (response.log) {
      return { success: true, log: response.log };
    }
    return { success: true };
  }

  async compactDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: CompactDatabaseRequest
  ): Promise<CompactDatabaseCmsResponse> {
    await this.loginIfCredentialsProvided(userId, hostUid, dbname, request.dbuser, request.dbpasswd);

    const cmsRequest: CompactDatabaseCmsRequest = {
      task: 'compactdb',
      dbname: dbname,
      verbose: request.verbose,
    };

    return this.executeLongRunningCmsRequest<CompactDatabaseCmsRequest, CompactDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Rename a database.
   * Returns start-info (db list) on success.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Current database name
   * @param request Client request containing rename configuration
   * @returns StartInfoClientResponse Latest database list (start-info) on success
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async renameDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    request: RenameDatabaseRequest
  ): Promise<StartInfoClientResponse> {
    const response = await this.renameDatabaseCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    return await this.getDatabaseStartInfo(userId, hostUid);
  }

  async renameDatabaseCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: RenameDatabaseRequest
  ): Promise<RenameDatabaseCmsResponse> {
    const cmsRequest: RenameDatabaseCmsRequest = {
      task: 'renamedb',
      dbname: dbname,
      rename: request.rename,
      exvolpath: request.exvolpath,
      advanced: request.advanced,
      forcedel: request.forcedel,
    };

    if (request.advanced === 'on' && request.volume && request.volume.length > 0) {
      const volumeMapping: { [oldPath: string]: string } = {};
      for (const item of request.volume) {
        volumeMapping[item.oldPath] = item.newPath;
      }
      cmsRequest.volume = [volumeMapping];
    }

    return this.executeLongRunningCmsRequest<RenameDatabaseCmsRequest, RenameDatabaseCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Get additional volume status for a database.
   * Returns domain-only data (CMS envelope fields removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @returns GetAddVolStatusResponse Volume status information
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getAddVolStatus(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<GetAddVolStatusResponse> {
    const cmsRequest: GetAddVolStatusCmsRequest = {
      task: 'getaddvolstatus',
      dbname: dbname,
    };

    const response = await this.executeCmsRequest<
      GetAddVolStatusCmsRequest,
      GetAddVolStatusCmsResponse
    >(userId, hostUid, cmsRequest);

    return {
      freespace: response.freespace,
      volpath: response.volpath,
    };
  }

  /**
   * Add a volume to a database.
   * Returns domain-only data (CMS envelope fields removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Volume information
   * @returns AddVolDbResponse Volume addition result
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async addVolDb(
    userId: string,
    hostUid: string,
    dbname: string,
    request: AddVolDbRequest
  ): Promise<AddVolDbResponse> {
    const response = await this.addVolDbCmsResponse(userId, hostUid, dbname, request);
    checkCmsStatusError(response);
    return {
      dbname: response.dbname,
      purpose: response.purpose,
    };
  }

  async addVolDbCmsResponse(
    userId: string,
    hostUid: string,
    dbname: string,
    request: AddVolDbRequest
  ): Promise<AddVolDbCmsResponse> {
    const cmsRequest: AddVolDbCmsRequest = {
      task: 'addvoldb',
      dbname: dbname,
      volname: request.volname,
      purpose: request.purpose,
      path: request.path,
      numberofpages: request.numberofpages,
      size_need_mb: request.size_need_mb,
    };

    return this.executeLongRunningCmsRequest<AddVolDbCmsRequest, AddVolDbCmsResponse>(
      userId,
      hostUid,
      cmsRequest,
      { skipStatusCheck: true }
    );
  }

  /**
   * Get lock information for a database.
   * Returns lock information including lock entries, transactions, and lock statistics.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request (empty object, no body required)
   * @returns LockDatabaseResponse Lock information
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async lockDatabase(
    userId: string,
    hostUid: string,
    dbname: string,
    _request: LockDatabaseRequest
  ): Promise<LockDatabaseResponse> {
    const cmsRequest: LockDatabaseCmsRequest = {
      task: 'lockdb',
      dbname: dbname,
    };

    this.logger.debug(`Getting lock information for database: ${dbname}`);

    const response = await this.executeCmsRequest<
      LockDatabaseCmsRequest,
      LockDatabaseCmsResponse
    >(userId, hostUid, cmsRequest);

    // Return lockinfo only (CMS envelope removed)
    return {
      lockinfo: response.lockinfo,
    };
  }

  /**
   * Get transaction information for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing dbuser and dbpasswd
   * @returns GetTransactionInfoResponse Transaction information
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async getTransactionInfo(
    userId: string,
    hostUid: string,
    dbname: string,
    request: GetTransactionInfoRequest
  ): Promise<GetTransactionInfoResponse> {
    const cmsRequest: GetTransactionInfoCmsRequest = {
      task: 'gettransactioninfo',
      dbname: dbname,
      dbuser: request.dbuser,
      dbpasswd: request.dbpasswd,
    };

    this.logger.debug(
      `Getting transaction information for database: ${dbname}, user: ${request.dbuser}`
    );

    const response = await this.executeCmsRequest<
      GetTransactionInfoCmsRequest,
      GetTransactionInfoCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }

  /**
   * Kill a transaction in a database or display active transactions.
   * Returns domain-only data (CMS envelope removed).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @param dbname Database name
   * @param request Client request containing type and optional parameter:
   *   - type 'd': Display active transaction (parameter not required)
   *   - type 'i': Kill transaction by transaction index (parameter: transaction index)
   *   - type 'p': Kill all transactions with the specified process name (parameter: process name)
   *   - type 'h': Kill all transactions from the specified host (parameter: host name)
   * @returns KillTransactionResponse Transaction information
   * @throws DatabaseError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async killTransaction(
    userId: string,
    hostUid: string,
    dbname: string,
    request: KillTransactionRequest
  ): Promise<KillTransactionResponse> {
    // Validate parameter requirement based on type
    if (request.type !== 'd' && !request.parameter) {
      const typeDescriptions: Record<string, string> = {
        i: 'transaction index',
        p: 'process name',
        h: 'host name',
      };
      throw DatabaseError.InvalidParameter(
        `Parameter is required for type '${request.type}' (${typeDescriptions[request.type] || 'unknown type'})`,
        {
          type: request.type,
          parameter: request.parameter,
          dbname: dbname,
          message: `Missing required parameter for kill transaction type '${request.type}'. Expected: ${typeDescriptions[request.type] || 'parameter'}`,
        }
      );
    }

    // Build CMS request from client request
    const cmsRequest: KillTransactionCmsRequest = {
      task: 'killtransaction',
      dbname: dbname,
      type: request.type,
      ...(request.type !== 'd' && request.parameter && { parameter: request.parameter }),
    };

    this.logger.debug(
      `Killing transaction for database: ${dbname} on host: ${hostUid} with type: ${request.type} and parameter: ${request.parameter}`
    );

    const response = await this.executeCmsRequest<
      KillTransactionCmsRequest,
      KillTransactionCmsResponse
    >(userId, hostUid, cmsRequest);

    return this.extractDomainData(response);
  }
}
