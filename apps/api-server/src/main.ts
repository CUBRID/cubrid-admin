import { loadRuntimeEnv } from './config/load-runtime-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'module-alias/register';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import * as express from 'express';
import { getHttpsOptions, logStartupBanner, createWinstonLogger, startLogConfigWatcher } from '@util';
import { GlobalExceptionFilter } from '@error/global-filter';
import { createValidationPipe } from '@error/validation/create-validation-pipe';
import { ConfigService } from '@config/config.service';
import { SuccessResponseInterceptor, LoggingInterceptor } from '@common'; // Updated import

async function bootstrap() {
  loadRuntimeEnv();
  const httpsOptions = getHttpsOptions();
  // A standalone instance (not DI-managed) since this runs before Nest's DI
  // container exists — app.get(ConfigService) below constructs its own,
  // functionally identical instance from the same env for everything else.
  const bootConfig = new ConfigService();
  // Kept as a variable (not inlined) so logStartupBanner can log through the
  // same instance below — otherwise the banner would only reach the console
  // (via a raw console.log) and never make it into the log file.
  const appLogger = createWinstonLogger(bootConfig);
  const app = await NestFactory.create(AppModule, {
    httpsOptions,
    // Includes 'log' — LoggingInterceptor's incoming/outgoing request audit
    // trail is emitted at that level. Without it, only errors and warnings
    // would be recorded, silently dropping ordinary traffic.
    logger: appLogger,
  });
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  const configService = app.get(ConfigService);
  const port: string = configService.getPort();
  const listenHost = configService.getListenHost();
  const allowedOrigins = configService.getAllowedOrigins();
  const desktopMode = configService.isDesktopMode();

  if (allowedOrigins.includes('*')) {
    // Development mode: allow all origins.
    console.log('[main.ts] Enabling CORS for all origins (dev).');
    app.enableCors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });
  } else if (allowedOrigins.length > 0) {
    // Production with explicit whitelist: only listed origins allowed cross-origin.
    const whitelist = [...allowedOrigins];
    console.log('[main.ts] Production CORS whitelist:', whitelist);
    app.enableCors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (whitelist.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });
  }
  // else: ALLOWED_ORIGINS not configured = single-server mode.
  // The browser never applies CORS restrictions to same-origin requests,
  // so no enableCors() call is needed. Cross-origin requests are blocked
  // automatically by the browser (no ACAO header = blocked).

  // Desktop mode uses UDS + Electron proxy that strips /api — no prefix needed.
  if (!desktopMode) {
    app.setGlobalPrefix('api');
  }
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new SuccessResponseInterceptor());
  // Only affects @Body()/@Param()/@Query() parameters typed as an actual
  // class with class-validator decorators (currently just UserDTO) — every
  // other endpoint still uses plain interface types and passes through
  // untouched. See create-validation-pipe.ts for why this is safe to enable
  // globally before the rest of the API surface is migrated.
  app.useGlobalPipes(createValidationPipe());

  // Serve web-manager static files.
  // Both pkg (snapshot filesystem) and node use __dirname/public.
  // pkg embeds public/ as assets so __dirname resolves inside the snapshot.
  const publicDir = path.join(__dirname, 'public');
  // Not in the desktop app: its screens come from the Electron bundle, and
  // with no /api prefix there the SPA fallback below would answer every GET
  // (host list, conf files, ...) with index.html, so a public/ folder left
  // next to the server by a web build made the desktop screens come up empty.
  if (!desktopMode && fs.existsSync(publicDir)) {
    const expressApp = app.getHttpAdapter().getInstance();

    // PWA Service Worker registration requires a trusted SSL cert.
    // When ENABLE_PWA is not explicitly set to 'true' in cwm.conf,
    // intercept /registerSW.js with an empty script so SW is never registered.
    // This prevents SecurityError on self-signed certificates.
    const enablePwa = (process.env.ENABLE_PWA ?? '').trim() === 'true';
    if (!enablePwa) {
      // Return a script that actively unregisters any previously installed SW.
      // An empty response would leave stale service workers intercepting
      // requests even after PWA is disabled.
      expressApp.get('/registerSW.js', (_req: express.Request, res: express.Response) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.send(
          `if('serviceWorker'in navigator){` +
          `navigator.serviceWorker.getRegistrations()` +
          `.then(rs=>{for(const r of rs)r.unregister();});}`
        );
      });
    }

    expressApp.use(express.static(publicDir));
    // Exclude both /api and /api/* from SPA fallback.
    // Without (?:/|$) the lookahead /api\/ misses the bare /api path,
    // causing probes and readiness checks to receive index.html 200.
    expressApp.get(/^\/(?!api(?:\/|$)).*/, (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
    console.log('\t@ serving web-manager from:', publicDir);
  }

  const unixSocket = configService.getListenUnixSocket();
  if (unixSocket) {
    await removeStaleUnixSocket(unixSocket);
    // Desktop mode has no app login: the socket is made owner-only as it is
    // created (umask), so no other OS user can reach it, with no gap before
    // a chmod.
    const previousUmask = desktopMode ? process.umask(0o077) : null;
    try {
      await app.listen(unixSocket);
    } finally {
      if (previousUmask !== null) process.umask(previousUmask);
    }
    logStartupBanner(configService, { kind: 'unixSocket', socketPath: unixSocket }, appLogger);
    // bootConfig (not configService) — winston-logger.ts tracks the
    // instance it was actually built from, so reloads must go through that
    // same object.
    startLogConfigWatcher(bootConfig, appLogger);
    return;
  }

  // ConfigService requires the socket in desktop mode; never fall to TCP.
  if (desktopMode) {
    throw new Error('Desktop mode listens only on LISTEN_UNIX_SOCKET.');
  }

  const boundHost = listenHost ?? '0.0.0.0';
  if (listenHost) {
    await app.listen(port, listenHost);
  } else {
    await app.listen(port);
  }
  logStartupBanner(configService, { kind: 'tcp', host: boundHost, port }, appLogger);
  startLogConfigWatcher(bootConfig, appLogger);
}
bootstrap();

/**
 * Removes a socket file a server that is gone left behind. A socket that
 * another server still answers on is not taken over, and a path that is not
 * a socket (e.g. a symlink) is not removed: both stop the start.
 */
async function removeStaleUnixSocket(socketPath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }
  if (!stat.isSocket()) {
    throw new Error(`${socketPath} exists and is not a socket.`);
  }
  if (await socketAnswers(socketPath)) {
    throw new Error(`Another server is already listening on ${socketPath}.`);
  }
  fs.unlinkSync(socketPath);
}

function socketAnswers(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: socketPath }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}
