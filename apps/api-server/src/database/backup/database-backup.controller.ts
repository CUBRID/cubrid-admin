import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, Post, Put, Request } from '@nestjs/common';
import {
  AddBackupInfoClientResponse,
  DeleteBackupInfoClientResponse,
  GetBackupInfoClientResponse,
  SetBackupInfoClientResponse,
  GetAutoBackupDbErrLogRequest,
  GetAutoBackupDbErrLogResponse,
  BackupDbInfoClientResponse,
  BackupDbListClientRequest,
  BackupDbListClientResponse,
  CreateCmsJobResponse,
} from '@api-interfaces';
import { BackupScheduleDto, DeleteBackupScheduleDto, BackupDbDto, RestoreDbDto } from '@type/index';
import { CmsJobService } from '@cms-job/cms-job.service';
import { DatabaseBackupService } from './database-backup.service';
import { LogAction, SkipActionLog } from '@api-log/log-action.decorator';

/**
 * Controller for handling database backup operations.
 * Handles automated backup schedule management.
 *
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/database/backup-schedule/:dbname
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/database')
export class DatabaseBackupController {
  private readonly logger = new Logger(DatabaseBackupController.name);

  constructor(
    private readonly backupService: DatabaseBackupService,
    private readonly cmsJobService: CmsJobService
  ) {}

  /**
   * Add automated backup schedule information for a database.
   * Returns empty object on success.
   *
   * @route POST /:hostUid/database/backup-schedule/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing backup schedule information
   * @returns AddBackupInfoClientResponse Empty object on success
   * @example
   * // POST /host-uid/database/backup-schedule/demodb
   * // Body: { "backupid": "test_backup", "path": "/path/to/backup", ... }
   */
  @LogAction('database.add_backup_schedule')
  @Post('backup-schedule/:dbname')
  async addBackupSchedule(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: BackupScheduleDto
  ): Promise<AddBackupInfoClientResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Adding backup schedule for database: ${dbname} on host: ${hostUid}`
    );
    return await this.backupService.addBackupSchedule(userId, hostUid, dbname, { ...body, dbname });
  }

  /**
   * Set automated backup schedule information for a database.
   * Returns empty object on success.
   *
   * @route PUT /:hostUid/database/backup-schedule/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing backup schedule information
   * @returns SetBackupInfoClientResponse Empty object on success
   * @example
   * // PUT /host-uid/database/backup-schedule/demodb
   * // Body: { "backupid": "t2", "path": "/path/to/backup", ... }
   */
  @LogAction('database.change_backup_schedule')
  @Put('backup-schedule/:dbname')
  async setBackupSchedule(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: BackupScheduleDto
  ): Promise<SetBackupInfoClientResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Setting backup schedule for database: ${dbname} on host: ${hostUid}`
    );
    return await this.backupService.setBackupSchedule(userId, hostUid, dbname, { ...body, dbname });
  }

  /**
   * Delete automated backup schedule information for a database.
   * Returns empty object on success (CMS envelope omitted).
   *
   * @route DELETE /:hostUid/database/backup-schedule/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing backup ID to delete
   * @returns DeleteBackupInfoClientResponse empty on success
   * @example
   * // DELETE /host-uid/database/backup-schedule/demodb
   * // Body: { "backupid": "t2" }
   */
  @LogAction('database.delete_backup_schedule')
  @Delete('backup-schedule/:dbname')
  async deleteBackupSchedule(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: DeleteBackupScheduleDto
  ): Promise<DeleteBackupInfoClientResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Deleting backup schedule for database: ${dbname} on host: ${hostUid}`
    );
    return await this.backupService.deleteBackupSchedule(userId, hostUid, dbname, { ...body, dbname });
  }

  /**
   * Get automated backup schedule information for a database.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route GET /:hostUid/database/backup-schedule/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @returns GetBackupInfoClientResponse Backup schedule information
   * @example
   * // GET /host-uid/database/backup-schedule/demodb
   */
  @Get('backup-schedule/:dbname')
  async getBackupSchedule(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<GetBackupInfoClientResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting backup schedule for database: ${dbname} on host: ${hostUid}`
    );
    return await this.backupService.getBackupSchedule(userId, hostUid, dbname);
  }

  /**
   * Get backup DB physical info (dbdir, freespace, level0/1/2). CMS task: backupdbinfo.
   *
   * @route GET /:hostUid/database/backup-db-info/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @returns BackupDbInfoClientResponse dbdir, freespace, level0, level1, level2
   * @example
   * // GET /host-uid/database/backup-db-info/test
   */
  @Get('backup-db-info/:dbname')
  async getBackupDbInfo(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<BackupDbInfoClientResponse> {
    const userId = req.user.sub;
    this.logger.debug(`Getting backup db info for database: ${dbname} on host: ${hostUid}`);
    return await this.backupService.getBackupDbInfo(userId, hostUid, { dbname });
  }

  /**
   * Get backup DB list (level0/1/2 entries only).
   * CMS task: getbackuplist.
   *
   * @route GET /:hostUid/database/backup-db-list/:dbname
   */
  @Get('backup-db-list/:dbname')
  async getBackupList(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<BackupDbListClientResponse> {
    const userId = req.user.sub;
    this.logger.debug(`Getting backup db list for database: ${dbname} on host: ${hostUid}`);
    const request: BackupDbListClientRequest = { dbname };
    return await this.backupService.getBackupList(userId, hostUid, request);
  }

  /**
   * Execute database backup (level 0, 1, or 2). CMS task: backupdb.
   *
   * @route POST /:hostUid/database/backup-db/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body: level, backupdir, removelog?, check?, mt?, zip?, safereplication?
   * @returns BackupDbClientResponse empty body on success (CMS envelope omitted)
   * @example
   * // POST /host-uid/database/backup-db/demodb
   * // Body: { "level": "0", "backupdir": "/path/to/backup", "removelog": "y", "check": "y", "mt": "2", "zip": "y", "safereplication": "n" }
   */
  @LogAction('database.backup')
  @Post('backup-db/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async backupDb(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: BackupDbDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;
    this.logger.log(`Enqueue backup job: ${dbname} level: ${body.level} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'backupdb', dbname, body);
  }

  /**
   * Restore database from backup. CMS task: restoredb.
   * Long-running — enqueued as a CMS job (202 + jobId), polled via
   * GET /:hostUid/jobs/:jobId like backup/unload/load/etc.
   *
   * @route POST /:hostUid/database/restore-db/:dbname
   */
  @LogAction('database.restore')
  @Post('restore-db/:dbname')
  @HttpCode(HttpStatus.ACCEPTED)
  async restoreDb(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: RestoreDbDto
  ): Promise<CreateCmsJobResponse> {
    const userId = req.user.sub;

    this.logger.log(`Enqueue restore job: ${dbname} on host: ${hostUid}`);
    return await this.cmsJobService.createJob(userId, hostUid, 'restore', dbname, body);
  }

  /**
   * Get auto-backup database error log.
   * Returns domain-only data (CMS envelope removed).
   *
   * @route POST /:hostUid/database/auto-backup-db-err-log
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param body Request body (empty object)
   * @returns GetAutoBackupDbErrLogResponse Error log entries
   * @example
   * // POST /host-uid/database/auto-backup-db-err-log
   * // Body: {}
   */
  @SkipActionLog()
  @Post('auto-backup-db-err-log')
  async getAutoBackupDbErrLog(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: GetAutoBackupDbErrLogRequest
  ): Promise<GetAutoBackupDbErrLogResponse> {
    const userId = req.user.sub;

    this.logger.debug(
      `Getting auto-backup database error log on host: ${hostUid}`
    );
    return await this.backupService.getAutoBackupDbErrLog(userId, hostUid, body);
  }
}
