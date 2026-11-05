import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { UpdateHostClientDto } from '@type/index';
import { CmsAuthService } from './cms-auth.service';

/**
 * Controller for handling CMS authentication operations.
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/cms-auth/{action}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/cms-auth')
export class CmsAuthController {
  constructor(private readonly cmsAuthService: CmsAuthService) {}

  /**
   * Handles CMS login for a specific host.
   *
   * @route POST /:hostUid/cms-auth/login
   * @param request - The Express request object, containing user information from the JWT.
   * @param hostUid - Host unique identifier from path parameter
   * @returns Login payload: `isHA` false has no extra fields; true includes `currentNodeType` and `haNodes`.
   * @example
   * // POST /host-uid-1/cms-auth/login
   */
  @Post('login')
  async login(@Request() request: any, @Param('hostUid') hostUid: string) {
    const userId = request.user.sub;
    return await this.cmsAuthService.login(userId, hostUid);
  }

  /**
   * Logs in with changed connection settings, saving them only when the
   * login succeeds (the host edit dialog's Connect & Save).
   *
   * @route POST /:hostUid/cms-auth/connect
   * @param changes - The host settings to log in with, as PUT /host/:hostUid takes them.
   * @returns Same shape as `login`'s payload.
   */
  @Post('connect')
  async connect(
    @Request() request: any,
    @Param('hostUid') hostUid: string,
    @Body() changes: UpdateHostClientDto
  ) {
    const userId = request.user.sub;
    return await this.cmsAuthService.connect(userId, hostUid, changes);
  }

  /**
   * Logs in with the host's settings and the dialog's changes and out again,
   * saving nothing (the host edit dialog's Test Connection).
   *
   * @route POST /:hostUid/cms-auth/test
   * @param changes - The settings changed in the dialog, as PUT /host/:hostUid takes them.
   */
  @Post('test')
  async test(
    @Request() request: any,
    @Param('hostUid') hostUid: string,
    @Body() changes: UpdateHostClientDto
  ) {
    const userId = request.user.sub;
    return await this.cmsAuthService.testConnectionFor(userId, hostUid, changes);
  }

  /**
   * Marks the host's CMS session as closed by the user, so a reload no longer
   * restores it as connected.
   *
   * @route POST /:hostUid/cms-auth/disconnect
   */
  @Post('disconnect')
  async disconnect(@Request() request: any, @Param('hostUid') hostUid: string) {
    const userId = request.user.sub;
    await this.cmsAuthService.disconnect(userId, hostUid);
    return { success: true };
  }

  /**
   * Re-derives a host's HA role/peer payload without re-authenticating —
   * for refreshing the HA badge after something that can change a host's
   * role (e.g. Service Start/Stop's `ha_start`/`ha_stop`).
   *
   * @route GET /:hostUid/cms-auth/ha-info
   * @param request - The Express request object, containing user information from the JWT.
   * @param hostUid - Host unique identifier from path parameter
   * @returns Same shape as `login`'s payload.
   * @example
   * // GET /host-uid-1/cms-auth/ha-info
   */
  @Get('ha-info')
  async getHaInfo(@Request() request: any, @Param('hostUid') hostUid: string) {
    const userId = request.user.sub;
    return await this.cmsAuthService.getHaInfo(userId, hostUid);
  }
}
