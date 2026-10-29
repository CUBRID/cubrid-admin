import { Body, Controller, Get, Logger, Param, Post, Request } from '@nestjs/common';
import { LogService } from './log.service';
import {
  GetBrokerLogListClientResponse,
  GetDatabaseLogListClientResponse,
  LoadAccessLogClientResponse,
  ViewLogClientResponse,
  GetAdminLogInfoClientResponse,
} from '@api-interfaces';
import { LogSnapshotDto, ViewLogDto } from '@type/index';

/**
 * Controller for handling log-related operations.
 *
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/log/{action}/{identifier}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/log')
export class LogController {
  private readonly logger = new Logger(LogController.name);

  constructor(private readonly logService: LogService) {}

  /**
   * Get list of broker log files.
   *
   * @route GET /:hostUid/log/broker/:bname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param bname Broker name from path parameter
   * @returns GetBrokerLogListClientResponse Broker log file list
   * @example
   * // GET /host-uid-1/log/broker/query_editor
   */
  @Get('broker/:bname')
  async getBrokerLogList(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('bname') bname: string
  ): Promise<GetBrokerLogListClientResponse> {
    const userId = req.user.sub;
    Logger.log(`Getting broker log list: ${bname} on host: ${hostUid}`, 'LogController');
    return await this.logService.getBrokerLogList(userId, hostUid, bname);
  }

  /**
   * Get list of database log files.
   *
   * @route GET /:hostUid/log/database/:dname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dname Database name from path parameter
   * @returns GetDatabaseLogListClientResponse Database log file list
   * @example
   * // GET /host-uid-1/log/database/demodb
   */
  @Get('database/:dbname')
  async getDatabaseLogList(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<GetDatabaseLogListClientResponse> {
    const userId = req.user.sub;
    Logger.log(`Getting database log list: ${dbname} on host: ${hostUid}`, 'LogController');
    return await this.logService.getDatabaseLogList(userId, hostUid, dbname);
  }

  /**
   * Get CMS access log and error log.
   *
   * @route GET /:hostUid/log/cms
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @returns LoadAccessLogClientResponse CMS access log and error log
   * @example
   * // GET /host-uid-1/log/cms
   */
  @Get('cms')
  async getCMSLogList(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<LoadAccessLogClientResponse> {
    const userId = req.user.sub;
    Logger.log(`Getting CMS log list for host: ${hostUid}`, 'LogController');
    return await this.logService.getCMSLogList(userId, hostUid);
  }

  /**
   * Get admin log information.
   *
   * @route GET /:hostUid/log/admin
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @returns GetAdminLogInfoClientResponse Admin log information without CMS envelope fields
   * @example
   * // GET /host-uid-1/log/admin
   */
  @Get('admin')
  async getAdminLogInfo(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<GetAdminLogInfoClientResponse> {
    const userId = req.user.sub;
    Logger.log(`Getting admin log info for host: ${hostUid}`, 'LogController');
    return await this.logService.getAdminLogInfo(userId, hostUid);
  }

  /** Capture a complete, size-limited input for Top SQL in one CMS read. */
  @Post('snapshot')
  async captureLogSnapshot(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: LogSnapshotDto
  ): Promise<ViewLogClientResponse> {
    return this.logService.captureLogSnapshot(req.user.sub, hostUid, body.path);
  }

  /**
   * View log file content.
   * Returns log lines within the specified range.
   *
   * @route POST /:hostUid/log/view
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param body Request body containing path, start, end
   * @returns ViewLogClientResponse Log file content without CMS envelope fields
   * @example
   * // POST /host-uid-1/log/view
   * // Body: { "path": "/path/to/log.err", "start": "1", "end": "100" }
   */
  @Post('view')
  async viewLog(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: ViewLogDto
  ): Promise<ViewLogClientResponse> {
    const userId = req.user.sub;

    Logger.log(
      `Viewing log file: ${body.path} (${body.start}-${body.end}) on host: ${hostUid}`,
      'LogController'
    );
    return await this.logService.viewLog(userId, hostUid, body.path, body.start, body.end);
  }
}
