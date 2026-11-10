import * as path from 'path';
import { app } from 'electron';
import { getRepoRoot } from '../config/portable-root';
import { resolveWorkspacePaths, type WorkspacePaths } from './workspace-paths';

export { getRepoRoot };

let cachedPaths: WorkspacePaths | null = null;

/** The workspace in use: the one the server was started on, else the configured one. */
export function getWorkspacePaths(): WorkspacePaths {
  if (!cachedPaths) {
    cachedPaths = resolveWorkspacePaths();
  }

  return cachedPaths;
}

/** Re-reads the configured workspace (desktop-settings.json). */
export function refreshWorkspacePaths(): WorkspacePaths {
  cachedPaths = resolveWorkspacePaths();
  return cachedPaths;
}

/** Makes `paths` the workspace in use (its socket name included, a random one on Windows). */
export function setWorkspacePathsInUse(paths: WorkspacePaths): void {
  cachedPaths = paths;
}

export function getRendererDistDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web-manager');
  }

  return path.join(getRepoRoot(), 'dist/apps/web-manager');
}

export function getApiServerDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'api-server');
  }

  return path.join(getRepoRoot(), 'dist/apps/api-server');
}

export function getApiServerEntry(): string {
  return path.join(getApiServerDir(), 'main.js');
}
