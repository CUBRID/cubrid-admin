import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@config/config.service';
import { HostService } from '@host';
import { EncryptionService } from '@security';
import { CmsHttpsClientService } from './cms-https-client.service';
import { of, Subject, throwError } from 'rxjs';

describe('CmsHttpsClientService', () => {
  let service: CmsHttpsClientService;
  const post = jest.fn();

  beforeEach(async () => {
    post.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsHttpsClientService,
        { provide: HttpService, useValue: { post } },
        { provide: HostService, useValue: {} },
        { provide: EncryptionService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            getCmsRejectUnauthorized: jest.fn().mockReturnValue(false),
            getCmsCaCert: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CmsHttpsClientService>(CmsHttpsClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('bounds volume reads without changing write or explicit job deadlines', async () => {
    post.mockReturnValue(of({ data: { status: 'success' } }));
    await service.postAuthenticated('https://cms/cm_api', { task: 'dbspaceinfo', token: 'test' });
    expect(post.mock.calls[0][2].timeout).toBe(30000);
    await service.postAuthenticated('https://cms/cm_api', { task: 'setautoexecquery', token: 'test' });
    expect(post.mock.calls[1][2].timeout).toBeUndefined();
    await service.postAuthenticated('https://cms/cm_api', { task: 'dbspaceinfo', token: 'test' }, { timeoutMs: 120000 });
    expect(post.mock.calls[2][2].timeout).toBe(120000);
  });

  it('applies the snapshot response limit only to the requested call', async () => {
    post.mockReturnValue(of({ data: { status: 'success' } }));
    await service.postAuthenticated('https://cms/cm_api', { task: 'viewlog', token: 'test' },
      { timeoutMs: 30_000, maxResponseBytes: 16 * 1024 * 1024 });
    expect(post.mock.calls[0][2]).toMatchObject({ timeout: 30_000, maxContentLength: 16 * 1024 * 1024 });
    await service.postAuthenticated('https://cms/cm_api', { task: 'viewlog', token: 'test' });
    expect(post.mock.calls[1][2].maxContentLength).toBeUndefined();
    expect(post.mock.calls[1][2].timeout).toBeUndefined();
  });

  it('reports an exceeded response limit without retrying or misreporting a timeout', async () => {
    post.mockReturnValue(throwError(() => Object.assign(new Error('maxContentLength size exceeded'),
      { code: 'ERR_BAD_RESPONSE', request: {} })));
    await expect(service.postAuthenticated('https://cms/cm_api', { task: 'viewlog', token: 'test' },
      { maxResponseBytes: 16 * 1024 * 1024 })).rejects.toMatchObject({
        code: 'REQUEST_FAILED', additionalData: { message: expect.stringContaining('analysis size limit') },
      });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('releases the host queue after a failed read without retrying it', async () => {
    const blocked = new Subject();
    post.mockReturnValueOnce(blocked).mockReturnValue(of({ data: { status: 'success' } }));
    const read = service.postAuthenticated('https://cms/cm_api', { task: 'dbspaceinfo', token: 'test' });
    const failure = expect(read).rejects.toBeDefined();
    const write = service.postAuthenticated('https://cms/cm_api', { task: 'setautoexecquery', token: 'test' });
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);
    blocked.error(Object.assign(new Error('timeout'), { code: 'ECONNABORTED', request: {} }));
    await failure;
    await expect(write).resolves.toEqual({ status: 'success' });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1].task).toBe('setautoexecquery');
  });

  it('does not block another host behind a pending read', async () => {
    const blocked = new Subject();
    post.mockReturnValueOnce(blocked).mockReturnValue(of({ data: { status: 'success' } }));
    const read = service.postAuthenticated('https://first/cm_api', { task: 'dbspaceinfo', token: 'test' });
    await expect(service.postAuthenticated('https://second/cm_api', { task: 'gethoststat', token: 'test' })).resolves.toEqual({ status: 'success' });
    blocked.next({ data: { status: 'success' } });
    blocked.complete();
    await read;
  });

  it('retries an explicit CMS query-list timeout once', async () => {
    post.mockReturnValueOnce(of({ data: { status: 'failure', note: 'timeout' } }))
      .mockReturnValueOnce(of({ data: { status: 'success', planlist: [] } }));
    await expect(service.postAuthenticated('https://cms/cm_api', { task: 'getautoexecquery', token: 'test' }))
      .resolves.toEqual({ status: 'success', planlist: [] });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('stops after the second timeout and never retries writes or other errors', async () => {
    post.mockReturnValue(of({ data: { status: 'failure', note: 'timeout' } }));
    await service.postAuthenticated('https://cms/cm_api', { task: 'getautoexecquery', token: 'test' });
    expect(post).toHaveBeenCalledTimes(2);
    post.mockClear();
    await service.postAuthenticated('https://cms/cm_api', { task: 'setautoexecquery', token: 'test' });
    expect(post).toHaveBeenCalledTimes(1);
    post.mockClear().mockReturnValue(of({ data: { status: 'failure', note: 'permission denied' } }));
    await service.postAuthenticated('https://cms/cm_api', { task: 'getautoexecquery', token: 'test' });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
