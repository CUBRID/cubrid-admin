import { Body, Controller, Delete, Get, Post, Put, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { UserPreference, UserPreferenceDto, ChangePasswordDto, DeleteUserDto } from '@type/index';
import { UpdateUserInfoRequest, UserResponse } from '@api-interfaces';

/**
 * Controller for handling user-related operations.
 *
 * Provides endpoints for user data management including retrieving user information,
 * changing passwords, updating user details, and account deletion.
 * All endpoints require JWT authentication.
 *
 * @category Controllers
 * @since 1.0.0
 */
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Retrieves the current user's data.
   *
   * Returns user information excluding the password field for security.
   * The user ID is extracted from the JWT token in the request.
   *
   * @param {any} req - Express request object containing JWT payload
   * @returns {Promise<UserResponse>} User data without password
   * @throws {UserError} When user is not found
   * @example
   * ```typescript
   * // GET /user
   * // Returns: { uuid: "123", id: "user1", department: "IT", host_groups: {}, ... }
   * ```
   */
  @Get()
  async getUserData(@Request() req): Promise<UserResponse> {
    const userId = req.user.sub;
    return await this.userService.getUserData(userId);
  }

  /**
   * Retrieves the current user's preferences.
   *
   * Returns the user's preference object.
   * The user ID is extracted from the JWT token in the request.
   *
   * @param {any} req - Express request object containing JWT payload
   * @returns {Promise<UserPreference>} User preference data
   * @throws {UserError} When user is not found
   * @example
   * ```typescript
   * // GET /user/preferences
   * // Returns: { dashboardInterval: 10, brokerStatusInterval: 20 }
   * ```
   */
  @Get('preferences')
  async getUserPreferences(@Request() req): Promise<UserPreference> {
    const userId = req.user.sub;
    return await this.userService.getUserPreferences(userId);
  }

  /**
   * Changes the user's password.
   *
   * Validates the old password and sets a new password if validation passes.
   * The new password must meet security requirements.
   *
   * @param {ChangePasswordRequest} dto - Password change request containing old and new passwords
   * @param {any} req - Express request object containing JWT payload
   * @returns {Promise<void>} No return value on success
   * @throws {UserError} When old password is incorrect or new password is invalid
   * @example
   * ```typescript
   * // POST /user/credential
   * // Body: { oldPassword: "old123", newPassword: "new456" }
   * ```
   */
  @Post('credential')
  async changePassword(@Body() dto: ChangePasswordDto, @Request() req): Promise<void> {
    const userId = req.user.sub;
    await this.userService.changePassword(userId, dto);
  }

  /**
   * Deletes the user's account after password verification.
   *
   * Validates the provided password before permanently removing the user account
   * and all associated data. This operation cannot be undone.
   *
   * @param {any} req - Express request object containing JWT payload
   * @param {DeleteUserRequest} body - Request body containing password for verification
   * @returns {Promise<boolean>} Always returns true on successful deletion
   * @throws {UserError} When user is not found or password is incorrect
   * @example
   * ```typescript
   * // DELETE /user/account
   * // Body: { password: "userpassword" }
   * // Returns: true
   * ```
   */
  @Delete('account')
  async deleteUser(@Request() req, @Body() body: DeleteUserDto): Promise<boolean> {
    await this.userService.deleteUser(req.user.sub, body);
    return true;
  }

  /**
   * Updates user's non-credential information.
   *
   * Updates specific user fields based on the provided request body.
   * Only non-credential fields can be updated (e.g., department, user_preference).
   *
   * @param {any} req - Express request object containing JWT payload
   * @param {UpdateUserDto} body - User information to update
   * @returns {Promise<void>} No return value on success
   * @throws {UserError} When user is not found or update fails
   * @example
   * ```typescript
   * // PATCH /user/profile
   * // Body: { department: "Engineering", user_preference: { dashboardInterval: 30 } }
   * ```
   */

  /**
   * Updates user's preferences.
   *
   * Updates specific user preference fields based on the provided request body.
   *
   * @param {any} req - Express request object containing JWT payload
   * @param {UserPreferenceDto} body - User preferences to update
   * @returns {Promise<void>} No return value on success
   * @throws {UserError} When user is not found or update fails
   * @example
   * ```typescript
   * // PATCH /user/preferences
   * // Body: { dashboardInterval: 30 }
   * ```
   */
  @Put('preferences')
  async updateUserPreferences(@Request() req, @Body() body: UserPreferenceDto): Promise<void> {
    const userId = req.user.sub;
    await this.userService.updateUserPreferences(userId, body);
  }

  /**
   * Updates user information.
   *
   * Updates specific user fields based on the provided request body.
   * Only allowed fields can be updated (currently only department).
   *
   * @param {any} req - Express request object containing JWT payload
   * @param {UpdateUserInfoRequest} body - User information to update
   * @returns {Promise<void>} No return value on success
   * @throws {UserError} When user is not found or update fails
   * @example
   * ```typescript
   * // POST /user/account
   * // Body: { department: "Engineering" }
   * ```
   */
  @Post('account')
  async updateUser(@Request() req, @Body() body: UpdateUserInfoRequest): Promise<void> {
    const userId = req.user.sub;
    await this.userService.updateUser(userId, body);
  }
}
