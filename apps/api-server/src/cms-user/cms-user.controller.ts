import { Body, Controller, Delete, Get, Logger, Param, Post, Put, Request } from '@nestjs/common';
import {
  AddDbmtUserClientResponse,
  DeleteDbmtUserClientResponse,
  GetDbmtUserInfoClientResponse,
  SetDbmtPasswdClientResponse,
  UpdateDbmtUserClientResponse,
} from '@api-interfaces';
import { AddDbmtUserDto, UpdateDbmtUserDto, SetDbmtPasswdDto } from '@type/index';
import { CmsUserService } from './cms-user.service';
import { LogAction } from '@api-log/log-action.decorator';

/**
 * Controller for CMS (DBMT) user management: get list, update, delete, set password.
 * Base path: /:hostUid/cms-user
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/cms-user')
export class CmsUserController {
  private readonly logger = new Logger(CmsUserController.name);

  constructor(private readonly cmsUserService: CmsUserService) {}

  /**
   * Add a DBMT (CMS) user. CMS task: adddbmtuser.
   * Request body: targetid, password, casauth, dbcreate, statusmonitorauth.
   * Response: dblist, userlist (same shape as CMS response).
   * @route POST /:hostUid/cms-user
   */
  @LogAction('cms.add_user')
  @Post()
  async addDbmtUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: AddDbmtUserDto
  ): Promise<AddDbmtUserClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Adding DBMT user: ${body.targetid} on host: ${hostUid}`);
    return await this.cmsUserService.addDbmtUser(userId, hostUid, body);
  }

  /**
   * Get DBMT user info (dblist, userlist). CMS task: getdbmtuserinfo.
   * @route GET /:hostUid/cms-user
   */
  @Get()
  async getDbmtUserInfo(
    @Request() req,
    @Param('hostUid') hostUid: string
  ): Promise<GetDbmtUserInfoClientResponse> {
    const userId = req.user.sub;
    this.logger.debug(`Getting DBMT user info on host: ${hostUid}`);
    return await this.cmsUserService.getDbmtUserInfo(userId, hostUid);
  }

  /**
   * Update DBMT user. CMS task: updatedbmtuser.
   * @route PUT /:hostUid/cms-user
   */
  @LogAction('cms.change_user')
  @Put()
  async updateDbmtUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: UpdateDbmtUserDto
  ): Promise<UpdateDbmtUserClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Updating DBMT user: ${body.targetid} on host: ${hostUid}`);
    return await this.cmsUserService.updateDbmtUser(userId, hostUid, body);
  }

  /**
   * Delete DBMT user. CMS task: deletedbmtuser.
   * @route DELETE /:hostUid/cms-user/:targetid
   */
  @LogAction('cms.delete_user')
  @Delete(':targetid')
  async deleteDbmtUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('targetid') targetid: string
  ): Promise<DeleteDbmtUserClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Deleting DBMT user: ${targetid} on host: ${hostUid}`);
    return await this.cmsUserService.deleteDbmtUser(userId, hostUid, targetid);
  }

  /**
   * Set DBMT user password. CMS task: setdbmtpasswd.
   * @route PUT /:hostUid/cms-user/set-password
   */
  @LogAction('cms.change_password')
  @Put('set-password')
  async setDbmtPasswd(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: SetDbmtPasswdDto
  ): Promise<SetDbmtPasswdClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Setting DBMT password for: ${body.targetid} on host: ${hostUid}`);
    return await this.cmsUserService.setDbmtPasswd(
      userId,
      hostUid,
      body.targetid,
      body.newpassword
    );
  }
}
