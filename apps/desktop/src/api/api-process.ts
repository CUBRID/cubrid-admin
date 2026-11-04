import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import { DESKTOP_API_BASE_URL } from '../config/constants';
import { resolveDesktopAllowedOrigin } from '../protocol/origin';
import { getApiServerDir, getApiServerEntry } from '../workspace/paths';
import type { WorkspacePaths } from '../workspace/workspace-paths';

const STDERR_TAIL_LINES = 20;

export type ApiProcessHandle = {
  child: ChildProcess;
  socketPath: string;
  apiBaseUrl: string;
  /** Resolves when the server process ends, with its exit code. */
  exited: Promise<number | null>;
  /** The last lines the server wrote to stderr, for a start that failed. */
  stderrTail: () => string;
};

function getNodeExecutable(): string {
  return process.execPath;
}

export function startApiServer(paths: WorkspacePaths, secrets: { seed: string; salt: string }): ApiProcessHandle {
  const entry = getApiServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`API server entry not found: ${entry}. Run nx build api-server first.`);
  }

  const child = spawn(getNodeExecutable(), [entry], {
    cwd: getApiServerDir(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      CWM_DESKTOP: '1',
      ENVIRONMENT: 'development',
      LISTEN_UNIX_SOCKET: paths.socketPath,
      SEED: secrets.seed,
      SALT: secrets.salt,
      STORAGE_PATH: paths.storageDir,
      CWM_SSL_DIR: paths.sslDir,
      ALLOWED_ORIGINS: resolveDesktopAllowedOrigin(),
    },
    stdio: ['ignore', 'inherit', 'pipe'],
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

  return { child, socketPath: paths.socketPath, apiBaseUrl: DESKTOP_API_BASE_URL, exited, stderrTail: () => tail.join('\n') };
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
