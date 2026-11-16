/**
 * Start-up signals for the desktop app, which starts this server as a child
 * process with an IPC channel and waits for one of them: "ready" once it
 * listens, "failed" when start-up stops on an error. They tell a slow start
 * (keep waiting) from a failed one. Sent only in desktop mode with an IPC
 * channel: the standalone server and the single executable send nothing.
 */
export type DesktopSignal = { state: 'ready' } | { state: 'failed'; code: string; message: string };

export function sendDesktopSignal(signal: DesktopSignal): void {
  if (process.env.CWM_DESKTOP !== '1' || typeof process.send !== 'function' || !process.connected) {
    return;
  }
  try {
    process.send({ cwmApi: signal });
  } catch {
    // The desktop app also watches the socket and the process.
  }
}

/** The signal for an error that stopped start-up. */
export function failedSignal(error: unknown): DesktopSignal {
  const err = error as { code?: unknown; message?: unknown } | null;
  return {
    state: 'failed',
    code: typeof err?.code === 'string' && err.code ? err.code : 'START_FAILED',
    message: typeof err?.message === 'string' ? err.message : String(error),
  };
}
