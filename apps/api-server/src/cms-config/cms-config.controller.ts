import { Body, Controller, Get, Logger, Param, Post, Request } from '@nestjs/common';
import { CmsConfigService } from './cms-config.service';
import { BrokerSetParamDto } from '@type/index';
import {
  GetAddBrokerInfoClientResponse,
  GetEnvClientResponse,
  GetAllSysParamClientResponse,
  ParamdumpClientResponse,
  PlandumpClientResponse,
  SetSysParamClientResponse,
  StatdumpClientResponse,
  StatdumpWatcherClientResponse,
} from '@api-interfaces';

/**
 * Controller for handling CMS environment configuration operations.
 *
 * Provides REST API endpoints for retrieving environment information
 * from CMS hosts including CUBRID version, broker version, database paths, and system information.
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/cms-config/{action}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/cms-config')
export class CmsConfigController {
  private readonly logger = new Logger(CmsConfigController.name);

  constructor(private readonly cmsConfigService: CmsConfigService) {}

  /**
   * Get environment information from a CMS host.
   * Returns environment variables and system information without CMS envelope fields.
   *
   * @route GET /:hostUid/cms-config/env
   * @param req - Express request (contains authenticated user)
   * @param hostUid - Host unique identifier from path parameter
   * @returns GetEnvClientResponse Environment information without CMS envelope fields
   * @example
   * // POST /host-uid/cms-config/env
   */
  /**
   * Get broker config file content from a CMS host (CMS task: getaddbrokerinfo).
   * Returns conflist (config lines), confname, note, execTime.
   *
   * @route GET /:hostUid/cms-config/broker-config/:confname
   * @example
   * // GET /host-uid/cms-config/broker-config/brokerconf
   */
  @Get('broker-config/:confname')
  async getAddBrokerInfo(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('confname') confname: string
  ): Promise<GetAddBrokerInfoClientResponse> {
    const userId = req.user.sub;
    this.logger.log(
      `Getting broker config for confname: ${confname} on host: ${hostUid}`,
      'CmsConfigController'
    );
    return await this.cmsConfigService.getAddBrokerInfo(userId, hostUid, confname);
  }

  @Get('env')
  async getEnv(@Request() req, @Param('hostUid') hostUid: string): Promise<GetEnvClientResponse> {
    const userId = req.user.sub;

    Logger.log(`Getting environment info for host: ${hostUid}`, 'CmsConfigController');
    const response = await this.cmsConfigService.getEnv(userId, hostUid);
    return response;
  }

  /**
   * Get database parameters dump from a CMS host.
   * Returns database server parameters without CMS envelope fields.
   *
   * @route GET /:hostUid/cms-config/param-dump
   * @param req - Express request (contains authenticated user)
   * @param hostUid - Host unique identifier from path parameter
   * @param dbname - Database name from query parameter
   * @returns ParamdumpClientResponse Database parameters without CMS envelope fields
   * @example
   * // GET /host-uid/cms-config/param-dump?dbname=demodb
   */
  @Get('param-dump/:dbname')
  async paramdump(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<ParamdumpClientResponse> {
    const userId = req.user.sub;

    Logger.log(
      `Getting paramdump info for host: ${hostUid}, dbname: ${dbname}`,
      'CmsConfigController'
    );
    const response = await this.cmsConfigService.getParamDump(userId, hostUid, dbname);
    return response;
  }

  /**
   * Get database statistics dump from a CMS host.
   * Returns database statistics without CMS envelope fields.
   *
   * @route GET /:hostUid/cms-config/stat-dump/:dbname
   * @param req - Express request (contains authenticated user)
   * @param hostUid - Host unique identifier from path parameter
   * @param dbname - Database name from path parameter
   * @returns StatdumpClientResponse Database statistics without CMS envelope fields
   * @example
   * // GET /host-uid/cms-config/stat-dump/demodb
   */
  @Get('stat-dump/:dbname')
  async statdump(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<StatdumpClientResponse> {
    const userId = req.user.sub;

    Logger.log(
      `Getting statdump info for host: ${hostUid}, dbname: ${dbname}`,
      'CmsConfigController'
    );
    const response = await this.cmsConfigService.getStatDump(userId, hostUid, dbname);
    return response;
  }

  /**
   * Start (or confirm) the statdump watcher for a database (CMS `start_statdump`).
   * statdump counters only advance while a watcher is attached.
   *
   * @route POST /:hostUid/cms-config/stat-dump/:dbname/watcher/start
   */
  @Post('stat-dump/:dbname/watcher/start')
  async startStatDumpWatcher(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<StatdumpWatcherClientResponse> {
    const userId = req.user.sub;
    return await this.cmsConfigService.startStatDumpWatcher(userId, hostUid, dbname);
  }

  /**
   * Stop the statdump watcher for a database (CMS `stop_statdump`).
   *
   * @route POST /:hostUid/cms-config/stat-dump/:dbname/watcher/stop
   */
  @Post('stat-dump/:dbname/watcher/stop')
  async stopStatDumpWatcher(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<StatdumpWatcherClientResponse> {
    const userId = req.user.sub;
    return await this.cmsConfigService.stopStatDumpWatcher(userId, hostUid, dbname);
  }

  /**
   * Plan / XASL dump (`plandump`) from a CMS host.
   * Response includes flattened `lines` and `text` (CMS returns nested `log[].line[]`).
   *
   * @route GET /:hostUid/cms-config/plan-dump/:dbname
   */
  @Get('plan-dump/:dbname')
  async planDump(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<PlandumpClientResponse> {
    const userId = req.user.sub;

    Logger.log(
      `Getting plandump for host: ${hostUid}, dbname: ${dbname}`,
      'CmsConfigController'
    );
    return await this.cmsConfigService.getPlanDump(userId, hostUid, dbname);
  }

  /**
   * Get all system parameters from a configuration file on a CMS host.
   * Returns configuration file content without CMS envelope fields.
   *
   * @route GET /:hostUid/cms-config/all-sys-param
   * @param req - Express request (contains authenticated user)
   * @param hostUid - Host unique identifier from path parameter
   * @param confname - Configuration file name from query parameter (e.g., "cubridconf")
   * @returns GetAllSysParamClientResponse System parameters without CMS envelope fields
   * @example
   * // GET /host-uid/cms-config/all-sys-param?confname=cubridconf
   */
  @Get('all-sys-param')
  async getAllSystemParam(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<GetAllSysParamClientResponse> {
    const userId = req.user.sub;
    const confname = req.query.confname as string;

    Logger.log(
      `Getting all system parameters for host: ${hostUid}, confname: ${confname}`,
      'CmsConfigController'
    );
    const response = await this.cmsConfigService.getAllSystemParam(userId, hostUid, confname);
    return response;
  }

  /**
   * Set system parameters in a configuration file on a CMS host.
   * Updates configuration file with provided data.
   *
   * @route POST /:hostUid/cms-config/set-sys-param
   * @param req - Express request (contains authenticated user)
   * @param hostUid - Host unique identifier from path parameter
   * @param body - Request body containing confname and confdata
   * @returns SetSysParamClientResponse Empty object on success (CMS envelope fields removed)
   * @example
   * // POST /host-uid/cms-config/set-sys-param
   * // Body: { "confname": "cubridconf", "confdata": ["# comment", "[section]", "key=value"] }
   */
  @Post('set-sys-param')
  async setSystemParam(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: { confname: string; confdata: string[] }
  ): Promise<SetSysParamClientResponse> {
    const userId = req.user.sub;

    Logger.log(
      `Setting system parameters for host: ${hostUid}, confname: ${body.confname}`,
      'CmsConfigController'
    );
    const response = await this.cmsConfigService.setSystemParamFromRawEdit(
      userId,
      hostUid,
      body.confname,
      body.confdata
    );
    return response;
  }

  /**
   * Set broker configuration file content on a CMS host (CMS task: broker_setparam).
   *
   * @route POST /:hostUid/cms-config/broker-set-param
   * @example
   * // POST /host-uid/cms-config/broker-set-param
   * // Body: { "confdata": ["[broker]", "SERVICE=ON", ...] }
   */
  @Post('broker-set-param')
  async setBrokerParam(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: BrokerSetParamDto
  ): Promise<SetSysParamClientResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Setting broker param for host: ${hostUid}`,
      'CmsConfigController'
    );
    return await this.cmsConfigService.setBrokerParamFromRawEdit(userId, hostUid, body.confdata);
  }

}
