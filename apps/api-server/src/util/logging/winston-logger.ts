import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@config/config.service';

// Mirrors NestJS's own level vocabulary (log/error/warn/debug/verbose) rather
// than winston's npm defaults (info/http/silly/...) so LOG_LEVEL config and
// existing call sites (this.logger.log/error/warn/debug/verbose) map 1:1.
// Lower number = higher severity, matching winston's convention: setting
// level to 'log' shows error/warn/log and suppresses debug/verbose, exactly
// like main.ts's previous `logger: ['error','warn','log']` array did.
//
// Internally uses 'info' instead of 'log' — winston's Logger class reserves
// `.log(level, message)` as its own generic dispatch method, so a custom
// level literally named 'log' collides with it ("Level \"log\" not defined:
// conflicts with the method \"log\"", thrown at startup). LOG_LEVEL config
// still accepts Nest's 'log' spelling; resolveWinstonLevel() below translates it.
const NEST_LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2, // Nest's "log"
  debug: 3,
  verbose: 4,
};

function resolveWinstonLevel(nestLevel: string): string {
  return nestLevel === 'log' ? 'info' : nestLevel;
}

const LOG_FILENAME_PATTERN = 'api-server-%DATE%.log';
const LOG_DATE_PATTERN = 'YYYY-MM-DD';

function formatMessage(message: unknown, context?: string): string {
  const body = typeof message === 'string' ? message : JSON.stringify(message);
  return context ? `[${context}] ${body}` : body;
}

function displayLevel(level: string): string {
  return level === 'info' ? 'LOG' : level.toUpperCase();
}

/** Log files: full ISO time, for reading across days and machines. */
const lineFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${displayLevel(String(level))}: ${message}`)
);

const LEVEL_COLORS: Record<string, string> = { error: '\x1b[31m', warn: '\x1b[33m', debug: '\x1b[90m', verbose: '\x1b[90m' };

/**
 * The console: local time and a fixed-width level, so a line per request
 * reads as a column. Colored only on a terminal, never in a redirected file.
 */
export function consoleLine(time: Date, level: string, message: string, color: boolean): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
  const tag = displayLevel(level).padEnd(5);
  const tint = color ? LEVEL_COLORS[level] : undefined;
  return tint ? `${clock} ${tint}${tag}\x1b[0m ${message}` : `${clock} ${tag} ${message}`;
}

const consoleFormat = winston.format.printf(({ level, message }) =>
  consoleLine(new Date(), String(level), String(message), process.stdout.isTTY === true)
);

/**
 * Nest's own start-up lines (every module loaded, every route mapped: about
 * 600 lines) say nothing an operator needs. They are kept at `verbose`.
 */
const STARTUP_CONTEXTS = new Set(['InstanceLoader', 'RoutesResolver', 'RouterExplorer', 'NestFactory', 'NestApplication']);

/**
 * Truncates today's current rotation file so a restart starts with a clean
 * file instead of appending to whatever was written earlier in the day.
 * No-ops if the file doesn't exist yet (nothing to clear).
 */
function truncateCurrentLogFile(logDir: string): void {
  const dateStr = new Date().toISOString().slice(0, 10); // matches LOG_DATE_PATTERN (YYYY-MM-DD)
  const currentFile = path.join(logDir, LOG_FILENAME_PATTERN.replace('%DATE%', dateStr));
  try {
    fs.truncateSync(currentFile, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

class WinstonNestLogger implements LoggerService {
  constructor(private readonly logger: winston.Logger) {}

  log(message: unknown, context?: string): void {
    const level = context && STARTUP_CONTEXTS.has(context) ? 'verbose' : 'info';
    this.logger.log(level, formatMessage(message, context));
  }

  error(message: unknown, trace?: string, context?: string): void {
    const body = formatMessage(message, context);
    this.logger.log('error', trace ? `${body}\n${trace}` : body);
  }

  warn(message: unknown, context?: string): void {
    this.logger.log('warn', formatMessage(message, context));
  }

  debug(message: unknown, context?: string): void {
    this.logger.log('debug', formatMessage(message, context));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.log('verbose', formatMessage(message, context));
  }
}

function buildFileTransport(configService: ConfigService): DailyRotateFile {
  const logDir = configService.getLogDir();
  fs.mkdirSync(logDir, { recursive: true });

  if (!configService.isLogAppendOnRestart()) {
    truncateCurrentLogFile(logDir);
  }

  return new DailyRotateFile({
    dirname: logDir,
    filename: LOG_FILENAME_PATTERN,
    datePattern: LOG_DATE_PATTERN,
    maxSize: configService.getLogMaxSize(),
    maxFiles: configService.getLogMaxFiles(),
    zippedArchive: true,
    format: lineFormat,
  });
}

// Module-level handles to the currently-active logger/transport/config, kept
// so reloadLogSettings() (triggered by the cwm.conf hot-reload watcher) can
// mutate the live logger in place instead of rebuilding the whole app.
let activeLogger: winston.Logger | null = null;
let activeFileTransport: DailyRotateFile | null = null;
let activeConfigService: ConfigService | null = null;

/**
 * Builds the NestJS-compatible logger used app-wide. Always logs to console;
 * additionally logs to a size/time-rotated file when LOG_TO_FILE is enabled.
 *
 * Must be constructed from a standalone `ConfigService` instance (not the
 * DI-managed one) since this runs before `NestFactory.create`, i.e. before
 * Nest's DI container exists — see main.ts.
 */
export function createWinstonLogger(configService: ConfigService): LoggerService {
  const transports: winston.transport[] = [
    new winston.transports.Console({ format: consoleFormat }),
  ];

  activeFileTransport = configService.isLogToFileEnabled() ? buildFileTransport(configService) : null;
  if (activeFileTransport) {
    transports.push(activeFileTransport);
  }

  activeLogger = winston.createLogger({
    levels: NEST_LEVELS,
    level: resolveWinstonLevel(configService.getLogLevel()),
    transports,
  });
  activeConfigService = configService;

  return new WinstonNestLogger(activeLogger);
}

/**
 * Re-applies LOG_* settings to the already-running logger without
 * restarting the process — called by watch-log-config.ts after a cwm.conf
 * edit. `configService.reloadLogSettingsFromEnv()` must be called by the
 * watcher *before* this, so the config object already reflects the new
 * values by the time this reads them.
 *
 * LOG_APPEND_ON_RESTART has no live effect here — by definition it only
 * matters at the moment a file transport is (re)constructed, which is
 * exactly what happens below if LOG_DIR/LOG_MAX_SIZE/LOG_MAX_FILES changed,
 * but not otherwise. That's an accepted limitation, not a bug: flipping it
 * doesn't retroactively truncate a file that's already mid-write.
 */
export function reloadLogSettings(): string {
  if (!activeLogger || !activeConfigService) {
    return 'logger not initialized yet';
  }
  const configService = activeConfigService;

  const newLevel = resolveWinstonLevel(configService.getLogLevel());
  if (activeLogger.level !== newLevel) {
    activeLogger.level = newLevel;
  }

  const shouldLogToFile = configService.isLogToFileEnabled();
  if (shouldLogToFile && !activeFileTransport) {
    activeFileTransport = buildFileTransport(configService);
    activeLogger.add(activeFileTransport);
  } else if (!shouldLogToFile && activeFileTransport) {
    activeLogger.remove(activeFileTransport);
    activeFileTransport = null;
  } else if (shouldLogToFile && activeFileTransport) {
    // LOG_DIR/LOG_MAX_SIZE/LOG_MAX_FILES are constructor-only options in
    // winston-daily-rotate-file — swap the transport instance to pick up
    // any change to them.
    activeLogger.remove(activeFileTransport);
    activeFileTransport = buildFileTransport(configService);
    activeLogger.add(activeFileTransport);
  }

  return (
    `level=${configService.getLogLevel()}, toFile=${shouldLogToFile}, ` +
    `dir=${configService.getLogDir()}, maxSize=${configService.getLogMaxSize()}, ` +
    `maxFiles=${configService.getLogMaxFiles()}`
  );
}
