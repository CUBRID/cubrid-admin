import { EventEmitter } from 'events';
import { REQUEST_ACTION, RequestAction } from './log-action.decorator';
import { formatDuration, lineLevel, requestLogMiddleware, shouldRecord } from './request-log.middleware';

function run(
  req: Record<string | symbol, unknown>,
  { status = 200, tag, locals = {} }: { status?: number; tag?: RequestAction; locals?: Record<string, unknown> } = {}
) {
  const apiLog = { record: jest.fn() };
  const logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const res = Object.assign(new EventEmitter(), { statusCode: status, locals, setHeader: jest.fn() });
  const next = jest.fn();
  const request = { method: 'GET', headers: {}, socket: { remoteAddress: '10.0.0.1' }, ...req };
  requestLogMiddleware(apiLog as any, '/api', logger as any)(request as any, res as any, next);
  if (tag) request[REQUEST_ACTION] = tag;
  res.emit('finish');
  return { apiLog, logger, res, next };
}

const tag = (action?: string, params: Record<string, string> = {}, skip = false): RequestAction => ({ action, params, skip });

describe('request log', () => {
  it('logs nothing for the web app files outside /api', () => {
    const { logger, next, res } = run({ originalUrl: '/assets/app.js' });
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(Object.values(logger).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('writes one line with user, route, status, time, target and request id', () => {
    const { logger, res } = run(
      { method: 'POST', originalUrl: '/api/h1/database/start/demodb?x=1', user: { sub: 'alice' } },
      { tag: tag('database.start', { hostUid: 'h1', dbname: 'demodb' }) }
    );
    const id = res.setHeader.mock.calls[0][1];
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toMatch(
      new RegExp(`^alice  POST  /api/h1/database/start/demodb  200  \\d+ms  demodb  ${id}$`)
    );
  });

  it('records an action with its name, host and target', () => {
    const { apiLog } = run(
      { method: 'POST', originalUrl: '/api/h1/broker/stop/query_editor', user: { sub: 'alice' } },
      { tag: tag('broker.stop', { hostUid: 'h1', bname: 'query_editor' }) }
    );
    expect(apiLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'alice', action: 'broker.stop', category: 'broker', method: 'POST',
        path: '/api/h1/broker/stop/query_editor', hostUid: 'h1', target: 'query_editor',
        status: 200, ok: true, ip: '10.0.0.1',
      })
    );
  });

  it('names the account a failed sign-in was for, with the error code and text', () => {
    const { apiLog, logger } = run(
      { method: 'POST', originalUrl: '/api/auth/login', body: { id: 'bob', password: 'x' } },
      { status: 401, tag: tag('auth.sign_in'), locals: { cwmErrorCode: 'INVALID_CREDENTIALS', cwmErrorText: 'Wrong id or password.' } }
    );
    expect(logger.warn.mock.calls[0][0]).toContain('INVALID_CREDENTIALS');
    const recorded = apiLog.record.mock.calls[0][0];
    expect(recorded).toMatchObject({ user: 'bob', ok: false, status: 401, errorCode: 'INVALID_CREDENTIALS', error: 'Wrong id or password.' });
    expect(JSON.stringify(recorded)).not.toContain('"x"');
  });

  it('does not record reads, skipped routes or polling', () => {
    expect(run({ originalUrl: '/api/jobs/recent', user: { sub: 'a' } }).apiLog.record).not.toHaveBeenCalled();
    expect(run({ method: 'POST', originalUrl: '/api/auth/refresh' }, { tag: tag(undefined, {}, true) }).apiLog.record).not.toHaveBeenCalled();
  });

  it('records a change without a name yet under its path', () => {
    const { apiLog } = run({ method: 'POST', originalUrl: '/api/new/thing', user: { sub: 'a' } });
    expect(apiLog.record).toHaveBeenCalledWith(expect.objectContaining({ category: 'other', path: '/api/new/thing' }));
  });

  it('takes the name of what was created from the body, and never shows a group id', () => {
    const add = run({ method: 'POST', originalUrl: '/api/host', user: { sub: 'a' }, body: { alias: 'prod-01', password: 'x' } }, { tag: tag('host.add') });
    expect(add.apiLog.record.mock.calls[0][0].target).toBe('prod-01');
    const del = run({ method: 'DELETE', originalUrl: '/api/host/group/g-1', user: { sub: 'a' } }, { tag: tag('host.delete_group', { groupId: 'g-1' }) });
    expect(del.apiLog.record.mock.calls[0][0].target).toBeUndefined();
  });

  it('tells disabling from enabling an account', () => {
    const off = run({ method: 'PUT', originalUrl: '/api/admin/users/bob/status', user: { sub: 'a' }, body: { status: 'disabled' } }, { tag: tag('admin.set_status', { id: 'bob' }) });
    expect(off.apiLog.record.mock.calls[0][0]).toMatchObject({ action: 'admin.disable_account', target: 'bob' });
    const on = run({ method: 'PUT', originalUrl: '/api/admin/users/bob/status', user: { sub: 'a' }, body: { status: 'active' } }, { tag: tag('admin.set_status', { id: 'bob' }) });
    expect(on.apiLog.record.mock.calls[0][0].action).toBe('admin.enable_account');
  });

  it('picks the line level from method and status', () => {
    expect(lineLevel('GET', 200)).toBe('debug');
    expect(lineLevel('GET', 401)).toBe('debug');
    expect(lineLevel('POST', 200)).toBe('log');
    expect(lineLevel('POST', 401)).toBe('warn');
    expect(lineLevel('GET', 404)).toBe('warn');
    expect(lineLevel('GET', 502)).toBe('error');
  });

  it('records server failures even on reads', () => {
    expect(shouldRecord('GET', 500, undefined)).toBe(true);
    expect(shouldRecord('GET', 404, undefined)).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(12)).toBe('12ms');
    expect(formatDuration(2345)).toBe('2.3s');
  });
});
