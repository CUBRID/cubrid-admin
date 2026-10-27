import {
  CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC,
  CMS_TOKEN_ACTIVITY_RETENTION_MS,
  closeCmsToken,
  cmsSessionExpiresAt,
  forgetCmsToken,
  noteCmsTokenUse,
  parseTokenActiveTime,
} from './cms-token-activity';

const conf = (...confdata: string[]) => ({ conflist: [{ confdata }] });

describe('cmsSessionExpiresAt', () => {
  afterEach(() => {
    ['tok-a', 'tok-b', 'tok-c', 'tok-d', 'tok-e'].forEach(forgetCmsToken);
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
    noteCmsTokenUse('tok-b', false, 49_000, 50_000);
    expect(cmsSessionExpiresAt({ token: 'tok-b', cmsTokenIssuedAt: 1_000, cmsTokenActiveTimeSec: 60 })).toBe(110_000);
  });

  it('is null once CMS rejected the token, even if it is used again', () => {
    noteCmsTokenUse('tok-c', false, 49_000, 50_000);
    noteCmsTokenUse('tok-c', true, 59_000, 60_000);
    noteCmsTokenUse('tok-c', false, 69_000, 70_000);
    expect(cmsSessionExpiresAt({ token: 'tok-c', cmsTokenIssuedAt: 1_000 })).toBeNull();
  });
});

describe('closeCmsToken', () => {
  afterEach(() => {
    ['tok-d', 'tok-e'].forEach(forgetCmsToken);
  });

  it('ignores a request sent before the disconnect even if its answer comes after', () => {
    noteCmsTokenUse('tok-d', false, 10_000, 11_000);
    closeCmsToken('tok-d', 20_000);
    noteCmsTokenUse('tok-d', false, 19_000, 21_000);
    expect(cmsSessionExpiresAt({ token: 'tok-d' })).toBeNull();
  });

  it('reopens the session for a request sent after the disconnect (another tab)', () => {
    closeCmsToken('tok-e', 20_000);
    noteCmsTokenUse('tok-e', false, 25_000, 26_000);
    expect(cmsSessionExpiresAt({ token: 'tok-e', cmsTokenActiveTimeSec: 60 })).toBe(86_000);
  });
});

describe('token activity retention', () => {
  it('drops records idle longer than the retention when sweeping', () => {
    const old = 1_000;
    noteCmsTokenUse('tok-old', false, old, old);
    const later = old + CMS_TOKEN_ACTIVITY_RETENTION_MS + 1;
    for (let i = 0; i < 256; i++) noteCmsTokenUse(`tok-new-${i}`, false, later, later);

    expect(cmsSessionExpiresAt({ token: 'tok-old' })).toBeNull();
    for (let i = 0; i < 256; i++) forgetCmsToken(`tok-new-${i}`);
  });

  it('keeps a rejected token past the retention, so a long active time does not revive it', () => {
    noteCmsTokenUse('tok-rej', true, 1_000, 1_000);
    const later = 1_000 + CMS_TOKEN_ACTIVITY_RETENTION_MS + 1;
    for (let i = 0; i < 256; i++) noteCmsTokenUse(`tok-new-${i}`, false, later, later);

    expect(cmsSessionExpiresAt({ token: 'tok-rej', cmsTokenIssuedAt: 1_000, cmsTokenActiveTimeSec: 7 * 86400 })).toBeNull();
    for (let i = 0; i < 256; i++) forgetCmsToken(`tok-new-${i}`);
    forgetCmsToken('tok-rej');
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
