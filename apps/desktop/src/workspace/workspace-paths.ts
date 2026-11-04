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

// Windows: a new random pipe name each time, known only to this process
// and the server it starts.
function buildSocketPath(dataDir: string): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\cwm-webmanager-${crypto.randomBytes(16).toString('hex')}`;
  }

  return path.join(dataDir, 'api.sock');
}

/** The workspace's paths: the configured one (resolveWorkspaceRoot), or `root`. */
export function resolveWorkspacePaths(root: string = resolveWorkspaceRoot()): WorkspacePaths {
  const workspaceRoot = path.resolve(root);
  const dataDir = path.join(workspaceRoot, 'data');
  const storageDir = path.join(dataDir, 'storage');
  const sslDir = path.join(workspaceRoot, 'ssl');

  return {
    workspaceRoot,
    dataDir,
    storageDir,
    sslDir,
    socketPath: buildSocketPath(dataDir),
    sslCertPath: path.join(sslDir, 'cert.pem'),
    sslKeyPath: path.join(sslDir, 'key.pem'),
  };
}

/**
 * Creates what a workspace needs that is missing. data/ (secrets, user data,
 * the server's socket) is owner-only, also when it already existed.
 */
export function ensureWorkspaceDirectories(paths: WorkspacePaths): void {
  fs.mkdirSync(paths.dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(paths.dataDir, 0o700);
  fs.mkdirSync(paths.storageDir, { recursive: true });
  fs.mkdirSync(paths.sslDir, { recursive: true });
}

export function assertWorkspaceWritable(workspaceRoot: string): void {
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.accessSync(workspaceRoot, fs.constants.W_OK);
}
