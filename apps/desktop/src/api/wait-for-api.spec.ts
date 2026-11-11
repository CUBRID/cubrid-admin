import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type { ApiSignal } from './api-process';
import { ApiStartStoppedError, SOFT_LIMIT_MS, waitForApiReady } from './wait-for-api';

const never = <T>() => new Promise<T>(() => undefined);
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('waitForApiReady', () => {
  let dir: string;
  let socketPath: string;
  let server: net.Server | null;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-wait-'));
    socketPath = path.join(dir, 'api.sock');
    server = null;
  });

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('asks only after two minutes, and has no hard timeout of its own', () => {
    expect(SOFT_LIMIT_MS).toBe(120_000);
  });

  it('waits for a slow but running server until it says "ready", reporting progress', async () => {
    const progress: number[] = [];
    const started = Date.now();
    await waitForApiReady(socketPath, never(), after<ApiSignal>(1_300, { state: 'ready' }), {
      onProgress: (ms) => progress.push(ms),
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_200);
    expect(progress.length).toBeGreaterThanOrEqual(2);
  });

  it('also takes an answer on the socket as ready (a server that sends no signal)', async () => {
    setTimeout(() => {
      server = net.createServer((socket) => socket.end());
      server.listen(socketPath);
    }, 400);
    await expect(waitForApiReady(socketPath, never(), never())).resolves.toBeUndefined();
  });

  it('fails at once with the reason when the server says "failed"', async () => {
    const started = Date.now();
    await expect(
      waitForApiReady(socketPath, never(), after<ApiSignal>(200, { state: 'failed', code: 'EADDRINUSE', message: 'address already in use' }))
    ).rejects.toThrow(/could not start: EADDRINUSE address already in use/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('fails at once when the server exits', async () => {
    await expect(waitForApiReady(socketPath, after(200, 1), never())).rejects.toThrow(/exited before it was ready/);
  });

  it('after the soft limit asks, keeps waiting on "wait", and finishes when the server is ready', async () => {
    const asked: number[] = [];
    await waitForApiReady(socketPath, never(), after<ApiSignal>(1_200, { state: 'ready' }), {
      softLimitMs: 300,
      onSoftLimit: async (ms) => {
        asked.push(ms);
        return 'wait';
      },
    });
    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(asked[0]).toBeGreaterThanOrEqual(300);
  });

  it('after the soft limit, "stop" ends the wait', async () => {
    await expect(
      waitForApiReady(socketPath, never(), never(), { softLimitMs: 300, onSoftLimit: async () => 'stop' })
    ).rejects.toBeInstanceOf(ApiStartStoppedError);
  });
});
