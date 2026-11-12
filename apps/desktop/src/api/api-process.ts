import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DESKTOP_API_BASE_URL } from '../config/constants';
import { resolveDesktopAllowedOrigin } from '../protocol/origin';
import { getApiServerDir, getApiServerEntry } from '../workspace/paths';
import type { WorkspacePaths } from '../workspace/workspace-paths';

const STDERR_TAIL_LINES = 20;

/** What the server says over its IPC channel while it starts (apps/api-server util/desktop-signal.ts). */
export type ApiSignal = { state: 'ready' } | { state: 'failed'; code: string; message: string };

export type ApiProcessHandle = {
  child: ChildProcess;
  socketPath: string;
  apiBaseUrl: string;
  /** Resolves when the server process ends, with its exit code. */
  exited: Promise<number | null>;
  /** The last lines the server wrote to stderr, for a start that failed. */
  stderrTail: () => string;
  /** Resolves with the server's first start-up signal ("ready" or "failed"); never, if it sends none. */
  signal: Promise<ApiSignal>;
};

function getNodeExecutable(): string {
  return process.execPath;
}

/**
 * The server's environment. Every folder the server writes to is in the
 * workspace: the server's own defaults (logs/, ssl/, storage beside main.js)
 * would point into the installed app, which is read-only or root-owned
 * (/Applications, /opt, AppImage) or a temporary folder (Windows portable).
 * CWM_HOME is removed (even when set in the environment): it would make the
 * server keep its own cwm-vault and files outside the workspace.
 */
export function apiServerEnv(
  paths: WorkspacePaths,
  secrets: { seed: string; salt: string },
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { CWM_HOME, ...inherited } = baseEnv;
  return {
    ...inherited,
    ELECTRON_RUN_AS_NODE: '1',
    CWM_DESKTOP: '1',
    ENVIRONMENT: 'development',
    LISTEN_UNIX_SOCKET: paths.socketPath,
    SEED: secrets.seed,
    SALT: secrets.salt,
    STORAGE_PATH: paths.storageDir,
    CWM_SSL_DIR: paths.sslDir,
    LOG_DIR: path.join(paths.workspaceRoot, 'logs'),
    ALLOWED_ORIGINS: resolveDesktopAllowedOrigin(),
    // Settings the server reads from cwm.conf (such as how many requests
    // go to one CMS host at once) live in the workspace.
    CWM_CONF_PATH: path.join(paths.workspaceRoot, 'conf', 'cwm.conf'),
  };
}

export function startApiServer(paths: WorkspacePaths, secrets: { seed: string; salt: string }): ApiProcessHandle {
  const entry = getApiServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`API server entry not found: ${entry}. Run nx build api-server first.`);
  }

  const child = spawn(getNodeExecutable(), [entry], {
    cwd: getApiServerDir(),
    env: apiServerEnv(paths, secrets),
    // 'ipc': the server says "ready" or "failed" (and why) over it.
    stdio: ['ignore', 'inherit', 'pipe', 'ipc'],
  });

  const signal = new Promise<ApiSignal>((resolve) => {
    child.on('message', (message: unknown) => {
      const sent = (message as { cwmApi?: ApiSignal } | null)?.cwmApi;
      if (sent && (sent.state === 'ready' || sent.state === 'failed')) {
        resolve(sent);
      }
    });
  });

  // stderr still reaches the console; its last lines are kept for an error.
  const tail: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    tail.push(...chunk.toString('utf8').split('\n').filter((line) => line.trim() !== ''));
    tail.splice(0, Math.max(0, tail.length - STDERR_TAIL_LINES));
  });

  child.on('error', (error) => {
    console.error('[desktop] API process failed to start', error);
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', () => resolve(null));
  });

  return {
    child,
    socketPath: paths.socketPath,
    apiBaseUrl: DESKTOP_API_BASE_URL,
    exited,
    stderrTail: () => tail.join('\n'),
    signal,
  };
}

export function stopApiServer(child: ChildProcess | null, options?: { force?: boolean }): void {
  if (!child || child.killed || child.pid == null) {
    return;
  }

  const force = options?.force ?? false;
  const pid = child.pid;

  try {
    child.kill(force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    // process may already be gone
  }

  if (force) {
    return;
  }

  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    // already exited
  }
}
