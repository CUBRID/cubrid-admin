import express from 'express';
import request from 'supertest';
import { CONTENT_SECURITY_POLICY, httpSecurityHeaders } from './http-security';

const appWith = (options: Parameters<typeof httpSecurityHeaders>[0]) => {
  const app = express();
  app.use(httpSecurityHeaders(options));
  app.get('/', (_req, res) => {
    res.send('ok');
  });
  return app;
};

describe('httpSecurityHeaders', () => {
  it('sends the Content-Security-Policy, with no inline script allowed', async () => {
    const res = await request(appWith({ hsts: false })).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers['content-security-policy-report-only']).toBeUndefined();
  });

  it('only reports in report-only mode', async () => {
    const res = await request(appWith({ hsts: false, cspReportOnly: true })).get('/');
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['content-security-policy-report-only']).toContain("default-src 'self'");
  });

  it('sends no HSTS unless asked (the default certificate is self-signed)', async () => {
    const off = await request(appWith({ hsts: false })).get('/');
    expect(off.headers['strict-transport-security']).toBeUndefined();
    const on = await request(appWith({ hsts: true })).get('/');
    expect(on.headers['strict-transport-security']).toBe('max-age=15552000');
  });

  it("keeps helmet's other headers", async () => {
    const res = await request(appWith({ hsts: false })).get('/');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows inline styles (UI libraries and the editor add them) but loads everything from this server', () => {
    expect(CONTENT_SECURITY_POLICY['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    for (const [directive, sources] of Object.entries(CONTENT_SECURITY_POLICY)) {
      expect(sources.filter((source) => /^https?:/.test(source))).toEqual([]);
      expect(`${directive}:${sources.join(' ')}`).not.toContain('*');
    }
  });
});
