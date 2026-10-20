import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { DatabaseUserService } from './database-user.service';
import {
  UpdateDbUserResponse,
  UserInfoClientResponse,
  CreateDbUserResponse,
  DeleteDbUserResponse,
  UserVerifyResponse,
} from '@api-interfaces';
import {
  UserVerifyDto,
  CreateDbUserDto,
  UpdateDbUserBodyDto,
  DatabaseLoginBodyDto,
} from '@type/index';
import { validateRequiredFields } from '@util';

/**
 * Controller for managing database users.
 *
 * - All endpoints receive `hostUid` as a path parameter
 * - Follows RESTful pattern: /:hostUid/database/users/{action}/{identifier}
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller(':hostUid/database/users')
export class DatabaseUserController {
  private readonly logger = new Logger(DatabaseUserController.name);

  constructor(private readonly databaseUserService: DatabaseUserService) {}

  /**
   * Get user info (list of users) for a database. CMS task: userinfo.
   *
   * @route GET /:hostUid/database/users/info/:dbname
   */
  @Get('info/:dbname')
  async getUserInfo(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<UserInfoClientResponse> {
    const userId = req.user.sub;
    this.logger.log(`Getting user info for database: ${dbname} on host: ${hostUid}`);
    return await this.databaseUserService.getUserInfo(userId, hostUid, dbname);
  }

  /**
   * Verify database user credentials. CMS task: userverify.
   *
   * @route POST /:hostUid/database/users/verify
   */
  @Post('verify')
  async userVerify(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: UserVerifyDto
  ): Promise<UserVerifyResponse> {
    const userId = req.user.sub;
    this.logger.log(`Verifying user ${body.dbuser} for database: ${body.dbname} on host: ${hostUid}`);
    return await this.databaseUserService.userVerify(
      userId,
      hostUid,
      body.dbname,
      body.dbuser,
      body.dbpasswd
    );
  }

  /**
   * Create a database user. CMS task: createuser.
   *
   * @route POST /:hostUid/database/users
   */
  @Post()
  async createUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Body() body: CreateDbUserDto
  ): Promise<CreateDbUserResponse> {
    const userId = req.user.sub;
    this.logger.log(`Creating user: ${body.username} in database: ${body.dbname} on host: ${hostUid}`);
    return await this.databaseUserService.createUser(
      userId,
      hostUid,
      body.dbname,
      body.username,
      body.userpass,
      body.groups,
      body.authorization
    );
  }

  /**
   * Delete a database user. CMS task: deleteuser.
   *
   * @route DELETE /:hostUid/database/users/:dbname/:username
   */
  @Delete(':dbname/:username')
  async deleteUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Param('username') username: string
  ): Promise<DeleteDbUserResponse> {
    const userId = req.user.sub;
    this.logger.log(`Deleting user: ${username} from database: ${dbname} on host: ${hostUid}`);
    return await this.databaseUserService.deleteUser(userId, hostUid, dbname, username);
  }

  /**
   * Get list of database users for a database. CMS task: userinfo.
   *
   * @route GET /:hostUid/database/users?dbname=:dbname
   */
  @Get()
  async getDatabaseUsers(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Query('dbname') dbname: string
  ): Promise<UserInfoClientResponse> {
    const userId = req.user.sub;
    validateRequiredFields({ dbname }, ['dbname'], 'database/users', this.logger);
    this.logger.log(`Getting database users for database: ${dbname} on host: ${hostUid}`);
    return await this.databaseUserService.getDatabaseUsers(userId, hostUid, dbname);
  }

  /**
   * Login to a database using client-provided credentials.
   *
   * - Requires `id` and `password` in request body
   * - Does not fallback to stored profile
   *
   * @route POST /:hostUid/database/users/login/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param body Request body containing `id`, `password`
   * @returns boolean True on success
   * @example
   * // POST /host-uid/database/users/login/demodb
   * // Body: { "id": "user", "password": "pass" }
   */
  @Post('login/:dbname')
  async loginDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Body() body: DatabaseLoginBodyDto
  ): Promise<boolean> {
    const userId = req.user.sub;
    this.logger.log(`Logging in to database: ${dbname} on host: ${hostUid}`);
    return await this.databaseUserService.loginDatabase(
      userId,
      hostUid,
      dbname,
      body.id,
      body.password
    );
  }

  /**
   * Login to a database using stored profile credentials only.
   *
   * - Uses `host.dbProfiles[dbname]`
   * - Fails if profile is missing
   *
   * @route POST /:hostUid/database/users/login-with-profile/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @returns boolean True on success
   */
  @Post('login-with-profile/:dbname')
  async loginDatabaseWithProfile(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<boolean> {
    const userId = req.user.sub;
    this.logger.log(`Logging in to database: ${dbname} on host: ${hostUid} (using profile)`);
    return await this.databaseUserService.loginDatabase(userId, hostUid, dbname);
  }

  /**
   * Log out of a database — forgets the server-side belief that this
   * (host, db) has a live dbmtuserlogin, without touching any stored
   * profile. The next database action will re-authenticate (via the
   * profile if one is still stored, or a manual login otherwise).
   *
   * @route POST /:hostUid/database/users/logout/:dbname
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @example
   * // POST /host-uid/database/users/logout/demodb
   */
  @Post('logout/:dbname')
  async logoutDatabase(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string
  ): Promise<{ success: true }> {
    const userId = req.user.sub;
    this.logger.log(`Logging out of database: ${dbname} on host: ${hostUid}`);
    await this.databaseUserService.logoutDatabase(userId, hostUid, dbname);
    return { success: true };
  }

  /**
   * Update a database user.
   * Returns empty object on success.
   *
   * @route PUT /:hostUid/database/users/:dbname/:username
   * @param req Express request (contains authenticated user)
   * @param hostUid Host unique identifier from path parameter
   * @param dbname Database name from path parameter
   * @param username Username to update from path parameter
   * @param body Request body containing user information
   * @returns UpdateDbUserResponse Empty object on success
   * @example
   * // PUT /host-uid/database/users/demodb/yifan
   * // Body: { "userpass": "1111", "groups": { "group": ["public"] }, "authorization": [] }
   */
  @Put(':dbname/:username')
  async updateUser(
    @Request() req,
    @Param('hostUid') hostUid: string,
    @Param('dbname') dbname: string,
    @Param('username') username: string,
    @Body() body: UpdateDbUserBodyDto
  ): Promise<UpdateDbUserResponse> {
    const userId = req.user.sub;

    this.logger.log(
      `Updating user: ${username} in database: ${dbname} on host: ${hostUid}`
    );
    return await this.databaseUserService.updateUser(
      userId,
      hostUid,
      dbname,
      username,
      body.userpass,
      body.groups,
      body.authorization
    );
  }
}
