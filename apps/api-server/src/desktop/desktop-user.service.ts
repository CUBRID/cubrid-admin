import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigService } from '@config/config.service';
import { UserError, UserErrorCode } from '@error/user/user-error';
import { UserRepositoryService } from '@repository';
import { DESKTOP_USER_ID } from './desktop-user.guard';

/**
 * In desktop mode, makes sure the workspace holds the desktop user's record
 * (its one data file) before any request: every service loads the user by
 * id. A new workspace gets an empty one; its password is never used.
 */
@Injectable()
export class DesktopUserService implements OnApplicationBootstrap {
  constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepositoryService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.configService.isDesktopMode()) {
      await this.ensureDesktopUser();
    }
  }

  async ensureDesktopUser(): Promise<void> {
    try {
      await this.userRepository.loadUserById(DESKTOP_USER_ID);
    } catch (err) {
      if (!(err instanceof UserError) || err.code !== UserErrorCode.USER_NOT_FOUND) {
        throw err;
      }
      await this.userRepository.createUser({ id: DESKTOP_USER_ID, password: randomBytes(32).toString('hex') });
    }
  }
}
