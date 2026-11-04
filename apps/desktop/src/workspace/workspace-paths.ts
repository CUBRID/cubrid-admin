import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { loadDesktopSettings } from '../config/desktop-settings';
import { getPortableAppRoot } from '../config/portable-root';

export type WorkspacePaths = {
  workspaceRoot: string;
  dataDir: string;
  storageDir: string;
  sslDir: string;
  socketPath: string;
  sslCertPath: string;
  sslKeyPath: string;
};

export function getDefaultWorkspaceRoot(): string {
  return path.join(getPortableAppRoot(), 'cwm-workspace');
}

export function resolveWorkspaceRoot(): string {
  const configured = loadDesktopSettings().workspaceRoot?.trim();
  return configured ? path.resolve(configured) : getDefaultWorkspaceRoot();
}

function buildSocketPath(workspaceRoot: string, dataDir: string): string {
  if (process.platform === 'win32') {
    const id = crypto.createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\cwm-webmanager-${id}`;
  }

  return path.join(dataDir, 'api.sock');
}

export function resolveWorkspacePaths(): WorkspacePaths {
  const workspaceRoot = resolveWorkspaceRoot();
  const dataDir = path.join(workspaceRoot, 'data');
  const storageDir = path.join(dataDir, 'storage');
  const sslDir = path.join(workspaceRoot, 'ssl');

  return {
    workspaceRoot,
    dataDir,
    storageDir,
    sslDir,
    socketPath: buildSocketPath(workspaceRoot, dataDir),
    sslCertPath: path.join(sslDir, 'cert.pem'),
    sslKeyPath: path.join(sslDir, 'key.pem'),
  };
}

export function ensureWorkspaceDirectories(paths: WorkspacePaths): void {
  fs.mkdirSync(paths.storageDir, { recursive: true });
  fs.mkdirSync(paths.sslDir, { recursive: true });
}

export function removeStaleUnixSocket(socketPath: string): void {
  if (process.platform === 'win32') {
    return;
  }

  try {
    fs.unlinkSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/** Throws WORKSPACE_NOT_WRITABLE (see DesktopWorkspaceSettingsPage) with the OS reason. */
export function assertWorkspaceWritable(workspaceRoot: string): void {
  try {
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.accessSync(workspaceRoot, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`WORKSPACE_NOT_WRITABLE: ${(error as Error).message}`);
  }
}
