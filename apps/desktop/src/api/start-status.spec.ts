import { askKeepWaiting, decideApiStart, getApiStartStatus, onApiStartStatus, setApiStartStatus } from './start-status';

describe('api start status', () => {
  afterEach(() => setApiStartStatus({ state: 'idle' }));

  it('passes every change to the page', () => {
    const seen: string[] = [];
    onApiStartStatus((status) => seen.push(status.state));
    setApiStartStatus({ state: 'starting', elapsedMs: 0 });
    expect(getApiStartStatus()).toEqual({ state: 'starting', elapsedMs: 0 });
    expect(seen).toEqual(['starting']);
  });

  it('resolves the slow question with the page answer', async () => {
    const answer = askKeepWaiting(120_000);
    expect(getApiStartStatus()).toEqual({ state: 'slow', elapsedMs: 120_000 });
    decideApiStart('stop');
    await expect(answer).resolves.toBe('stop');
  });

  it('drops an open question when the start ends (ready or failed) before an answer', async () => {
    const answer = askKeepWaiting(120_000);
    setApiStartStatus({ state: 'idle' });
    await expect(answer).resolves.toBe('wait');
  });
});
