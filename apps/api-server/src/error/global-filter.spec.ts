import { GlobalExceptionFilter } from './global-filter';
import { ValidationError } from './validation/validation-error';

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
});
