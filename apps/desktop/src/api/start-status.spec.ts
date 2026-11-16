import {
  askKeepWaiting,
  decideApiStart,
  getApiStartStatus,
  isApiStartStopRequested,
  onApiStartStatus,
  resetApiStartStop,
  setApiStartStatus,
} from './start-status';

describe('api start status', () => {
  afterEach(() => {
    setApiStartStatus({ state: 'idle' });
    resetApiStartStop();
  });

  it('takes Stop after the question was already answered with Keep waiting', async () => {
    const first = askKeepWaiting(120_000);
    decideApiStart('wait');
    await expect(first).resolves.toBe('wait');
    expect(isApiStartStopRequested()).toBe(false);
    decideApiStart('stop');
    expect(isApiStartStopRequested()).toBe(true);
    resetApiStartStop();
    expect(isApiStartStopRequested()).toBe(false);
  });

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
