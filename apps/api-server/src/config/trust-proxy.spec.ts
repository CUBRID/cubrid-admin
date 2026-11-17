import { DEFAULT_TRUST_PROXY, parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy (TRUST_PROXY)', () => {
  it('trusts a proxy on this machine when unset', () => {
    expect(parseTrustProxy(undefined)).toEqual({ value: 'loopback' });
    expect(parseTrustProxy('  ')).toEqual({ value: DEFAULT_TRUST_PROXY });
  });

  it('passes a hop count, addresses and subnets as express takes them', () => {
    expect(parseTrustProxy('1')).toEqual({ value: 1 });
    expect(parseTrustProxy('10.0.0.5')).toEqual({ value: '10.0.0.5' });
    expect(parseTrustProxy('10.0.0.5, 192.168.0.0/16,loopback')).toEqual({ value: '10.0.0.5, 192.168.0.0/16, loopback' });
    expect(parseTrustProxy('fd00::/8, ::1')).toEqual({ value: 'fd00::/8, ::1' });
    expect(parseTrustProxy('uniquelocal')).toEqual({ value: 'uniquelocal' });
  });

  it('turns off with false', () => {
    expect(parseTrustProxy('false')).toEqual({ value: false });
    expect(parseTrustProxy('OFF')).toEqual({ value: false });
  });

  it('refuses true, which would let a client choose its own address', () => {
    const { value, warning } = parseTrustProxy('true');
    expect(value).toBe('loopback');
    expect(warning).toMatch(/would trust any X-Forwarded-For/);
  });

  it('refuses a /0 subnet, which is every address', () => {
    for (const raw of ['0.0.0.0/0', '::/0', '10.0.0.5, 0.0.0.0/0']) {
      const { value, warning } = parseTrustProxy(raw);
      expect(value).toBe('loopback');
      expect(warning).toMatch(/every address/);
    }
  });

  it('refuses what it cannot read, keeping the default', () => {
    for (const raw of ['proxy.example.com', '10.0.0.0/33', '1.2.3', '-1']) {
      const { value, warning } = parseTrustProxy(raw);
      expect(value).toBe('loopback');
      expect(warning).toBeDefined();
    }
  });
});
