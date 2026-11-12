import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { formatAuditLog, resolveClientIp } from '@util';

/**
 * Interceptor for logging incoming requests and outgoing responses.
 *
 * This interceptor logs details about the HTTP request before it's handled by the controller
 * and logs details about the response (or error) after the controller has processed it.
 *
 * @category Interceptors
 * @since 1.0.0
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const now = Date.now();
    const requestContext = this.buildRequestContext(request);

    this.logger.log(
      formatAuditLog('http_request', {
        ...requestContext,
        body: request.body,
      })
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logger.log(
            formatAuditLog('http_response', {
              ...requestContext,
              statusCode: response.statusCode,
              durationMs: Date.now() - now,
              payload: data,
            })
          );
        },
        error: (error) => {
          this.logger.error(
            formatAuditLog('http_error', {
              ...requestContext,
              statusCode: error.status || 'N/A',
              durationMs: Date.now() - now,
              message: error.message,
            }),
            error.stack
          );
        },
      })
    );
  }

  private buildRequestContext(request: any): Record<string, unknown> {
    return {
      user: request.user?.sub ?? 'anonymous',
      ip: resolveClientIp(request),
      method: request.method,
      address: request.originalUrl ?? request.url,
      hostUid: request.params?.hostUid,
    };
  }
}
