import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@config/config.service';
import { getStoragePath } from '../resolve-storage-path';

export type StartupListenInfo =
  | { kind: 'unixSocket'; socketPath: string }
  | { kind: 'tcp'; host: string; port: string };

function resolveConfSource(): string {
  const isPkg = !!(process as any).pkg;
  const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
  const confPath = path.join(baseDir, 'conf', 'cwm.conf');
  return fs.existsSync(confPath) ? confPath : '(none found — using defaults)';
}

function resolveVaultSource(): string {
  const isPkg = !!(process as any).pkg;
  const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
  const vaultPath = path.join(baseDir, 'cwm-vault', 'secrets.json');

  if (!fs.existsSync(vaultPath)) {
    return process.env.SEED !== undefined ? 'env/.env' : '(will be generated on this run)';
  }

  // A vault file can exist on disk without actually being the source in use —
  // loadRuntimeEnv() only reads it when SEED/SALT aren't already set by a
  // higher-priority source (env/.env). Compare against the resolved SEED to
  // report which one is actually active, not just which one exists.
  try {
    const stored = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    return stored.seed === process.env.SEED ? vaultPath : 'env/.env (cwm-vault present but unused)';
  } catch {
    return vaultPath;
  }
}

function resolveTlsSource(): string {
  const certPath = process.env.SSL_CERT_PATH?.trim();
  return certPath ? `provided (${certPath})` : 'self-signed (auto-generated)';
}

/**
 * Prints one consolidated block of the operational facts an operator needs
 * to confirm right after startup — where config/secrets were sourced from,
 * where data is stored, and how the server is reachable. Previously this
 * information was scattered across several unrelated console.log calls.
 *
 * Takes the app's logger explicitly (rather than using a bare console.log)
 * so this reaches the log file too, not just the live console/journald.
 */
export function logStartupBanner(
  configService: ConfigService,
  listen: StartupListenInfo,
  logger: LoggerService
): void {
  const where =
    listen.kind === 'unixSocket'
      ? `unix socket ${listen.socketPath}`
      : `${listen.host}:${listen.port}`;

  const lines = [
    '========================================',
    ' Next CUBRID Admin — API Server',
    '========================================',
    `  Listening on      : ${where}`,
    `  Environment       : ${configService.getEnvironment()}`,
    `  Storage path      : ${getStoragePath()}`,
    `  Log path          : ${configService.isLogToFileEnabled() ? configService.getLogDir() : '(file logging disabled — console only)'}`,
    `  Log level/rotation: ${configService.getLogLevel()} | max size ${configService.getLogMaxSize()} | keep ${configService.getLogMaxFiles()} | ${configService.isLogAppendOnRestart() ? 'append' : 'overwrite'} on restart`,
    `  Config (cwm.conf) : ${resolveConfSource()}`,
    `  Secrets (vault)   : ${resolveVaultSource()}`,
    `  TLS certificate   : ${resolveTlsSource()}`,
    `  CORS origins      : ${configService.getAllowedOrigins().join(', ') || '(same-origin only)'}`,
    `  Registration open : ${configService.isAuthRegistrationEnabled()}`,
    `  CMS TLS verify    : ${configService.getCmsRejectUnauthorized()}`,
    '========================================',
  ];
  logger.log(lines.join('\n'), 'Bootstrap');
}
