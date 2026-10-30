import { Test, TestingModule } from '@nestjs/testing';
import { LogService } from './log.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { HostService } from '@host';

describe('LogService', () => {
  let service: LogService;
  const postAuthenticated = jest.fn();
  const findHostInternal = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    findHostInternal.mockResolvedValue({ address: 'localhost', port: 8001, token: 'cms-token' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        { provide: CmsHttpsClientService, useValue: { postAuthenticated } },
        { provide: HostService, useValue: { findHostInternal } },
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
      task: 'viewlog', path: '/broker.sql.log', start: '1', end: '100000', token: 'cms-token',
    }, { timeoutMs: 30_000, maxResponseBytes: 16 * 1024 * 1024 });
  });

  it.each([100001, 200000])('rejects logs with %i lines without reading another range', async total => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: String(total), log: [] });
    await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).rejects.toMatchObject({ status: 413 });
    expect(postAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized byte payload', async () => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: '1', log: [{ line: ['x'.repeat(16 * 1024 * 1024)] }] });
    await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).rejects.toMatchObject({ status: 413 });
  });

  it('rejects an incomplete capture', async () => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: '1003', log: [{ line: ['one line'] }] });
    await expect(service.captureLogSnapshot('user', 'host', '/broker.sql.log')).rejects.toMatchObject({ status: 409 });
  });

  it('accepts an empty capture', async () => {
    postAuthenticated.mockResolvedValue({ status: 'success', total: '0', log: [] });
    expect((await service.captureLogSnapshot('user', 'host', '/broker.sql.log')).total).toBe('0');
  });

});
