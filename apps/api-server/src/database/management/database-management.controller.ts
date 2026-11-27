import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import {
  AddVolDbResponse,
  CheckDatabaseResponse,
  CompactDatabaseResponse,
  CmsSuccessClientResponse,
  GetAddVolStatusResponse,
  CreateCmsJobResponse,
  LockDatabaseRequest,
  LockDatabaseResponse,
  GetTransactionInfoResponse,
  KillTransactionResponse,
  OptimizeDatabaseResponse,
  StartInfoClientResponse,
  UnloadInfoClientResponse,
} from '@api-interfaces';
import {
  CopyDbDto,
  UnloadDatabaseDto,
  LoadDatabaseDto,
  OptimizeDatabaseDto,
  CheckDatabaseDto,
  CompactDatabaseDto,
  RenameDatabaseDto,
  AddVolDbDto,
  GetTransactionInfoDto,
  KillTransactionDto,
} from '@type/index';
import { CmsJobService } from '@cms-job/cms-job.service';
import { DatabaseManagementService } from './database-management.service';
import { LogAction, SkipActionLog } from '@api-log/log-action.decorator';

/**
 * Controller for handling database management operations.
 * Handles database unloading, loading, optimization, checking, and related management tasks.
 *
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/database/{action}/:dbname
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/database')
export class DatabaseManagementController {
  private readonly logger = new Logger(DatabaseManagementController.name);

  constructor(
    private readonly managementService: DatabaseManagementService,
    private readonly cmsJobService: CmsJobService
  ) {}

  /**
   * Copy a database. CMS task: copydb.
   * volume is only sent when advanced is "on".
   *
   * @route POST /:hostUid/database/copy
   */
  @LogAction('database.copy')
  @Post('copy')
  @HttpCode(HttpStatus.ACCEPTED)
  async copyDb(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: CopyDbDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;
    this.logger.log(
      `Enqueue copy job: ${body.srcdbname} -> ${body.destdbname} on host: ${hostUid}`
    );
    return await this.cmsJobService.createJob(userId, hostUid, 'copy', body.destdbname, body);
  }

  /**
   * Unload a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/unload/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing unload configuration
   * @returns Empty object on success
   * @example
   * // POST /host-uid/database/unload/demodb
   * // Body: { "targetdir": "/path/to/backup", "isSchemaIncluded": true, "isDataIncluded": true, "dbuser": "user", "dbpasswd": "pass" }
   */
  @LogAction('database.unload')
  @Post('unload/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async unloadDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: UnloadDatabaseDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue unload job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createUnloadJob(userId, hostUid, dbname, body);
  }

  /**
   * Get unload information for databases on a host.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route GET /:hostUid/database/unload-info
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @returns UnloadInfoClientResponse Unload information without CMS envelope fields
   * @example
   * // GET /host-uid/database/unload-info
   */
  @Get('unload-info')
  async getUnloadInfo(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<UnloadInfoClientResponse> {
    const userId = req.user.sub;

    this.logger.debug(`Getting unload info for host: ${hostUid}`);
    return await this.managementService.getUnloadInfo(userId, hostUid);
  }

  /**
   * Load a database from schema and object files.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/load/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing load configuration
   * @returns LoadDatabaseResponse Load process log lines
   * @example
   * // POST /host-uid/database/load/empty
   * // Body: { "checkoption": "both", "period": "none", "user": "dba", "estimated": "none", "oiduse": "yes", "statisticsuse": "yes", "nolog": "no", "schema": "/path/to/schema", "object": "/path/to/object", "index": "none", "errorcontrolfile": "none", "ignoreclassfile": "none" }
   */
  @LogAction('database.load')
  @Post('load/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async loadDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: LoadDatabaseDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue load job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createLoadJob(userId, hostUid, dbname, body);
  }

  /**
   * Optimize a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/optimize/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing optional class information
   * @returns OptimizeDatabaseResponse Empty object on success
   * @example
   * // POST /host-uid/database/optimize/empty
   * // Body: { "class": [{ "classname": "dba.test4" }] } (optional - if not provided, optimizes entire database)
   */
  @LogAction('database.optimize')
  @Post('optimize/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async optimizeDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: OptimizeDatabaseDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue optimize job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'optimize', dbname, body);
  }

  /**
   * Check a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/check/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing repair option
   * @returns CheckDatabaseResponse Empty object on success
   * @example
   * // POST /host-uid/database/check/test
   * // Body: { "repairdb": "n" } (n = check only, y = check and repair)
   */
  @LogAction('database.check')
  @Post('check/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async checkDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: CheckDatabaseDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue check job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'check', dbname, body);
  }

  /**
   * Compact a database.
   * Returns log output if verbose is 'y', otherwise returns empty object.
   *
   * @route POST /:hostUid/database/compact/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing verbose option
   * @returns CompactDatabaseResponse Log output if verbose is 'y', otherwise empty object
   * @example
   * // POST /host-uid/database/compact/test
   * // Body: { "verbose": "y" } (y = include log output, n = exclude log output)
   */
  @LogAction('database.compact')
  @Post('compact/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async compactDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: CompactDatabaseDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue compact job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'compact', dbname, body);
  }

  /**
   * Rename a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/rename/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Current database name from path parameter
   * @param body Request body containing rename configuration
   * @returns StartInfoClientResponse Latest database list (start-info) on success
   * @example
   * // POST /host-uid/database/rename/rename_test
   * // Body: { "rename": "renamed_db", "exvolpath": "none", "advanced": "on", "volume": [{ "/old/path": "/new/path" }], "forcedel": "n" }
   */
  @LogAction('database.rename')
  @Post('rename/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async renameDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: RenameDatabaseDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue rename job: ${dbname} to ${body.rename} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'rename', dbname, body);
  }

  /**
   * Get additional volume status for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route GET /:hostUid/database/add-vol-status/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @returns GetAddVolStatusResponse Volume status information
   * @example
   * // GET /host-uid/database/add-vol-status/test
   */
  @Get('add-vol-status/:dbname')
  async getAddVolStatus(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<GetAddVolStatusResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting add vol status for database: ${dbname} on host: ${hostUid}`
    );
    return await this.managementService.getAddVolStatus(userId, hostUid, dbname);
  }

  /**
   * Add a volume to a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/add-vol/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing volume information
   * @returns AddVolDbResponse Volume addition result
   * @example
   * // POST /host-uid/database/add-vol/test
   * // Body: { "volname": "", "purpose": "generic", "path": "/path/to/vol", "numberofpages": "32768", "size_need_mb": "512.000(MB)" }
   */
  @LogAction('database.add_volume')
  @Post('add-vol/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async addVolDb(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: AddVolDbDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue add-vol job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'addvol', dbname, body);
  }

  /**
   * Get lock information for a database.
   * Returns lock information including lock entries, transactions, and lock statistics.
   *
   * @route POST /:hostUid/database/lock/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body (empty object, no fields required)
   * @returns LockDatabaseResponse Lock information
   * @example
   * // POST /host-uid/database/lock/demodb
   * // Body: {}
   */
  @SkipActionLog()
  @Post('lock/:dbname')
  async lockDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: LockDatabaseRequest
  ): Promise<LockDatabaseResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting lock information for database: ${dbname} on host: ${hostUid}`
    );
    return await this.managementService.lockDatabase(userId, hostUid, dbname, body);
  }

  /**
   * Get transaction information for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/transaction-info/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing dbuser and dbpasswd
   * @returns GetTransactionInfoResponse Transaction information
   * @example
   * // POST /host-uid/database/transaction-info/demodb
   * // Body: { "dbuser": "dba", "dbpasswd": "" }
   */
  @SkipActionLog()
  @Post('transaction-info/:dbname')
  async getTransactionInfo(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: GetTransactionInfoDto
  ): Promise<GetTransactionInfoResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting transaction information for database: ${dbname} on host: ${hostUid}`
    );
    return await this.managementService.getTransactionInfo(userId, hostUid, dbname, body);
  }

  /**
   * Kill a transaction in a database or display active transactions.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/kill-transaction/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing type and optional parameter:
   *   - type 'd': Display active transaction (parameter not required)
   *   - type 'i': Kill transaction by transaction index (parameter: transaction index)
   *   - type 'p': Kill all transactions with the specified process name (parameter: process name)
   *   - type 'h': Kill all transactions from the specified host (parameter: host name)
   * @returns KillTransactionResponse Transaction information
   * @example
   * // POST /host-uid/database/kill-transaction/demodb
   * // Body: { "type": "d" } or { "type": "i", "parameter": "1" }
   */
  @LogAction('database.kill_transaction')
  @Post('kill-transaction/:dbname')
  async killTransaction(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: KillTransactionDto
  ): Promise<KillTransactionResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Killing transaction for database: ${dbname} on host: ${hostUid}`
    );
    return await this.managementService.killTransaction(userId, hostUid, dbname, body);
  }
}
