import { HandleCmsErrors } from './handle-cms-errors.decorator';
import { CmsErrorCode } from '@error/cms/cms-error-code';

class Service {
  @HandleCmsErrors()
  async call(error: unknown): Promise<void> {
    throw error;
  }
}

// What axios throws when CMS never answered: no response, a request, a code.
const noAnswer = (code: string | undefined) =>
  Object.assign(new Error(`connect ${code}`), {
    isAxiosError: true,
    code,
    config: {},
    request: { method: 'POST', host: 'cms-host', path: '/cm_api' },
  });

describe('HandleCmsErrors on a request CMS did not answer', () => {
  it('reports the reason, so a host that cannot be reached is told from a busy one', async () => {
    await expect(new Service().call(noAnswer('ECONNREFUSED'))).rejects.toMatchObject({
      code: CmsErrorCode.NO_RESPONSE,
      additionalData: { reason: 'ECONNREFUSED' },
    });
    await expect(new Service().call(noAnswer('ECONNABORTED'))).rejects.toMatchObject({
      code: CmsErrorCode.NO_RESPONSE,
      additionalData: { reason: 'ECONNABORTED' },
    });
  });

  it('still reports no response when axios gives no code', async () => {
    await expect(new Service().call(noAnswer(undefined))).rejects.toMatchObject({ code: CmsErrorCode.NO_RESPONSE });
  });
});
