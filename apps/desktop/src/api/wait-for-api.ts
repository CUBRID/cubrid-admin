import * as net from 'net';
import type { ApiSignal } from './api-process';
import type { ApiStartDecision } from './start-status';

// After this long the user is asked whether to keep waiting; nothing fails
// just because a start is slow (an old CPU, antivirus scanning the app on its
// first run, the x64 build under Rosetta: about 36 s measured).
export const SOFT_LIMIT_MS = 120_000;
const RETRY_INTERVAL_MS = 250;
const PROGRESS_INTERVAL_MS = 1_000;

/** The user stopped a slow start (Stop on the slow notice). */
export class ApiStartStoppedError extends Error {
  constructor() {
    super('The server start was stopped.');
  }
}

export type WaitOptions = {
  /** Called about once a second while it waits. */
  onProgress?: (elapsedMs: number) => void;
  /** Called after each softLimitMs of waiting; "stop" ends the wait. */
  onSoftLimit?: (elapsedMs: number) => Promise<ApiStartDecision>;
  softLimitMs?: number;
};

/**
 * Waits for the server, as long as it runs:
 * - "ready" from the server, or an answer on its socket → done;
 * - "failed" from the server, or the server ended → throws at once, with the reason;
 * - still starting → keeps waiting, reporting progress; after each soft limit
 *   asks onSoftLimit, and stops only when the answer is "stop".
 */
export async function waitForApiReady(
  socketPath: string,
  exited: Promise<unknown>,
  signal: Promise<ApiSignal> = new Promise(() => undefined),
  { onProgress, onSoftLimit, softLimitMs = SOFT_LIMIT_MS }: WaitOptions = {}
): Promise<void> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  const seconds = () => `${Math.round(elapsed() / 1000)} s`;
  let ended = false;
  let sent: ApiSignal | null = null;
  let decision: ApiStartDecision | null = null;
  let asking = false;
  let nextSoftLimit = softLimitMs;
  let nextProgress = 0;
  void exited.then(() => {
    ended = true;
  });
  void signal.then((value) => {
    sent = value;
  });

  for (;;) {
    const received = sent as ApiSignal | null;
    if (received?.state === 'ready') return;
    if (received?.state === 'failed') {
      throw new Error(`API server could not start: ${received.code} ${received.message} (after ${seconds()})`);
    }
    if (ended) {
      throw new Error(`API server exited before it was ready on ${socketPath} (after ${seconds()})`);
    }
    if (await tryConnect(socketPath)) return;
    if (decision === 'stop') throw new ApiStartStoppedError();
    if (decision === 'wait') decision = null;

    if (onProgress && elapsed() >= nextProgress) {
      onProgress(elapsed());
      nextProgress = elapsed() + PROGRESS_INTERVAL_MS;
    }
    if (onSoftLimit && !asking && elapsed() >= nextSoftLimit) {
      asking = true;
      void onSoftLimit(elapsed()).then((answer) => {
        asking = false;
        decision = answer;
        nextSoftLimit = elapsed() + softLimitMs;
      });
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }
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
