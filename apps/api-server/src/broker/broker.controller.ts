import { Body, Controller, Get, HttpCode, Logger, Param, Post, Put, Request } from '@nestjs/common';
import {
  AddDbmtUserClientResponse,
  BrokerListClientResponse,
  BrokerStartStopClientResponse,
  GetBrokerStatusBulkClientResponse,
  GetBrokerStatusClientResponse,
  StartAllBrokersClientResponse,
  StopAllBrokersClientResponse,
  UpdateDbmtUserClientResponse,
} from '@api-interfaces';
import { AddDbmtUserDto, GetBrokerStatusBulkDto, UpdateDbmtUserDto } from '@type/index';
import { BrokerService } from './broker.service';

/**
 * Controller for handling broker-related operations.
 * Provides REST API endpoints for broker management operations including:
 * - Get broker list for a specific host
 * - Stop a broker
 * - Start a broker
 * - Restart a broker
 * - Get broker status
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/broker/{action}/{identifier}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/broker')
export class BrokerController {
  private readonly logger = new Logger(BrokerController.name);

  constructor(private readonly brokerService: BrokerService) {}

  /**
   * Start all brokers on a host (CMS task: startbroker).
   *
   * @route POST /:hostUid/broker/start-all
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @returns StartAllBrokersClientResponse { success: true } on success
   * @example
   * // POST /host-uid/broker/start-all
   */
  @Post('start-all')
  async startAllBrokers(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<StartAllBrokersClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Starting all brokers on host: ${hostUid}`);
    return await this.brokerService.startAllBrokers(userId, hostUid);
  }

  /**
   * Stop all brokers on a host (CMS task: stopbroker).
   *
   * @route POST /:hostUid/broker/stop-all
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @returns StopAllBrokersClientResponse { success: true } on success
   * @example
   * // POST /host-uid/broker/stop-all
   */
  @Post('stop-all')
  async stopAllBrokers(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<StopAllBrokersClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Stopping all brokers on host: ${hostUid}`);
    return await this.brokerService.stopAllBrokers(userId, hostUid);
  }

  /**
   * Add a DBMT (CMS) user on the host (CMS task: adddbmtuser).
   *
   * @route POST /:hostUid/broker/dbmt-user
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param body - targetid, password, casauth, dbcreate, statusmonitorauth
   * @returns AddDbmtUserClientResponse dblist and userlist
   * @example
   * // POST /host-uid/broker/dbmt-user
   * // Body: { "targetid": "test_user_2", "password": "1234", "casauth": "none", "dbcreate": "none", "statusmonitorauth": "none" }
   */
  @Post('dbmt-user')
  async addDbmtUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: AddDbmtUserDto
  ): Promise<AddDbmtUserClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Adding DBMT user: ${body.targetid} on host: ${hostUid}`);
    return await this.brokerService.addDbmtUser(userId, hostUid, body);
  }

  /**
   * Update a DBMT (CMS) user on the host (CMS task: updatedbmtuser).
   *
   * @route PUT /:hostUid/broker/dbmt-user
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param body - targetid, casauth, dbcreate, statusmonitorauth (dbauth optional)
   * @returns UpdateDbmtUserClientResponse dblist and userlist
   * @example
   * // PUT /host-uid/broker/dbmt-user
   * // Body: { "targetid": "test_user_2", "casauth": "none", "dbcreate": "none", "statusmonitorauth": "none" }
   * // or with dbauth: { "targetid": "test_user_2", "dbauth": [], "casauth": "none", "dbcreate": "none", "statusmonitorauth": "none" }
   */
  @Put('dbmt-user')
  async updateDbmtUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: UpdateDbmtUserDto
  ): Promise<UpdateDbmtUserClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Updating DBMT user: ${body.targetid} on host: ${hostUid}`);
    return await this.brokerService.updateDbmtUser(userId, hostUid, body);
  }

  /**
   * Get list of brokers for a specific host.
   *
   * @route GET /:hostUid/broker/list
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @returns List of brokers
   * @example
   * // GET /host-uid/broker/list
   */
  @Get('list')
  async getBrokers(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<BrokerListClientResponse> {
    const userId = req.user.sub;

    const response = await this.brokerService.getBrokers(userId, hostUid);
    return response;
  }

  /**
   * Stop a broker.
   *
   * @route POST /:hostUid/broker/stop/:bname
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param bname - Broker name from path parameter
   * @returns Response indicating success or failure
   * @example
   * // POST /host-uid/broker/stop/query_editor
   */
  @Post('stop/:bname')
  async stopBroker(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('bname') bname: string
  ): Promise<BrokerStartStopClientResponse> {
    const userId = req.user.sub;

    this.logger.log(`Stopping broker: ${bname} on host: ${hostUid}`);
    return await this.brokerService.stopBroker(userId, hostUid, bname);
  }

  /**
   * Start a broker.
   *
   * @route POST /:hostUid/broker/start/:bname
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param bname - Broker name from path parameter
   * @returns Response indicating success or failure
   * @example
   * // POST /host-uid/broker/start/query_editor
   */
  @Post('start/:bname')
  async startBroker(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('bname') bname: string
  ): Promise<BrokerStartStopClientResponse> {
    const userId = req.user.sub;

    this.logger.log(`Starting broker: ${bname} on host: ${hostUid}`);
    return await this.brokerService.startBroker(userId, hostUid, bname);
  }

  /**
   * Restart a broker.
   *
   * @route POST /:hostUid/broker/restart/:bname
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param bname - Broker name from path parameter
   * @returns Boolean indicating success
   * @example
   * // POST /host-uid/broker/restart/query_editor
   */
  @Post('restart/:bname')
  async restartBroker(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('bname') bname: string
  ): Promise<boolean> {
    const userId = req.user.sub;

    this.logger.log(`Restarting broker: ${bname} on host: ${hostUid}`);
    const response: boolean = await this.brokerService.restartBroker(userId, hostUid, bname);
    return response;
  }

  /**
   * Get the status of several brokers in one request (CMS task:
   * getbrokerstatus with a comma-separated bname, chunked server-side).
   * POST so hundreds of names fit in the body instead of the URL.
   *
   * @route POST /:hostUid/broker/status/bulk
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param body - bnames: broker names to query
   * @returns GetBrokerStatusBulkClientResponse { brokers: [{ bname, time, asinfo?, jobinfo? }] }
   * @example
   * // POST /host-uid/broker/status/bulk
   * // Body: { "bnames": ["query_editor", "broker1"] }
   */
  @Post('status/bulk')
  @HttpCode(200)
  async getBrokerStatusBulk(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: GetBrokerStatusBulkDto
  ): Promise<GetBrokerStatusBulkClientResponse> {
    const userId = req.user.sub;
    return await this.brokerService.getBrokerStatusBulk(userId, hostUid, body.bnames);
  }

  /**
   * Get broker status including application server information.
   *
   * @route GET /:hostUid/broker/status/:bname
   * @param req - Request object containing user information
   * @param hostUid - Host unique identifier from path parameter
   * @param bname - Broker name from path parameter
   * @returns Broker status data without BaseCmsResponse fields
   * @example
   * // POST /host-uid/broker/status/query_editor
   */
  @Get('status/:bname')
  async getBrokerStatus(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('bname') bname: string
  ): Promise<GetBrokerStatusClientResponse> {
    const userId = req.user.sub;

    this.logger.log(`Getting broker status: ${bname} on host: ${hostUid}`);
    const response = await this.brokerService.getBrokerStatus(userId, hostUid, bname);
    return response;
  }
}
