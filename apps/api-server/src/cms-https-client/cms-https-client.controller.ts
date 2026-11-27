import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ConfigService } from '@config/config.service';
import { AuthError } from '@error/auth/auth-error';
import { CmsHttpsClientService } from './cms-https-client.service';
import { CmsForwardClientRequest } from '@api-interfaces';
import { LogAction } from '@api-log/log-action.decorator';

/**
 * Controller for handling CMS HTTPS client requests.
 * This controller acts as a proxy to forward authenticated requests to the CMS API.
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/cms-https-client/{action}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/cms-https-client')
export class CmsHttpsClientController {
  /**
   * @param clientService - The service responsible for forwarding requests to the CMS API.
   */
  constructor(
    private readonly clientService: CmsHttpsClientService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Forwards an authenticated request from the client to the CMS API.
   * This endpoint requires JWT authentication. The user's ID is extracted from the JWT,
   * and the host ID is taken from the path parameter. The request body should contain task.
   *
   * @route POST /:hostUid/cms-https-client/forward
   * @param req - The Express request object, containing user information from the JWT.
   * @param hostUid - Host unique identifier from path parameter
   * @param request - The request body from the client, containing task (hostUid is taken from path).
   * @returns A Promise that resolves with the response from the CMS API.
   * @example
   * // POST /host-uid-1/cms-https-client/forward
   * // Body: { "task": "getbrokersinfo" }
   */
  @LogAction('cms.forward')
  @Post('forward')
  async forwardRequest(
    @Req() req,
    @Param('hostUid') hostUid: string,
    @Body() request: Omit<CmsForwardClientRequest, 'hostUid'>
  ) {
    if (!this.configService.isCmsForwardEnabled()) {
      throw AuthError.PermissionDenied({ reason: 'CMS_FORWARD_DISABLED' });
    }

    return this.clientService.forwardAuthenticated(req.user.sub, { ...request, hostUid });
  }
}
