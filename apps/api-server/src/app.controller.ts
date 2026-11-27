import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipActionLog } from '@api-log/log-action.decorator';

/**
 * Root controller for handling basic application endpoints.
 *
 * Provides simple health check and basic API endpoints for the WebCA server.
 * These endpoints are typically used for monitoring and basic connectivity tests.
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Handles GET requests to the root endpoint.
   *
   * Returns a simple string response indicating the server is running
   * and responding to GET requests.
   *
   * @returns {string} A confirmation message for GET requests
   * @example
   * ```typescript
   * // GET /
   * // Returns: "GET / "
   * ```
   */
  @Get()
  getHello(): string {
    return 'GET / ';
  }

  /**
   * Handles POST requests to the root endpoint.
   *
   * Returns a simple string response indicating the server is running
   * and responding to POST requests.
   *
   * @returns {string} A confirmation message for POST requests
   * @example
   * ```typescript
   * // POST /
   * // Returns: "POST /"
   * ```
   */
  @SkipActionLog()
  @Post()
  postNothing(): string {
    return 'POST /';
  }
}
