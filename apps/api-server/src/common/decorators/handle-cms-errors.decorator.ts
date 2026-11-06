import { CmsError } from '@error/cms/cms-error';
import { Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { buildLogLine } from '@util';
import { rethrowKnownAppError, rethrowOrWrapUnknown } from './error-boundary.util';

export type HandleCmsErrorsOptions = {
  /** Maps Axios/HTTP exceptions to CmsError (default: true). */
  mapHttpErrors?: boolean;
};

// Node/OpenSSL TLS validation failures (expired/self-signed/untrusted cert,
// hostname mismatch, etc.) surface as a connection error with `e.request` set
// and no `e.response` — the same shape as a genuine "CMS never responded"
// timeout. Left unchecked, both get reported as NO_RESPONSE, which reads as
// a transient network issue when it's actually a certificate problem that
// will never resolve on its own. Node's TLS error codes are stable strings
// (CERT_HAS_EXPIRED, DEPTH_ZERO_SELF_SIGNED_CERT, UNABLE_TO_VERIFY_LEAF_SIGNATURE,
// ...); as a fallback also check the message text since not every TLS error
// path preserves `code` through Axios's wrapping.
const TLS_ERROR_CODE_PREFIXES = ['CERT_', 'DEPTH_', 'UNABLE_TO_', 'SELF_SIGNED_', 'ERR_TLS_'];

function isTlsError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e.code && TLS_ERROR_CODE_PREFIXES.some((prefix) => e.code!.startsWith(prefix))) {
    return true;
  }
  return /certificate/i.test(e.message ?? '');
}

function mapAxiosToCmsError(error: unknown): CmsError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const e = error as AxiosError;
  if (!('response' in e) && !('request' in e) && !('config' in e)) {
    return null;
  }

  if (e.response) {
    return CmsError.RequestFailed(
      {
        status: e.response.status,
        data: e.response.data,
      },
      error as Error
    );
  }

  if (e.request) {
    const request = e.request as { method?: string; host?: string; path?: string };

    if (isTlsError(e)) {
      Logger.warn(
        buildLogLine({
          event: 'cms_tls_error',
          method: request.method,
          host: request.host,
          path: request.path,
          message: e.message,
        })
      );
      return CmsError.TlsError({ message: e.message }, error as Error);
    }

    Logger.warn(
      buildLogLine({
        event: 'cms_no_response',
        method: request.method,
        host: request.host,
        path: request.path,
      })
    );
    // Why (ECONNREFUSED, EHOSTUNREACH, ECONNABORTED for a timeout, ...): the
    // client tells a host that cannot be reached from a CMS that is busy.
    return CmsError.NoResponse(e.code ? { reason: e.code } : undefined, error as Error);
  }

  return null;
}

function handleCatch(err: unknown, propertyKey: string, mapHttpErrors: boolean): never {
  if (mapHttpErrors) {
    const fromAxios = mapAxiosToCmsError(err);
    if (fromAxios) {
      throw fromAxios;
    }
  }

  rethrowKnownAppError(err);

  rethrowOrWrapUnknown(err, propertyKey, 'HandleCmsErrors', (detail, cause) =>
    CmsError.Unknown(detail, cause)
  );
}

/**
 * CMS 호출 경계용 데코레이터.
 * - Axios/HTTP -> CmsError
 * - AppError(Cms/Host/Config/Database/Validation 등)는 그대로 전달
 * - 그 외 -> CmsError.Unknown
 */
export function HandleCmsErrors(options?: HandleCmsErrorsOptions) {
  const mapHttpErrors = options?.mapHttpErrors !== false;

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (err) {
        handleCatch(err, propertyKey, mapHttpErrors);
      }
    };

    return descriptor;
  };
}
