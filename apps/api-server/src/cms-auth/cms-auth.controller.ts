import { Controller, Get, Param, Post, Request } from '@nestjs/common';
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
