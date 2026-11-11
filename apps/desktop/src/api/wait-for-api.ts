import * as net from 'net';

// Upper bound while the server process is still running. Its first start can
// be slow: the x64 build on Apple silicon took about 36 s while Rosetta
// translated it (measured), and slow disks or antivirus scans add more.
// A server that ends is reported at once, not after this.
export const DEFAULT_TIMEOUT_MS = 120_000;
const RETRY_INTERVAL_MS = 250;

/**
 * Waits until the server answers on its socket, as long as it runs: gives up
 * at once when `exited` resolves (the server ended, e.g. it could not listen),
 * otherwise after `timeoutMs`.
 */
export async function waitForApiReady(
  socketPath: string,
  exited: Promise<unknown> = new Promise(() => undefined),
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)} s`;
  let ended = false;
  void exited.then(() => {
    ended = true;
  });

  while (Date.now() < deadline) {
    if (ended) {
      throw new Error(`API server exited before it was ready on ${socketPath} (after ${elapsed()})`);
    }
    const connected = await tryConnect(socketPath);
    if (connected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }

  throw new Error(`API server did not become ready on ${socketPath} (waited ${elapsed()})`);
}

function tryConnect(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: socketPath }, () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
