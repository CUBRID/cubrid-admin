import {
  ChangePasswordRequest,
  DeleteUserRequest,
  UpdateUserInfoRequest,
  UserResponse,
} from '@api-interfaces';
import { AccountAccessService } from '@account/account-access.service';
import { AccountSettingsService } from '@account/account-settings.service';
import { INITIAL_ADMIN_ID, removeInitialAdminPasswordFile } from '@account/initial-admin.service';
import { HandleUserErrors } from '@common';
import { UserError } from '@error/user/user-error';
import { AuthError } from '@error/auth/auth-error';
import { readGroupHosts, readHostGroups } from '@host/host-group.util';
import { Injectable } from '@nestjs/common';
import { UserRepositoryService } from '@repository';
import { PasswordService } from '@security';
import {
  UpdateUserDto,
  User,
  UserPreference,
  UserPreferenceDto,
} from '@type/index';
import { passwordValidityChecker } from '@util';

/**
 * Service for managing user-related operations.
 *
 * Provides business logic for user data management including password changes,
 * user data retrieval, account deletion, and user information updates.
 * All operations are wrapped with error handling decorators.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepositoryService,
    private readonly password: PasswordService,
    private readonly accountAccess: AccountAccessService
  ) {}
  /**
   * Changes a user's password with validation.
   *
   * Validates the old password against the stored hash and ensures the new password
   * meets security requirements before updating. Uses atomic update to ensure
   * data consistency.
   *
   * @param {string} userId - The unique identifier of the user
   * @param {ChangePasswordRequest} dto - Password change request containing old and new passwords
   * @returns {Promise<void>} No return value on success
   * @throws {UserError} When old password is incorrect or new password is invalid
   * @example
   * ```typescript
   * await userService.changePassword("user123", {
   *   oldPassword: "oldpass123",
   *   newPassword: "newpass456"
   * });
   * ```
   */
  @HandleUserErrors()
  async changePassword(userId: string, dto: ChangePasswordRequest) {
    const changePasswordCallback = async (user: User): Promise<User> => {
      if (await this.password.comparePlainAndHash(dto.oldPassword, user.password)) {
        if (!passwordValidityChecker(dto.newPassword)) {
          throw UserError.BadNewPassword();
        }
        // An admin-set password must really be replaced, not set again.
        if (user.mustChangePassword && (await this.password.comparePlainAndHash(dto.newPassword, user.password))) {
          throw UserError.PasswordUnchanged();
        }
      } else {
        throw UserError.OldPasswordMismatch();
      }

      user.password = await this.password.getHashedValue(dto.newPassword);
      // Setting their own password ends the change an admin asked for.
      delete user.mustChangePassword;

      return user;
    };
    await this.repository.atomicUpdateUser(userId, changePasswordCallback);
    this.accountAccess.invalidate(userId);
    if (userId === INITIAL_ADMIN_ID) await removeInitialAdminPasswordFile();
  }

  /**
   * Sets the user's own password while an admin-required change is pending
   * (after an admin created the account or reset its password). Needs no old
   * password: the session itself was opened with the temporary one, and
   * outside a pending change this is refused, so a normal change still asks
   * for the current password.
   */
  @HandleUserErrors()
  async setInitialPassword(userId: string, newPassword: string): Promise<void> {
    if (!passwordValidityChecker(newPassword)) {
      throw UserError.BadNewPassword();
    }
    const hash = await this.password.getHashedValue(newPassword);
    await this.repository.atomicUpdateUser(userId, async (user: User) => {
      if (!user.mustChangePassword) {
        throw AuthError.PermissionDenied({ userId, reason: 'NO_PENDING_PASSWORD_CHANGE' });
      }
      if (await this.password.comparePlainAndHash(newPassword, user.password)) {
        throw UserError.PasswordUnchanged();
      }
      user.password = hash;
      delete user.mustChangePassword;
      return user;
    });
    this.accountAccess.invalidate(userId);
    if (userId === INITIAL_ADMIN_ID) await removeInitialAdminPasswordFile();
  }

  /**
   * Retrieves user data excluding sensitive information.
   *
   * Loads user information from the repository and removes:
   * - User password
   * - Host passwords and tokens in host_groups
   * - Database passwords in dbProfiles within each host
   *
   * @param {string} userId - The unique identifier of the user
   * @returns {Promise<UserResponse>} User data without sensitive information
   * @throws {UserError} When user is not found
   * @example
   * ```typescript
   * const userData = await userService.getUserData("user123");
   * console.log(userData.department); // "IT"
   * // userData.password is undefined
   * // host_groups[*].hosts[uid].password is undefined in the API response
   * // host_groups[*].hosts[uid].token is undefined in the API response
   * // host_groups[*].hosts[uid].dbProfiles[dbname].password is undefined in the API response
   * ```
   */
  @HandleUserErrors()
  async getUserData(userId: string): Promise<UserResponse> {
    const user = await this.repository.loadUserById(userId);

    const { password, uuid, sessionVersion, ...userResponse } = user;

    const sanitizedGroups: Record<string, any> = {};
    for (const [groupId, group] of Object.entries(readHostGroups(userResponse))) {
      const sanitizedHosts: Record<string, any> = {};
      for (const [hostUid, hostInfo] of Object.entries(readGroupHosts(group))) {
        const { password: _p, token, dbProfiles, ...hostWithoutSensitive } = hostInfo;
        const sanitizedDbProfiles: Record<string, any> = {};
        if (dbProfiles) {
          for (const [dbname, dbInfo] of Object.entries(dbProfiles)) {
            const { password: dbPassword, ...dbWithoutPassword } = dbInfo;
            sanitizedDbProfiles[dbname] = dbWithoutPassword;
          }
        }
        sanitizedHosts[hostUid] = {
          ...hostWithoutSensitive,
          dbProfiles: sanitizedDbProfiles,
        };
      }
      sanitizedGroups[groupId] = {
        name: group.name,
        defaultHostUid: group.defaultHostUid,
        createdAt: group.createdAt,
        hosts: sanitizedHosts,
      };
    }

    const result: UserResponse = {
      ...userResponse,
      role: user.role ?? 'user',
      status: user.status ?? 'active',
      isAdmin: this.accountAccess.isAdmin(user),
      host_groups: sanitizedGroups,
    };

    return result;
  }

  /**
   * Retrieves user preferences.
   *
   * Loads user information and returns only the `user_preference` object.
   *
   * @param {string} userId - The unique identifier of the user
   * @returns {Promise<UserPreference>} User preferences
   * @throws {UserError} When user is not found
   * @example
   * ```typescript
   * const preferences = await userService.getUserPreferences("user123");
   * console.log(preferences.dashboardInterval); // 10
   * ```
   */
  @HandleUserErrors()
  async getUserPreferences(userId: string): Promise<UserPreference> {
    const user = await this.repository.loadUserById(userId);
    return user.user_preference;
  }

  /**
   * Permanently deletes a user account after password verification.
   *
   * Validates the provided password against the stored hash before deleting.
   * Removes the user and all associated data from the repository.
   * This operation cannot be undone.
   *
   * @param {string} userId - The unique identifier of the user to delete
   * @param {DeleteUserRequest} request - Request containing password for verification
   * @returns {Promise<void>} No return value on success
   * @throws {UserError} When user is not found or password is incorrect
   * @example
   * ```typescript
   * await userService.deleteUser("user123", { password: "userpassword" });
   * // User account is permanently deleted after password verification
   * ```
   */
  @HandleUserErrors()
  async deleteUser(userId: string, request: DeleteUserRequest): Promise<void> {
    // Load user to verify password
    const user = await this.repository.loadUserById(userId);

    // Verify password before deletion
    if (!(await this.password.comparePlainAndHash(request.password, user.password))) {
      throw UserError.OldPasswordMismatch();
    }

    // The last active admin can't delete themselves and leave no one to
    // manage accounts. A cwm.conf admin couldn't sign up again either, so
    // the same rule applies. Checked and deleted in the same queue as the
    // admin actions, so a concurrent demotion can't slip in between.
    await AccountAccessService.exclusive(async () => {
      if (this.accountAccess.isActiveAdmin(user)) {
        const others = (await this.repository.listUsers()).filter(
          (u) => u.id !== userId && this.accountAccess.isActiveAdmin(u)
        );
        if (others.length === 0) throw UserError.LastAdmin({ userId });
      }

      // Password verified, proceed with deletion
      await this.repository.deleteUser(userId);
      this.accountAccess.invalidate(userId);
      AccountSettingsService.adminsChanged();
    });
  }

  /**
   * Updates user's non-credential information with provided data.
   *
   * Updates specific user fields based on the provided update object.
   * This method supports nested updates for `user_preference`.
   * Uses atomic update to ensure data consistency.
   *
   * @param {string} userId - The unique identifier of the user
   * @param {UpdateUserDto} update - Object containing fields to update
   * @returns {Promise<User>} The updated user object
   * @throws {UserError} When user is not found or update fails
   * @example
   * ```typescript
   * const updatedUser = await userService.updateProfile("user123", {
   *   department: "Engineering",
   *   user_preference: { dashboardInterval: 30 }
   * });
   * console.log(updatedUser.department); // "Engineering"
   * console.log(updatedUser.user_preference.dashboardInterval); // 30
   * ```
   */
  @HandleUserErrors()
  async updateProfile(userId: string, update: UpdateUserDto): Promise<User> {
    return await this.repository.atomicUpdateUser(userId, async (user: User) => {
      if (update.department) {
        user.department = update.department;
      }
      if (update.user_preference) {
        user.user_preference = {
          ...user.user_preference,
          ...update.user_preference,
        };
      }
      return user;
    });
  }

  /**
   * Updates user's preferences with provided data.
   *
   * Updates specific user preference fields based on the provided update object.
   * Uses atomic update to ensure data consistency.
   *
   * @param {string} userId - The unique identifier of the user
   * @param {UserPreferenceDto} update - Object containing preference fields to update
   * @returns {Promise<User>} The updated user object
   * @throws {UserError} When user is not found or update fails
   * @example
   * ```typescript
   * const updatedUser = await userService.updateUserPreferences("user123", {
   *   dashboardInterval: 30
   * });
   * console.log(updatedUser.user_preference.dashboardInterval); // 30
   * ```
   */
  @HandleUserErrors()
  async updateUserPreferences(userId: string, update: UserPreferenceDto): Promise<User> {
    return await this.repository.atomicUpdateUser(userId, async (user: User) => {
      user.user_preference = {
        ...user.user_preference,
        ...update,
      };
      return user;
    });
  }

  /**
   * Updates user information with provided data.
   *
   * Updates specific user fields based on the provided update object.
   * Uses atomic update to ensure data consistency. Only fields present
   * in the update object will be modified.
   *
   * @param {string} userId - The unique identifier of the user
   * @param {UpdateUserInfoRequest} update - Object containing fields to update
   * @returns {Promise<User>} The updated user object
   * @throws {UserError} When user is not found or update fails
   * @example
   * ```typescript
   * const updatedUser = await userService.updateUser("user123", {
   *   department: "Engineering"
   * });
   * console.log(updatedUser.department); // "Engineering"
   * ```
   */
  @HandleUserErrors()
  async updateUser(userId: string, update: UpdateUserInfoRequest): Promise<User> {
    return await this.repository.atomicUpdateUser(userId, async (user: User) => {
      // Only the fields this endpoint is for. The body is a plain type the
      // validation pipe can't check, and copying every key would let a user
      // set their own role, status, password hash or hosts.
      if (typeof update?.department === 'string') {
        user.department = update.department;
      }
      return user;
    });
  }
}
