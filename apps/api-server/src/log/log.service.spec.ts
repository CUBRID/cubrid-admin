import { Test, TestingModule } from '@nestjs/testing';
import { LogService } from './log.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { HostService } from '@host';
import { DatabaseUserService } from '@database/user/database-user.service';

describe('LogService', () => {
  let service: LogService;
  const cmsClient = { postAuthenticated: jest.fn() };
  const hostService = { findHostInternal: jest.fn().mockResolvedValue({ address: '10.0.0.1', port: 8001, token: 'tok' }) };
  const databaseUserService = { ensureDbLogin: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        { provide: CmsHttpsClientService, useValue: cmsClient },
        { provide: HostService, useValue: hostService },
        { provide: DatabaseUserService, useValue: databaseUserService },
      ],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reads no database log list for a database the user is not logged in to', async () => {
    databaseUserService.ensureDbLogin.mockRejectedValue(new Error('MISSING_DB_CREDENTIALS'));

    await expect(service.getDatabaseLogList('u1', 'h1', 'demodb')).rejects.toThrow('MISSING_DB_CREDENTIALS');
    expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
  });

  it('reads the database log list once the user is logged in', async () => {
    databaseUserService.ensureDbLogin.mockResolvedValue(undefined);
    cmsClient.postAuthenticated.mockResolvedValue({ task: 'getloginfo', status: 'success', note: 'none', dbname: 'demodb', loginfo: [] });

    await expect(service.getDatabaseLogList('u1', 'h1', 'demodb')).resolves.toEqual({ dbname: 'demodb', loginfo: [] });
    expect(databaseUserService.ensureDbLogin).toHaveBeenCalledWith('u1', 'h1', 'demodb');
  });
});
