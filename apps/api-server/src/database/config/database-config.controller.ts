import { Body, Controller, Get, Logger, Param, Post, Query, Request } from '@nestjs/common';
import {
  SetAutoExecQueryClientResponse,
  GetAutoExecQueryClientResponse,
  SetAutoStartResponse,
  RemoveAutoStartResponse,
  GetAutoAddVolClientResponse,
  GetDbSizeClientResponse,
  SetAutoAddVolResponse,
  ClassInfoResponse,
  GetAutoExecQueryErrLogRequest,
  GetAutoExecQueryErrLogResponse,
  GetAutoAddVolLogResponse,
} from '@api-interfaces';
import {
  SetAutoExecQueryDto,
  SetAutoStartDto,
  RemoveAutoStartDto,
  SetAutoAddVolDto,
  ClassInfoDto,
  AppendAutoExecQueryPlanDto,
  RemoveAutoExecQueryPlanDto,
  UpdateAutoExecQueryPlanDto,
} from '@type/index';
import { DatabaseConfigService } from './database-config.service';
import { LogAction, SkipActionLog } from '@api-log/log-action.decorator';

/**
 * Controller for handling database configuration operations.
 * Handles auto-execution query, auto-start, and auto-add volume configuration.
 *
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/database/{action}/{identifier}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/database')
export class DatabaseConfigController {
  private readonly logger = new Logger(DatabaseConfigController.name);

  constructor(private readonly configService: DatabaseConfigService) {}

  /**
   * Set auto-execution query for a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/auto-exec-query/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing auto-execution query plan
   * @returns SetAutoExecQueryClientResponse Empty object on success
   * @example
   * // POST /host-uid/database/auto-exec-query/demodb
   * // Body: { "planlist": [{ "queryplan": [...] }] }
   */
  @LogAction('database.set_auto_query')
  @Post('auto-exec-query/:dbname')
  async setAutoExecQuery(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: SetAutoExecQueryDto
  ): Promise<SetAutoExecQueryClientResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Setting auto-exec query for database: ${dbname} on host: ${hostUid}`
    );
    return await this.configService.setAutoExecQuery(userId, hostUid, dbname, { ...body, dbname });
  }

  /**
   * Get auto-execution query for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route GET /:hostUid/database/auto-exec-query/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @returns GetAutoExecQueryClientResponse Auto-execution query information
   * @example
   * // GET /host-uid/database/auto-exec-query/demodb
   */
  @Get('auto-exec-query/:dbname')
  async getAutoExecQuery(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<GetAutoExecQueryClientResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting auto-exec query for database: ${dbname} on host: ${hostUid}`
    );
    return await this.configService.getAutoExecQuery(userId, hostUid, dbname);
  }

  /**
   * Enable auto-start for a database.
   * Adds database name to the server parameter in configuration file.
   *
   * @route POST /:hostUid/database/auto-start
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param body Request body containing confname and dbname
   * @returns SetAutoStartResponse Empty object on success
   * @example
   * // POST /host-uid/database/auto-start
   * // Body: { "confname": "cubridconf", "dbname": "testdb" }
   */
  @LogAction('database.set_auto_start')
  @Post('auto-start/set')
  async setAutoStart(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: SetAutoStartDto
  ): Promise<SetAutoStartResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Enabling auto-start for database: ${body.dbname} on host: ${hostUid}`
    );
    return await this.configService.setAutoStart(userId, hostUid, body);
  }

  /**
   * Disable auto-start for a database.
   * Removes database name from the server parameter in configuration file.
   * Uses POST so request bodies are reliably delivered (Electron fetch, proxies).
   *
   * @route POST /:hostUid/database/auto-start/remove
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param body Request body containing confname and dbname
   * @returns RemoveAutoStartResponse Empty object on success
   * @example
   * // POST /host-uid/database/auto-start/remove
   * // Body: { "confname": "cubridconf", "dbname": "testdb" }
   */
  @LogAction('database.remove_auto_start')
  @Post('auto-start/remove')
  async removeAutoStart(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: RemoveAutoStartDto
  ): Promise<RemoveAutoStartResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Disabling auto-start for database: ${body.dbname} on host: ${hostUid}`
    );
    return await this.configService.removeAutoStart(userId, hostUid, body);
  }

  /**
   * Get database size. CMS task: getdbsize.
   * @route GET /:hostUid/database/db-size/:dbname
   */
  @Get('db-size/:dbname')
  async getDbSize(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<GetDbSizeClientResponse> {
    const userId = req.user.sub;
    this.logger.debug(`Getting db size for database: ${dbname} on host: ${hostUid}`);
    return await this.configService.getDbSize(userId, hostUid, dbname);
  }

  /**
   * Get auto-add volume configuration for a database (CMS task: getautoaddvol).
   *
   * @route GET /:hostUid/database/auto-add-vol/:dbname
   * @example
   * // GET /host-uid/database/auto-add-vol/test
   */
  @Get('auto-add-vol/:dbname')
  async getAutoAddVol(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<GetAutoAddVolClientResponse> {
    const userId = req.user.sub;
    this.logger.debug(
      `Getting auto-add volume for database: ${dbname} on host: ${hostUid}`
    );
    return await this.configService.getAutoAddVol(userId, hostUid, dbname);
  }

  /**
   * Set auto-add volume configuration for a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/auto-add-vol/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing auto-add volume configuration
   * @returns SetAutoAddVolResponse Empty object on success
   * @example
   * // POST /host-uid/database/auto-add-vol/testdb
   * // Body: { "data": "ON", "data_warn_outofspace": "0.15", "data_ext_page": "32768", "index": "ON", "index_warn_outofspace": "0.15", "index_ext_page": "32768" }
   */
  @LogAction('database.set_auto_add_volume')
  @Post('auto-add-vol/:dbname')
  async setAutoAddVol(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: SetAutoAddVolDto
  ): Promise<SetAutoAddVolResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Setting auto-add volume for database: ${dbname} on host: ${hostUid}`
    );
    return await this.configService.setAutoAddVol(userId, hostUid, dbname, body);
  }

  /**
   * Get class information for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/class-info/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing dbstatus
   * @returns ClassInfoResponse Class information (system classes and user classes)
   * @example
   * // POST /host-uid/database/class-info/empty
   * // Body: { "dbstatus": "off" }
   */
  @SkipActionLog()
  @Post('class-info/:dbname')
  async getClassInfo(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: ClassInfoDto
  ): Promise<ClassInfoResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting class info for database: ${dbname} on host: ${hostUid}`
    );
    return await this.configService.getClassInfo(userId, hostUid, dbname, body);
  }

  /**
   * Append a single query plan to a database's auto-exec plan list.
   *
   * @route POST /:hostUid/database/auto-exec-query/:dbname/append
   */
  @LogAction('database.add_auto_query')
  @Post('auto-exec-query/:dbname/append')
  async appendAutoExecQueryPlan(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: AppendAutoExecQueryPlanDto
  ): Promise<SetAutoExecQueryClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Appending query plan to database: ${dbname} on host: ${hostUid}`);
    return await this.configService.appendAutoExecQueryPlan(userId, hostUid, { dbname, ...body });
  }

  /**
   * Replace a single existing query plan (by query_id) in a database's
   * auto-exec plan list, preserving every other entry's stored credentials.
   *
   * @route POST /:hostUid/database/auto-exec-query/:dbname/update
   */
  @LogAction('database.change_auto_query')
  @Post('auto-exec-query/:dbname/update')
  async updateAutoExecQueryPlan(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: UpdateAutoExecQueryPlanDto
  ): Promise<SetAutoExecQueryClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Updating query plan ${body.plan.query_id} on database: ${dbname} on host: ${hostUid}`);
    return await this.configService.updateAutoExecQueryPlan(userId, hostUid, { dbname, ...body });
  }

  /**
   * Remove a single query plan from a database's auto-exec plan list by query_id.
   *
   * @route POST /:hostUid/database/auto-exec-query/:dbname/remove
   */
  @LogAction('database.remove_auto_query')
  @Post('auto-exec-query/:dbname/remove')
  async removeAutoExecQueryPlan(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: RemoveAutoExecQueryPlanDto
  ): Promise<SetAutoExecQueryClientResponse> {
    const userId = req.user.sub;
    this.logger.log(
      `Removing query plan ${body.query_id} from database: ${dbname} on host: ${hostUid}`
    );
    return await this.configService.removeAutoExecQueryPlan(userId, hostUid, { dbname, ...body });
  }

  /**
   * Get auto-execution query error log.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/auto-exec-query-err-log
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param body Request body (empty object)
   * @returns GetAutoExecQueryErrLogResponse Error log entries
   * @example
   * // POST /host-uid/database/auto-exec-query-err-log
   * // Body: {}
   */
  @SkipActionLog()
  @Post('auto-exec-query-err-log')
  async getAutoExecQueryErrLog(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: GetAutoExecQueryErrLogRequest
  ): Promise<GetAutoExecQueryErrLogResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting auto-exec query error log on host: ${hostUid}`
    );
    return await this.configService.getAutoExecQueryErrLog(userId, hostUid, body);
  }

  /**
   * Get auto-add volume log entries. CMS task: getautoaddvollog.
   *
   * @route GET /:hostUid/database/auto-add-vol-log?start_time=...&end_time=...
   */
  @Get('auto-add-vol-log')
  async getAutoAddVolLog(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Query('start_time') startTime?: string,
    @Query('end_time') endTime?: string
  ): Promise<GetAutoAddVolLogResponse> {
    const userId = req.user.sub;

    this.logger.debug(`Getting auto-add volume log on host: ${hostUid}`);
    return await this.configService.getAutoAddVolLog(userId, hostUid, {
      start_time: startTime,
      end_time: endTime,
    });
  }
}
