import helmet from 'helmet';
import type { RequestHandler } from 'express';

/**
 * Content-Security-Policy for the web screens the server sends (server mode
 * only; the desktop app loads its screens from its own bundle).
 *
 * Everything is loaded from this server: the bundle and its fonts, the SQL
 * editor, the PWA manifest and service worker, and the API. The exceptions:
 * - style-src 'unsafe-inline': the UI libraries and the SQL editor add
 *   <style> elements and style attributes at run time.
 * - img-src/font-src data: and img-src blob:: images and fonts the CSS and
 *   the editor embed as data: URLs, and images the screens build in memory.
 *
 * No upgrade-insecure-requests: behind a reverse proxy that serves http (as
 * 0.1.0 allowed), it would send the page's files and API calls to https on
 * port 443 and the screen would stay blank. The server itself always listens
 * on https, so a direct visit is unchanged.
 */
export const CONTENT_SECURITY_POLICY: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
};

export type HttpSecurityOptions = {
  /** Strict-Transport-Security (HSTS_ENABLED). */
  hsts: boolean;
  /** Report CSP violations without blocking (used to check the policy). */
  cspReportOnly?: boolean;
};

/** helmet's headers; the others (X-Frame-Options, nosniff, Referrer-Policy, ...) keep its defaults. */
export function httpSecurityHeaders({ hsts, cspReportOnly = false }: HttpSecurityOptions): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: CONTENT_SECURITY_POLICY,
      reportOnly: cspReportOnly,
    },
    // Off unless asked for: with the default self-signed certificate a
    // browser that has seen HSTS refuses to let the user past the warning.
    strictTransportSecurity: hsts ? { maxAge: 180 * 24 * 60 * 60, includeSubDomains: false } : false,
  });
}
