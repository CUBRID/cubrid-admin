import { Test, TestingModule } from '@nestjs/testing';
import { LogService } from './log.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { HostService } from '@host';
import { DatabaseUserService } from '@database/user/database-user.service';

describe('LogService', () => {
  let service: LogService;
  const postAuthenticated = jest.fn();
  const findHostInternal = jest.fn();
  const ensureDbLogin = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    findHostInternal.mockResolvedValue({ address: 'localhost', port: 8001, token: 'cms-token' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        { provide: CmsHttpsClientService, useValue: { postAuthenticated } },
        { provide: HostService, useValue: { findHostInternal } },
        { provide: DatabaseUserService, useValue: { ensureDbLogin } },
      ],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  it('preserves access-log metadata from CMS', async () => {
    const logfileinfo = [{ logfile: [{ type: 'access', path: '/cubrid/log/broker/query_editor.access' }] }];
    postAuthenticated.mockResolvedValue({ status: 'success', broker: 'query_editor', logfileinfo });
    await expect(service.getBrokerLogList('user', 'host', 'query_editor'))
      .resolves.toEqual({ broker: 'query_editor', logfileinfo });
  });

  it.each([[['client connected']], [[]]])('returns access-log lines without the CMS envelope: %j', async (line) => {
    const path = '/cubrid/log/broker/query_editor.access';
    const data = { path, log: [{ line }], start: '1', end: String(line.length), total: String(line.length) };
    postAuthenticated.mockResolvedValue({ ...data, status: 'success', note: 'none', task: 'viewlog', __EXEC_TIME: '0 ms' });
    await expect(service.viewLog('user', 'host', path, '1', '100')).resolves.toEqual(data);
    expect(postAuthenticated).toHaveBeenCalledWith('https://localhost:8001/cm_api', {
      task: 'viewlog', path, start: '1', end: '100', token: 'cms-token',
    });
  });

  it('rejects a CMS file-open failure rather than treating it as log content', async () => {
    postAuthenticated.mockResolvedValue({ status: 'failure', note: 'Cannot open file', err: 'not log content' });
    await expect(service.viewLog('user', 'host', '/missing.access', '1', '100')).rejects.toBeDefined();
  });
  it('captures all lines with exactly one bounded CMS request', async () => {
    const lines = Array(1003).fill('log line');
    postAuthenticated.mockResolvedValue({ status: 'success', note: 'none', task: 'viewlog', total: '1003', log: [{ line: lines }] });
    await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).resolves.toEqual({
      path: '/broker.sql.log', start: '1', end: '1003', total: '1003', log: [{ line: lines }],
    });
    expect(postAuthenticated).toHaveBeenCalledTimes(1);
    expect(postAuthenticated).toHaveBeenCalledWith('https://localhost:8001/cm_api', {
      task: 'viewlog', path: '/broker.sql.log', start: '1', end: '500000', token: 'cms-token',
    }, { timeoutMs: 120_000, maxResponseBytes: 64 * 1024 * 1024 });
  });

  it.each([500001, 2000000])('rejects logs with %i lines without reading another range, saying the limits', async total => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: String(total), log: [] });
    const refused = service.captureLogSnapshot('user', 'host', '/broker.sql.log');
    await expect(refused).rejects.toMatchObject({ status: 413 });
    await expect(refused).rejects.toMatchObject({ response: expect.objectContaining({
      code: 'LOG_TOO_LARGE', maxLines: 500_000, maxBytes: 64 * 1024 * 1024,
      message: 'Log exceeds the analysis limit (500,000 lines or 64 MiB). Select a smaller archived log.',
    }) });
    expect(postAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized byte payload', async () => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: '1', log: [{ line: ['x'.repeat(64 * 1024 * 1024)] }] });
    await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).rejects.toMatchObject({ status: 413 });
  });

  describe('cwm.conf TOPSQL_MAX_LOG_LINES / TOPSQL_MAX_LOG_MB', () => {
    afterEach(() => {
      delete process.env.TOPSQL_MAX_LOG_LINES;
      delete process.env.TOPSQL_MAX_LOG_MB;
    });

    it('reads up to the set limits, with a time limit that grows with the size', async () => {
      process.env.TOPSQL_MAX_LOG_LINES = '2000000';
      process.env.TOPSQL_MAX_LOG_MB = '256';
      postAuthenticated.mockResolvedValue({ status: 'success', total: '0', log: [] });
      await service.captureLogSnapshot('user', 'host', '/broker.sql.log');
      expect(postAuthenticated).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ end: '2000000' }),
        { timeoutMs: 480_000, maxResponseBytes: 256 * 1024 * 1024 });
    });

    it('says the set limits when refusing', async () => {
      process.env.TOPSQL_MAX_LOG_LINES = '100000';
      process.env.TOPSQL_MAX_LOG_MB = '16';
      postAuthenticated.mockResolvedValue({ status: 'success', total: '100001', log: [] });
      await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).rejects.toMatchObject({
        response: expect.objectContaining({ maxLines: 100_000, maxBytes: 16 * 1024 * 1024,
          message: 'Log exceeds the analysis limit (100,000 lines or 16 MiB). Select a smaller archived log.' }),
      });
    });

    it.each([['0', '0'], ['3000000', '300'], ['many', '-1']])('uses the defaults for %p lines / %p MiB', async (lines, mb) => {
      process.env.TOPSQL_MAX_LOG_LINES = lines;
      process.env.TOPSQL_MAX_LOG_MB = mb;
      postAuthenticated.mockResolvedValue({ status: 'success', total: '0', log: [] });
      await service.captureLogSnapshot('user', 'host', '/broker.sql.log');
      expect(postAuthenticated).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ end: '500000' }),
        { timeoutMs: 120_000, maxResponseBytes: 64 * 1024 * 1024 });
    });
  });

  it('rejects an incomplete capture', async () => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: '1003', log: [{ line: ['one line'] }] });
    await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).rejects.toMatchObject({ status: 409 });
  });

  it('accepts an empty capture', async () => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: '0', log: [] });
    expect((await service.captureLogSnapshot('user', 'host', '/broker.sql.log')).total).toBe('0');
  });

  it('reads no database log list for a database the user is not logged in to', async () => {
    ensureDbLogin.mockRejectedValue(new Error('MISSING_DB_CREDENTIALS'));

    await expect(service.getDatabaseLogList('u1', 'h1', 'demodb')).rejects.toThrow('MISSING_DB_CREDENTIALS');
    expect(postAuthenticated).not.toHaveBeenCalled();
  });

  it('reads the database log list once the user is logged in', async () => {
    ensureDbLogin.mockResolvedValue(undefined);
    postAuthenticated.mockResolvedValue({ task: 'getloginfo', status: 'success', note: 'none', dbname: 'demodb', loginfo: [] });

    await expect(service.getDatabaseLogList('u1', 'h1', 'demodb')).resolves.toEqual({ dbname: 'demodb', loginfo: [] });
    expect(ensureDbLogin).toHaveBeenCalledWith('u1', 'h1', 'demodb');
  });
});
