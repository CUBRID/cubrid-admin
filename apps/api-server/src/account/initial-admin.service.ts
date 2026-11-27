import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@config/config.service';
import { UserError, UserErrorCode } from '@error/user/user-error';
import { UserRepositoryService } from '@repository';
import { getStoragePath, passwordValidityChecker } from '@util';
import { AccountSettingsService } from './account-settings.service';

/** The administrator account every install starts with. */
export const INITIAL_ADMIN_ID = 'admin';

const PASSWORD_LENGTH = 16;
// No look-alike characters (0/O, 1/l/I), so the password can be typed from a screen.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function initialAdminPasswordPath(): string {
  return path.join(getStoragePath(), 'admin', 'initial-admin-password.txt');
}

/** A random password that passes the password rules (a letter and a digit). */
export function generateInitialPassword(): string {
  for (;;) {
    let password = '';
    for (let i = 0; i < PASSWORD_LENGTH; i++) {
      password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    }
    if (passwordValidityChecker(password)) return password;
  }
}

/**
 * Deletes the file holding the first administrator password, once it is no
 * longer the account's password. Never fails the caller.
 */
export async function removeInitialAdminPasswordFile(logger?: Logger): Promise<void> {
  try {
    await fs.unlink(initialAdminPasswordPath());
    logger?.log('Removed the initial administrator password file: the password has been changed.');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') logger?.warn(`Could not remove ${initialAdminPasswordPath()}: ${String(err)}`);
  }
}

/**
 * Gives a fresh install its administrator: on the first start, with no
 * account in storage, creates `admin` with a random password that must be
 * changed at the first sign-in. The password is printed to the console
 * (not the log file) and saved, readable by the server's OS user only, in
 * storage/admin/initial-admin-password.txt until it is changed.
 *
 * An install that already has accounts is left as it is. The desktop app
 * has no accounts.
 */
@Injectable()
export class InitialAdminService implements OnModuleInit {
  private readonly logger = new Logger(InitialAdminService.name);

  constructor(
    private readonly repository: UserRepositoryService,
    private readonly config: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.isDesktopMode()) return;
    if (await this.repository.hasAccountFiles()) {
      await this.forgetChangedPassword();
      return;
    }
    await this.createInitialAdmin();
  }

  private async createInitialAdmin(): Promise<void> {
    const password = generateInitialPassword();
    const file = initialAdminPasswordPath();
    // The file first: an account whose password was never shown anywhere
    // would lock the install out.
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(
      file,
      [
        'CUBRID Web Manager: first administrator sign-in',
        '',
        `Account:  ${INITIAL_ADMIN_ID}`,
        `Password: ${password}`,
        '',
        'You will be asked to set a new password when you sign in.',
        'This file is deleted once the password has been changed.',
        '',
      ].join('\n'),
      { mode: 0o600 }
    );
    try {
      await this.repository.createUser(
        { id: INITIAL_ADMIN_ID, password },
        { role: 'admin', status: 'active', mustChangePassword: true }
      );
    } catch (err: unknown) {
      await fs.rm(file, { force: true });
      if (err instanceof UserError && err.code === UserErrorCode.USER_ALREADY_EXISTS) return;
      throw err;
    }
    AccountSettingsService.adminsChanged();

    this.logger.log(
      `Created the administrator account "${INITIAL_ADMIN_ID}". Its first password is in ${file} ` +
        'and must be changed at the first sign-in.'
    );
    // Straight to the console, so the password is not kept in the log files.
    process.stdout.write(
      [
        '',
        '================================================================',
        '  First administrator sign-in',
        `    Account : ${INITIAL_ADMIN_ID}`,
        `    Password: ${password}`,
        '  A new password must be set at the first sign-in.',
        `  Also saved in ${file} until then.`,
        '================================================================',
        '',
      ].join('\n') + '\n'
    );
  }

  /** A restart after the password was changed (or `admin` removed) drops a leftover file. */
  private async forgetChangedPassword(): Promise<void> {
    try {
      await fs.access(initialAdminPasswordPath());
    } catch {
      return;
    }
    let pending = false;
    try {
      pending = (await this.repository.loadUserById(INITIAL_ADMIN_ID)).mustChangePassword === true;
    } catch (err: unknown) {
      if (!(err instanceof UserError) || err.code !== UserErrorCode.USER_NOT_FOUND) {
        this.logger.warn(`Could not check the "${INITIAL_ADMIN_ID}" account: ${String(err)}`);
        return;
      }
    }
    if (!pending) await removeInitialAdminPasswordFile(this.logger);
  }
}
