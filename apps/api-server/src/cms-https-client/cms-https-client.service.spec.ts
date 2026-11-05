import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@config/config.service';
import { HostService } from '@host';
import { EncryptionService } from '@security';
import { CmsHttpsClientService } from './cms-https-client.service';
import { of, ReplaySubject, Subject, throwError } from 'rxjs';

describe('CmsHttpsClientService', () => {
  let service: CmsHttpsClientService;
  const post = jest.fn();

  const KEY = 'CMS_MAX_CONCURRENT_REQUESTS_PER_HOST';
  afterEach(() => {
    delete process.env[KEY];
  });

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
    process.env[KEY] = '1';
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

  it('does not send a public request still queued when its caller gave up, and bounds one that is sent', async () => {
    process.env[KEY] = '1';
    const blocked = new Subject();
    post.mockReturnValueOnce(blocked).mockReturnValue(of({ data: { status: 'success', token: 't' } }));
    const ahead = service.postAuthenticated('https://cms/cm_api', { task: 'getstartinfo', token: 'test' });
    const late = service.postPublic('https://cms/cm_api', { task: 'login' }, { notAfter: Date.now() + 20 });
    const failure = expect(late).rejects.toMatchObject({ code: 'NO_RESPONSE' });
    await new Promise((r) => setTimeout(r, 40));
    blocked.next({ data: { status: 'success' } });
    blocked.complete();
    await ahead;
    await failure;
    expect(post).toHaveBeenCalledTimes(1);

    const notAfter = Date.now() + 10_000;
    await service.postPublic('https://cms/cm_api', { task: 'login' }, { notAfter });
    expect(post.mock.calls[1][2].timeout).toBeGreaterThan(0);
    expect(post.mock.calls[1][2].timeout).toBeLessThanOrEqual(10_000);
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
  describe('requests at once per host (CMS_MAX_CONCURRENT_REQUESTS_PER_HOST)', () => {
    const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    /** Starts `n` reads to one host whose answers wait; returns them and their answer switches. */
    const startReads = (n: number, url = 'https://cms/cm_api') => {
      // Keyed by task, and replayed, so an answer given before its request is sent still arrives.
      const answers = Array.from({ length: n }, () => new ReplaySubject());
      post.mockImplementation((_url: string, data: { task: string }) => {
        const i = /^read([0-9]+)$/.exec(data.task)?.[1];
        return i === undefined ? of({ data: { status: 'success' } }) : answers[Number(i)];
      });
      const reads = answers.map((_, i) => service.postAuthenticated(url, { task: `read${i}`, token: 'test' }));
      const answer = (i: number) => { answers[i].next({ data: { status: 'success', i } }); answers[i].complete(); };
      return { reads, answer };
    };

    it('1 sends them one by one, in order', async () => {
      process.env[KEY] = '1';
      const { reads, answer } = startReads(3);
      await flush();
      expect(post).toHaveBeenCalledTimes(1);
      answer(0);
      await flush();
      expect(post).toHaveBeenCalledTimes(2);
      answer(1);
      await flush();
      answer(2);
      await Promise.all(reads);
      expect(post.mock.calls.map((c) => c[1].task)).toEqual(['read0', 'read1', 'read2']);
    });

    it('4 (the default) sends four at once, and the fifth when one of them answers', async () => {
      const { reads, answer } = startReads(5);
      await flush();
      expect(post).toHaveBeenCalledTimes(4);
      answer(2);
      await flush();
      expect(post).toHaveBeenCalledTimes(5);
      expect(post.mock.calls[4][1].task).toBe('read4');
      [0, 1, 3, 4].forEach(answer);
      await Promise.all(reads);
    });

    it('a full host does not hold back another host', async () => {
      process.env[KEY] = '2';
      const first = startReads(3, 'https://first/cm_api');
      await flush();
      expect(post).toHaveBeenCalledTimes(2);
      await expect(service.postAuthenticated('https://second/cm_api', { task: 'gethoststat', token: 'test' }))
        .resolves.toEqual({ status: 'success' });
      [0, 1, 2].forEach(first.answer);
      await Promise.all(first.reads);
    });

    it.each(['0', '17', '-1', 'abc', '2.5'])('uses the default 4 for %p', async (value) => {
      process.env[KEY] = value;
      const { reads, answer } = startReads(5);
      await flush();
      expect(post).toHaveBeenCalledTimes(4);
      [0, 1, 2, 3].forEach(answer);
      await flush();
      answer(4);
      await Promise.all(reads);
    });

    it('a raised limit (cwm.conf edited) lets the waiting ones start without a restart', async () => {
      process.env[KEY] = '1';
      const { reads, answer } = startReads(4);
      await flush();
      expect(post).toHaveBeenCalledTimes(1);
      process.env[KEY] = '3';
      answer(0);
      await flush();
      expect(post).toHaveBeenCalledTimes(4);
      [1, 2, 3].forEach(answer);
      await Promise.all(reads);
    });
  });
});
