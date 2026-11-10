import { describe, expect, it } from 'vitest';
import { cmsUserErrorMessage } from './cmsUserError';
import { CM as CM_EN } from '../../constants/cmLabels';
import { CM_KO } from '../../constants/cmLabels.ko';

// What apiClient's interceptor leaves on a rejected request (see global-filter.ts).
const apiError = (type, message) => ({
  response: { data: { data: { type, code: type.split('/').pop().toUpperCase() }, message } },
});

describe('cmsUserErrorMessage', () => {
  it('says in the UI language that only the CMS admin account may manage users', () => {
    const err = apiError('/errors/resource/cms_admin_required', 'Only a host connected as the CMS admin account can manage CMS users.');
    expect(cmsUserErrorMessage(err, CM_KO, 'fallback')).toBe(CM_KO.cmsAdminRequiredErrorMsg);
    expect(cmsUserErrorMessage(err, CM_EN, 'fallback')).toBe(CM_EN.cmsAdminRequiredErrorMsg);
    expect(CM_KO.cmsAdminRequiredErrorMsg).not.toBe(CM_EN.cmsAdminRequiredErrorMsg);
  });

  it('passes any other server or host text through, and falls back when there is none', () => {
    expect(cmsUserErrorMessage(apiError('/errors/cms/request_failed', 'user already exists'), CM_KO, 'fallback')).toBe('user already exists');
    expect(cmsUserErrorMessage({ response: { data: { error: 'Bad Request' } } }, CM_KO, 'fallback')).toBe('Bad Request');
    expect(cmsUserErrorMessage(new Error('network'), CM_KO, 'fallback')).toBe('fallback');
  });
});
