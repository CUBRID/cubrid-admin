import { failedSignal, sendDesktopSignal } from './desktop-signal';

describe('sendDesktopSignal', () => {
  const realSend = process.send;
  const realConnected = Object.getOwnPropertyDescriptor(process, 'connected');
  const realDesktop = process.env.CWM_DESKTOP;
  let send: jest.Mock;

  beforeEach(() => {
    send = jest.fn();
    process.send = send as unknown as typeof process.send;
    Object.defineProperty(process, 'connected', { value: true, configurable: true });
  });

  afterEach(() => {
    process.send = realSend;
    if (realConnected) Object.defineProperty(process, 'connected', realConnected);
    else delete (process as { connected?: boolean }).connected;
    if (realDesktop === undefined) delete process.env.CWM_DESKTOP;
    else process.env.CWM_DESKTOP = realDesktop;
  });

  it('sends ready to the desktop app that started this server', () => {
    process.env.CWM_DESKTOP = '1';
    sendDesktopSignal({ state: 'ready' });
    expect(send).toHaveBeenCalledWith({ cwmApi: { state: 'ready' } });
  });

  it('sends nothing for the standalone server, even with an IPC channel', () => {
    delete process.env.CWM_DESKTOP;
    sendDesktopSignal({ state: 'ready' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing in desktop mode without an IPC channel', () => {
    process.env.CWM_DESKTOP = '1';
    process.send = undefined;
    expect(() => sendDesktopSignal({ state: 'ready' })).not.toThrow();
  });

  it('describes a start-up error with its code and message', () => {
    const error = Object.assign(new Error('listen EADDRINUSE: address already in use /x/api.sock'), { code: 'EADDRINUSE' });
    expect(failedSignal(error)).toEqual({ state: 'failed', code: 'EADDRINUSE', message: error.message });
    expect(failedSignal(new Error('bad secrets.json'))).toEqual({ state: 'failed', code: 'START_FAILED', message: 'bad secrets.json' });
  });
});
