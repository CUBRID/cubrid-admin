import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-filter';
import { AuthError } from './auth/auth-error';
import { ValidationError } from './validation/validation-error';
import { CmsError } from './cms/cms-error';
import { DatabaseError } from './database/database-error';

function mockHost(url = '/api/host-uid/database/start/testdb') {
  const res: any = {
    statusCode: undefined,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  const req = { url, method: 'GET' };
  const host: any = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  };
  return { host, res };
}

describe('GlobalExceptionFilter', () => {
  it('logs a 401 as one warning line, with no stack trace and no ERROR', () => {
    const filter = new GlobalExceptionFilter();
    const logger = (filter as any).logger;
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { host, res } = mockHost('/api/version');

    filter.catch(new UnauthorizedException('Invalid token'), host);

    expect(res.statusCode).toBe(401);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toEqual(['Unauthorized: Invalid token', 'GET /api/version']);
  });

  it('logs an AppError with status 401 (invalid token) as a warning too', () => {
    const filter = new GlobalExceptionFilter();
    const logger = (filter as any).logger;
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { host, res } = mockHost('/api/version');

    filter.catch(AuthError.InvalidToken(), host);

    expect(res.statusCode).toBe(401);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^Unauthorized \[/);
  });

  it('passes AppError additionalData safe fields (e.g. dbname) through to the client', () => {
    const filter = new GlobalExceptionFilter();
    const { host, res } = mockHost();

    const error = ValidationError.MissingDBCredentials('testdb', ['id', 'password']);
    filter.catch(error, host);

    expect(res.statusCode).toBe(400);
    expect(res.body.data.code).toBe('MISSING_DB_CREDENTIALS');
    expect(res.body.data.dbname).toBe('testdb');
    expect(res.body.data.missingFields).toEqual(['id', 'password']);
  });

  // What a client maps an error by: `type`, plus `reason` and values, and for
  // CMS failures CMS's own text apart from the message.
  describe('fields for clients that show their own text', () => {
    const send = (error: unknown) => {
      const { host, res } = mockHost();
      new GlobalExceptionFilter().catch(error, host);
      return res;
    };

    it('gives a CMS failure the CMS note and task apart from the message', () => {
      const res = send(CmsError.RequestFailed({
        message: 'CMS request failed',
        response: { task: 'startdb', status: 'failure', note: 'Database(demodb@127.0.0.1) is not active state<end>' },
      }));

      expect(res.body.data).toMatchObject({
        type: '/errors/cms/request_failed',
        code: 'REQUEST_FAILED',
        message: 'Database(demodb@127.0.0.1) is not active state',
        cmsNote: 'Database(demodb@127.0.0.1) is not active state',
        cmsTask: 'startdb',
      });
    });

    it('gives no CMS note to a CMS that never answered', () => {
      const res = send(CmsError.NoResponse({ task: 'login', reason: 'DEADLINE_PASSED_IN_QUEUE' }));

      expect(res.body.data.type).toBe('/errors/cms/no_response');
      expect(res.body.data).not.toHaveProperty('cmsNote');
      expect(res.body.data.reason).toBe('DEADLINE_PASSED_IN_QUEUE');
    });

    it('keeps the error type when the error carries a field of its own called type', () => {
      const res = send(DatabaseError.InvalidParameter('Parameter is required', {
        reason: 'KILL_PARAMETER_REQUIRED',
        killType: 'i',
        type: 'i',
        dbname: 'demodb',
      }));

      expect(res.body.data).toMatchObject({
        type: '/errors/database/invalid_parameter',
        reason: 'KILL_PARAMETER_REQUIRED',
        killType: 'i',
        dbname: 'demodb',
      });
    });

    it('gives an HttpException a type and the code its thrower set', () => {
      const res = send(new NotFoundException({ message: 'Job not found: j1', code: 'JOB_NOT_FOUND', jobId: 'j1' }));

      expect(res.statusCode).toBe(404);
      expect(res.body.data).toEqual({
        type: '/errors/http/job_not_found',
        code: 'JOB_NOT_FOUND',
        jobId: 'j1',
        message: 'Job not found: j1',
        detail: 'Job not found: j1',
      });
    });

    it('names an HttpException without a code by its HTTP status', () => {
      const res = send(new ConflictException('Could not capture the complete log.'));

      expect(res.body.data).toMatchObject({ type: '/errors/http/conflict', code: 'CONFLICT' });
    });

    it('gives an unhandled error the internal error type', () => {
      const res = send(new Error('ENOENT: secret path /var/x'));

      expect(res.statusCode).toBe(500);
      expect(res.body.data).toEqual({
        type: '/errors/internal/internal_error',
        code: 'INTERNAL_ERROR',
        message: 'An internal server error occurred.',
        detail: 'An internal server error occurred.',
      });
    });
  });
});
