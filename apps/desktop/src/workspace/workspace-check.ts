import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { isPathInsideAppBundle } from '../config/portable-root';
import { isWorkspaceLockedByOther } from './instance-lock';
import { assertWorkspaceWritable, resolveWorkspacePaths, type WorkspacePaths } from './workspace-paths';

// Longest socket path the OS takes (sockaddr_un.sun_path less its NUL).
const SOCKET_PATH_LIMIT: Partial<Record<NodeJS.Platform, number>> = { darwin: 103, linux: 107 };

/**
 * An error the workspace settings page words in the UI language: `code`,
 * then the OS reason after ": " when there is one.
 */
export class WorkspaceError extends Error {
  constructor(code: string, reason?: string) {
    super(reason ? `${code}: ${reason}` : code);
  }
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Throws a WorkspaceError unless `root` can hold a workspace: not inside the
 * app bundle, readable and writable, its data/ and ssl/ folders can be made,
 * the server's socket fits the OS limit and can be created there, and no
 * other running app uses it.
 */
export async function checkWorkspaceRoot(root: string): Promise<WorkspacePaths> {
  if (!root?.trim()) {
    throw new WorkspaceError('WORKSPACE_PATH_REQUIRED');
  }
  const paths = resolveWorkspacePaths(root.trim());
  if (isPathInsideAppBundle(paths.workspaceRoot)) {
    throw new WorkspaceError('WORKSPACE_IN_APP_BUNDLE');
  }
  try {
    assertWorkspaceWritable(paths.workspaceRoot);
  } catch (error) {
    const reason = reasonOf(error);
    throw reason.startsWith('WORKSPACE_') ? error : new WorkspaceError('WORKSPACE_NOT_WRITABLE', reason);
  }
  try {
    fs.accessSync(paths.workspaceRoot, fs.constants.R_OK);
  } catch (error) {
    throw new WorkspaceError('WORKSPACE_NOT_READABLE', reasonOf(error));
  }
  for (const dir of [paths.dataDir, paths.sslDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw new WorkspaceError('WORKSPACE_CANNOT_CREATE_FOLDER', `${dir}: ${reasonOf(error)}`);
    }
  }
  if (isWorkspaceLockedByOther(paths.dataDir)) {
    throw new WorkspaceError('WORKSPACE_IN_USE');
  }
  const limit = SOCKET_PATH_LIMIT[process.platform];
  if (limit !== undefined) {
    if (Buffer.byteLength(paths.socketPath) > limit) {
      throw new WorkspaceError('WORKSPACE_PATH_TOO_LONG', `${paths.socketPath} (${Buffer.byteLength(paths.socketPath)} > ${limit} bytes)`);
    }
    await probeSocket(path.join(paths.dataDir, `.probe-${process.pid}.sock`));
  }
  return paths;
}

/** Creates and removes a socket in the workspace, as the server will (some file systems refuse them). */
async function probeSocket(socketPath: string): Promise<void> {
  const server = net.createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => resolve());
    });
  } catch (error) {
    throw new WorkspaceError('WORKSPACE_SOCKET_FAILED', reasonOf(error));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(socketPath, { force: true });
  }
}
