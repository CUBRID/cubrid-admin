import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_TIMEOUT_MS, waitForApiReady } from './wait-for-api';

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

  const listenAfter = (ms: number) =>
    setTimeout(() => {
      server = net.createServer((socket) => socket.end());
      server.listen(socketPath);
    }, ms);

  it('waits well beyond 30 s by default while the server runs (a first start under Rosetta took about 36 s)', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });

  it('keeps waiting while the server is alive, until it answers', async () => {
    listenAfter(600);
    const started = Date.now();
    await expect(waitForApiReady(socketPath, new Promise(() => undefined), 5_000)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
  });

  it('fails at once when the server exits, not at the timeout', async () => {
    const exited = new Promise((resolve) => setTimeout(() => resolve(1), 300));
    const started = Date.now();
    await expect(waitForApiReady(socketPath, exited, 10_000)).rejects.toThrow(/exited before it was ready .*\(after \d+ s\)/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('gives up after the timeout while the server never answers, saying how long it waited', async () => {
    await expect(waitForApiReady(socketPath, new Promise(() => undefined), 700)).rejects.toThrow(/did not become ready .*\(waited \d+ s\)/);
  });
});
