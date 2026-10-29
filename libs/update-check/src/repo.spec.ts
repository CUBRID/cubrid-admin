import { DEFAULT_UPDATE_REPO, isTrustedDownloadUrl, resolveUpdateRepo } from './repo';

describe('resolveUpdateRepo', () => {
  it('defaults to the official repo', () => {
    expect(DEFAULT_UPDATE_REPO).toBe('CUBRID/cubrid-admin');
    expect(resolveUpdateRepo(undefined)).toBe(DEFAULT_UPDATE_REPO);
    expect(resolveUpdateRepo('')).toBe(DEFAULT_UPDATE_REPO);
    expect(resolveUpdateRepo('   ')).toBe(DEFAULT_UPDATE_REPO);
  });

  it('accepts a well-formed owner/repo override', () => {
    expect(resolveUpdateRepo(' JohnDohnut/cubrid-webmanager ')).toBe('JohnDohnut/cubrid-webmanager');
  });

  it.each(['owner', 'a/b/c', '../..', 'owner/..', 'owner/repo?x=1', 'owner/re po', '/repo', 'owner/'])(
    'rejects malformed override %p',
    (override) => {
      expect(resolveUpdateRepo(override)).toBe(DEFAULT_UPDATE_REPO);
    }
  );
});

describe('isTrustedDownloadUrl', () => {
  it('trusts https GitHub release and asset hosts', () => {
    expect(isTrustedDownloadUrl('https://github.com/CUBRID/cubrid-admin/releases/tag/v1.0.0')).toBe(true);
    expect(isTrustedDownloadUrl('https://objects.githubusercontent.com/some/asset')).toBe(true);
  });

  it.each([
    'http://github.com/CUBRID/cubrid-admin',
    'https://github.com.evil.example/x',
    'https://evil.example/github.com',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'not a url',
  ])('rejects %p', (url) => {
    expect(isTrustedDownloadUrl(url)).toBe(false);
  });
});
