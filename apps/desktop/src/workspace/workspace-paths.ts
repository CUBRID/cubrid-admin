import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
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

/**
 * Whether two workspace folders are the same folder: resolved against the
 * current directory, with symbolic links followed (/tmp and /private/tmp on
 * macOS), '~' expanded, and case ignored where the file system usually does
 * (macOS, Windows; there C:/ and C:\ are one). A folder that does not exist
 * yet is compared by its resolved path.
 */
export function isSameWorkspaceFolder(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const canonical = (value: string) => {
    const expanded = value.trim().replace(/^~(?=$|[\\/])/, os.homedir());
    const resolved = path.resolve(expanded);
    let real = resolved;
    try {
      real = fs.realpathSync.native(resolved);
    } catch {
      // Not there yet: the resolved path is all there is.
    }
    const normalized = path.normalize(real).replace(/[\\/]+$/, '') || path.sep;
    return platform === 'darwin' || platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  return canonical(a) === canonical(b);
}

