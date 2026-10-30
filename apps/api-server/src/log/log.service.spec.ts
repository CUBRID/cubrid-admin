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
});
