import { Body, Controller, Param, Post, Request } from '@nestjs/common';
import { FileService } from './file.service';
import { CheckFileClientRequest, CheckFileClientResponse } from '@api-interfaces';
import { SkipActionLog } from '@api-log/log-action.decorator';

/**
 * Controller for file operations.
 *
 * Handles HTTP requests for file management including checking file existence,
 * uploading, downloading, and listing files on CMS hosts.
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/file/{action}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * Check if a file exists on the specified CMS host.
   *
   * @route GET /:hostUid/file/checkfile
   * @param request - Express request object containing user payload
   * @param hostUid - Host unique identifier from path parameter
   * @returns Promise<CheckFileClientResponse> File check information
   * @example
   * // POST /host-uid/file/checkfile
   */
  @SkipActionLog()
  @Post('checkfile')
  async checkFile(
    @Request() request: any,
    @Param('hostUid') hostUid: string,
    @Body() body: CheckFileClientRequest
  ): Promise<CheckFileClientResponse> {
    const userId = request.user.sub;
    return await this.fileService.checkFile(userId, hostUid, body);
  }
}
