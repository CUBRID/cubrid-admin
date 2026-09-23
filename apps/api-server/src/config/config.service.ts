import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { parseCliArgs } from './parse-cli-args';
import { parseBooleanEnv } from './parse-boolean-env';
import { deriveSecretKeyHexFromSeedSalt } from './master-key';
import { getLogPath } from '../util/resolve-log-path';

/**
 * Application configuration from env (after `loadRuntimeEnv`) with optional CLI overrides.
 * Encryption key: PBKDF2(SEED, SALT) — set `SEED` and `SALT` in env or `/etc/cubrid-webmanager.env`.
 *
 * @category Infrastructure Services
 * @since 1.0.0
 */
@Injectable()
export class ConfigService {
  public port: string = '8080';
  public secret_key!: string;
  public environment: string = 'development';
  public allowedOrigins: string[] = [];
  public cmsRejectUnauthorized!: boolean;
  public cmsForwardEnabled!: boolean;
  public authRegistrationEnabled!: boolean;
  public listenHost?: string;
  private readonly listenUnixSocket?: string;
  private readonly cmsCaCert?: string;
  private logToFile!: boolean;
  private logDir!: string;
  private logLevel!: string;
  private logMaxSize!: string;
  private logMaxFiles!: string;
  private logAppendOnRestart!: boolean;

  constructor() {
    const args = parseCliArgs(process.argv.slice(2));

    const seed = args.SEED ?? process.env.SEED;
    const salt = args.SALT ?? process.env.SALT;
    if (!seed || !salt) {
      throw new Error(
        'SEED and SALT are required (env or CLI, e.g. SEED=... SALT=... in .env).'
      );
    }
    this.secret_key = deriveSecretKeyHexFromSeedSalt(seed, salt);

    this.environment = (
      args.ENVIRONMENT ??
      args.ENV ??
      process.env.ENVIRONMENT ??
      'development'
    ).toLowerCase();
    console.log('[ConfigService] Environment:', this.environment);

    this.cmsRejectUnauthorized = this.resolveCmsRejectUnauthorized(args);
    this.cmsForwardEnabled = this.resolveCmsForwardEnabled(args);
    this.authRegistrationEnabled = this.resolveAuthRegistrationEnabled(args);
    this.cmsCaCert = this.resolveCmsCaCert(args);

    this.resolveLogSettings(args);

    if (args.PORT) {
      const portNumber = parseInt(args.PORT, 10);
      if (isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
        throw new Error(
          `Invalid PORT provided: "${args.PORT}". Port must be a number between 1 and 65535.`
        );
      }
      this.port = args.PORT;
    } else if (process.env.PORT) {
      const portNumber = parseInt(process.env.PORT, 10);
      if (isNaN(portNumber) || portNumber <= 0 || portNumber > 65535) {
        throw new Error(
          `Invalid PORT in environment: "${process.env.PORT}". Port must be a number between 1 and 65535.`
        );
      }
      this.port = process.env.PORT;
    } else {
      this.port = '8080';
    }

    const allowedFromEnvOrArg =
      args.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS;
    const desktopMode = (process.env.CWM_DESKTOP ?? '').trim() === '1';
    this.setAllowedOrigins(allowedFromEnvOrArg, desktopMode);

    const listenHost =
      args.LISTEN_HOST ?? process.env.LISTEN_HOST ?? process.env.HOST;
    if (listenHost?.trim()) {
      this.listenHost = listenHost.trim();
    }

    const listenUnixSocket =
      args.LISTEN_UNIX_SOCKET ?? process.env.LISTEN_UNIX_SOCKET;
    if (listenUnixSocket?.trim()) {
      this.listenUnixSocket = listenUnixSocket.trim();
    }
  }

  getSecretKey(): string {
    return this.secret_key;
  }

  getPort(): string {
    return this.port;
  }

  getEnvironment(): string {
    return this.environment;
  }

  isProduction(): boolean {
    return this.environment === 'production';
  }

  getAllowedOrigins(): string[] {
    return this.allowedOrigins;
  }

  getListenHost(): string | undefined {
    return this.listenHost;
  }

  getListenUnixSocket(): string | undefined {
    return this.listenUnixSocket;
  }

  getCmsRejectUnauthorized(): boolean {
    return this.cmsRejectUnauthorized;
  }

  getCmsCaCert(): string | undefined {
    return this.cmsCaCert;
  }

  isCmsForwardEnabled(): boolean {
    return this.cmsForwardEnabled;
  }

  isAuthRegistrationEnabled(): boolean {
    return this.authRegistrationEnabled;
  }

  isLogToFileEnabled(): boolean {
    return this.logToFile;
  }

  getLogDir(): string {
    return this.logDir;
  }

  getLogLevel(): string {
    return this.logLevel;
  }

  getLogMaxSize(): string {
    return this.logMaxSize;
  }

  getLogMaxFiles(): string {
    return this.logMaxFiles;
  }

  isLogAppendOnRestart(): boolean {
    return this.logAppendOnRestart;
  }

  /**
   * Re-resolves LOG_* fields from the current `process.env` (CLI args are
   * intentionally not re-read — they can't change at runtime anyway). Called
   * by the cwm.conf hot-reload watcher after it force-updates `process.env`
   * with the file's latest values, so a running server picks up new log
   * settings without a restart. See watch-log-config.ts.
   */
  reloadLogSettingsFromEnv(): void {
    this.resolveLogSettings({});
  }

  private resolveLogSettings(args: Record<string, string>): void {
    this.logToFile = this.resolveLogToFile(args);
    this.logDir = args.LOG_DIR?.trim() || getLogPath();
    // Vocabulary matches NestJS's own levels (log/error/warn/debug/verbose),
    // not winston's npm defaults — see winston-logger.ts's NEST_LEVELS.
    this.logLevel = (args.LOG_LEVEL ?? process.env.LOG_LEVEL ?? (this.isProduction() ? 'log' : 'debug')).toLowerCase();
    this.logMaxSize = args.LOG_MAX_SIZE ?? process.env.LOG_MAX_SIZE ?? '20m';
    this.logMaxFiles = args.LOG_MAX_FILES ?? process.env.LOG_MAX_FILES ?? '14d';
    this.logAppendOnRestart = this.resolveLogAppendOnRestart(args);
  }

  private resolveCmsRejectUnauthorized(args: Record<string, string>): boolean {
    const raw = args.CMS_REJECT_UNAUTHORIZED ?? process.env.CMS_REJECT_UNAUTHORIZED;
    if (raw != null && raw !== '') {
      return parseBooleanEnv(raw);
    }

    // CMS hosts overwhelmingly run with an auto-generated self-signed cert
    // (see the SSL_CERT_PATH/SSL_KEY_PATH row above — same default here), so
    // defaulting to strict verification in production just meant everyone
    // had to set this explicitly anyway. Set CMS_REJECT_UNAUTHORIZED=true
    // (or CMS_CA_CERT_PATH, to trust a specific cert instead of disabling
    // verification outright) if a deployment actually has a CA-signed CMS cert.
    return false;
  }

  private resolveCmsForwardEnabled(args: Record<string, string>): boolean {
    const raw = args.CMS_FORWARD_ENABLED ?? process.env.CMS_FORWARD_ENABLED;
    if (raw != null && raw !== '') {
      return parseBooleanEnv(raw);
    }

    return !this.isProduction();
  }

  private resolveAuthRegistrationEnabled(args: Record<string, string>): boolean {
    const raw = args.AUTH_REGISTRATION_ENABLED ?? process.env.AUTH_REGISTRATION_ENABLED;
    if (raw != null && raw !== '') {
      return parseBooleanEnv(raw);
    }

    // Default: registration is open.
    // This is a self-hosted management tool — network access is the security boundary.
    // Operators who want to lock down sign-ups after initial setup can set
    // AUTH_REGISTRATION_ENABLED=false in cwm.conf.
    return true;
  }

  private resolveCmsCaCert(args: Record<string, string>): string | undefined {
    const certPath = args.CMS_CA_CERT_PATH ?? process.env.CMS_CA_CERT_PATH;
    if (!certPath) {
      return undefined;
    }

    if (!fs.existsSync(certPath)) {
      throw new Error(`CMS CA certificate file not found: ${certPath}`);
    }

    return fs.readFileSync(certPath, 'utf8');
  }

  private resolveLogToFile(args: Record<string, string>): boolean {
    const raw = args.LOG_TO_FILE ?? process.env.LOG_TO_FILE;
    if (raw != null && raw !== '') {
      return parseBooleanEnv(raw);
    }

    // On by default — this is the whole point of the feature. Operators who
    // only want console/journald output can set LOG_TO_FILE=false.
    return true;
  }

  private resolveLogAppendOnRestart(args: Record<string, string>): boolean {
    const raw = args.LOG_APPEND_ON_RESTART ?? process.env.LOG_APPEND_ON_RESTART;
    if (raw != null && raw !== '') {
      return parseBooleanEnv(raw);
    }

    // Default: keep logs across restarts (safer for post-incident analysis).
    return true;
  }

  private setAllowedOrigins(allowedOrigins: string | undefined, desktopMode: boolean): void {
    if (desktopMode) {
      if (!allowedOrigins?.trim()) {
        throw new Error('ALLOWED_ORIGINS is required when CWM_DESKTOP=1.');
      }
      this.allowedOrigins = allowedOrigins.split(',').map((s) => s.trim()).filter(Boolean);
      console.log('[ConfigService] Allowed Origins (desktop):', this.allowedOrigins);
      return;
    }

    if (this.isProduction()) {
      if (allowedOrigins) {
        this.allowedOrigins = allowedOrigins
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        this.allowedOrigins = [];
      }
    } else {
      this.allowedOrigins = ['*'];
    }
    console.log('[ConfigService] Allowed Origins:', this.allowedOrigins);
  }
}
