import { failureDetails } from './failure-details';
import { CmsError } from './cms/cms-error';
import { ValidationError } from './validation/validation-error';

describe('failureDetails', () => {
  it('describes an AppError by its API message, not its bare code, with what a client maps it by', () => {
    const err = CmsError.RequestFailed({ response: { task: 'stopbroker', status: 'failure', note: 'Cannot open shared memory' } });

    expect(failureDetails(err)).toEqual({
      error: 'Cannot open shared memory',
      type: '/errors/cms/request_failed',
      code: 'REQUEST_FAILED',
      cmsNote: 'Cannot open shared memory',
      cmsTask: 'stopbroker',
    });
  });

  it('keeps the values and reason of the error', () => {
    const err = ValidationError.MissingDBCredentials('demodb', ['id', 'password'], { reason: 'notLoggedIn' });

    expect(failureDetails(err)).toMatchObject({
      type: '/errors/validation/missing_db_credentials',
      code: 'MISSING_DB_CREDENTIALS',
      dbname: 'demodb',
      reason: 'notLoggedIn',
    });
  });

  it('uses the message of any other error', () => {
    expect(failureDetails(new Error('status unavailable'))).toEqual({ error: 'status unavailable' });
  });
});
