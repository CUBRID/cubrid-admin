import {
  CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC,
  cmsSessionExpiresAt,
  forgetCmsToken,
  noteCmsTokenUse,
  parseTokenActiveTime,
} from './cms-token-activity';

const conf = (...confdata: string[]) => ({ conflist: [{ confdata }] });

describe('cmsSessionExpiresAt', () => {
  afterEach(() => {
    ['tok-a', 'tok-b', 'tok-c'].forEach(forgetCmsToken);
  });

  it('is null without a token or a known login', () => {
    expect(cmsSessionExpiresAt({})).toBeNull();
    expect(cmsSessionExpiresAt({ token: 'tok-a' })).toBeNull();
  });

  it('counts the active time from the login when the token was not used since', () => {
    expect(cmsSessionExpiresAt({ token: 'tok-a', cmsTokenIssuedAt: 1_000, cmsTokenActiveTimeSec: 60 })).toBe(61_000);
    expect(cmsSessionExpiresAt({ token: 'tok-a', cmsTokenIssuedAt: 1_000 })).toBe(
      1_000 + CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC * 1000
    );
  });

  it('counts from the last request CMS accepted, since CMS renews the token on each', () => {
    noteCmsTokenUse('tok-b', false, 50_000);
    expect(cmsSessionExpiresAt({ token: 'tok-b', cmsTokenIssuedAt: 1_000, cmsTokenActiveTimeSec: 60 })).toBe(110_000);
  });

  it('is null once CMS rejected the token, even if it is used again', () => {
    noteCmsTokenUse('tok-c', false, 50_000);
    noteCmsTokenUse('tok-c', true, 60_000);
    noteCmsTokenUse('tok-c', false, 70_000);
    expect(cmsSessionExpiresAt({ token: 'tok-c', cmsTokenIssuedAt: 1_000 })).toBeNull();
  });
});

describe('parseTokenActiveTime', () => {
  it('reads the last uncommented entry, with or without spaces around =', () => {
    expect(parseTokenActiveTime(conf('#token_active_time=60', 'token_active_time = 3600'))).toBe(3600);
    expect(parseTokenActiveTime(conf('TokenActiveTime=120', 'token_active_time\t900'))).toBe(900);
  });

  it('falls back to 7200 the way CMS does', () => {
    expect(parseTokenActiveTime(conf('#token_active_time=7200'))).toBe(7200);
    expect(parseTokenActiveTime(conf('token_active_time=0'))).toBe(7200);
    expect(parseTokenActiveTime(conf('token_active_time=1h'))).toBe(7200);
    expect(parseTokenActiveTime(conf('token_active_time=12345678901'))).toBe(7200);
    expect(parseTokenActiveTime({ conflist: [] })).toBe(7200);
  });
});
