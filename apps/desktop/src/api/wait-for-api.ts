import * as net from 'net';

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_INTERVAL_MS = 250;

/**
 * Waits until the server answers on its socket. Gives up when `exited`
 * resolves (the server ended, e.g. it could not listen) or after
 * `timeoutMs`.
 */
export async function waitForApiReady(
  socketPath: string,
  exited: Promise<unknown> = new Promise(() => undefined),
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let ended = false;
  void exited.then(() => {
    ended = true;
  });

  while (Date.now() < deadline) {
    if (ended) {
      throw new Error(`API server exited before it was ready on ${socketPath}`);
    }
    const connected = await tryConnect(socketPath);
    if (connected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }

  throw new Error(`API server did not become ready on ${socketPath}`);
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
