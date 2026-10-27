import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { HandleCmsErrors } from '@common';
import { CmsForwardClientRequest } from '@api-interfaces';
import { BaseCmsRequest } from '@type';
import * as https from 'https';
import * as net from 'net';
import { ConfigService } from '@config/config.service';

class CmsHttpsAgent extends https.Agent {
  createConnection(
    options: Parameters<https.Agent['createConnection']>[0],
    callback?: Parameters<https.Agent['createConnection']>[1]
  ): ReturnType<https.Agent['createConnection']> {
    const socket = super.createConnection(options, callback);
    (socket as net.Socket).setKeepAlive?.(true, 30_000);
    return socket;
  }
}
import { HostService } from '@host';
import { EncryptionService } from '@security';
import { checkCmsTokenError, checkCmsStatusError } from '@common';
import { isInvalidTokenError } from '../common/decorators/handle-cms-token-errors.decorator';
import { noteCmsTokenUse } from './cms-token-activity';
import { formatAuditLog } from '@util';

/**
 * Callback function to determine whether status check should be skipped.
 * Returns true if status check should be skipped, false otherwise.
 *
 * @param task - The task name from the request
 * @param response - The CMS response (before status check)
 * @returns true if status check should be skipped, false otherwise
 */
export type ShouldSkipStatusCheckCallback = (task: string, response: any) => boolean;

/**
 * Service for handling secure HTTPS client communications with CMS (Central Management System).
 * This service provides methods for making authenticated and unauthenticated requests to CMS APIs,
 * and for forwarding client requests after augmenting them with necessary authentication tokens.
 *
 * @category Business Services
 * @since 1.0.0
 */
@Injectable()
export class CmsHttpsClientService {
  private readonly logger = new Logger(CmsHttpsClientService.name);
  private httpsAgent: CmsHttpsAgent | null = null;

  // CMS (cm_server) cannot handle truly concurrent requests against the same
  // host — confirmed live: firing several requests at one CMS instance at
  // once made some of them (not all) stall for ~30s before resolving or
  // failing, while the exact same requests sent sequentially never did.
  // Serialize per host (keyed by url, unique per host) so the app's normal
  // concurrent request patterns (parallel dashboard widgets, background
  // monitoring polls overlapping with user actions) don't trigger it.
  private readonly hostRequestQueue = new Map<string, Promise<void>>();

  // Deliberately NOT paired with a retry-on-CMS-timeout: this codebase
  // already tried that once (withCmsRetry, removed in #113 / 3abf005) and
  // reverted it because a retry applied broadly to CMS calls also re-submits
  // non-idempotent long-job requests on a hang-up/timeout, duplicating the
  // actual server-side operation. The sole retry below is getautoexecquery
  // after CMS explicitly returns a timeout; it never resubmits a mutation.
  private async withHostQueue<T>(key: string, fn: () => Promise<T>, task?: string): Promise<T> {
    const queuedAt = Date.now();
    const pending = this.hostRequestQueue.get(key) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => (resolve = r));
    this.hostRequestQueue.set(key, next);
    let startedAt: number | undefined;
    try {
      await pending;
      startedAt = Date.now();
      this.logger.debug(formatAuditLog('cms_queue_start', {
        address: key, task, queueWaitMs: startedAt - queuedAt,
      }));
      return await fn();
    } finally {
      this.logger.debug(formatAuditLog('cms_queue_finish', {
        address: key, task,
        queueWaitMs: (startedAt ?? Date.now()) - queuedAt,
        executionMs: startedAt === undefined ? 0 : Date.now() - startedAt,
      }));
      resolve();
      if (this.hostRequestQueue.get(key) === next) {
        this.hostRequestQueue.delete(key);
      }
    }
  }

  constructor(
    private readonly httpService: HttpService,
    private readonly hostService: HostService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Sends an unauthenticated POST request to a public CMS API endpoint.
   * This method is suitable for endpoints that do not require a user authentication token.
   * @param url - The target URL of the CMS API endpoint.
   * @param data - The request payload, excluding the authentication token.
   * @returns A Promise that resolves with the response data from the CMS API.
   * @throws CmsError if the request fails or an unexpected error occurs.
   */
  @HandleCmsErrors()
  public async postPublic<T extends Omit<BaseCmsRequest, 'token'>, P>(
    url: string,
    data: T
  ): Promise<P> {
    return this.withHostQueue(url, async () => {
      const config = {
        headers: { 'Content-Type': 'application/json' },
        httpsAgent: this.getHttpsAgent(),
      };
      const startedAt = Date.now();
      this.logCmsRequest('public', url, data);
      const response = await firstValueFrom(this.httpService.post<P>(url, data, config));
      this.logCmsResponse('public', url, data, response.data, Date.now() - startedAt);
      return response.data;
    }, this.extractTask(data));
  }

  /**
   * Sends an authenticated POST request to a CMS API endpoint.
   * This method expects the request data to include an authentication token.
   * @param url - The target URL of the CMS API endpoint.
   * @param data - The request payload, including the authentication token.
   * @returns A Promise that resolves with the response data from the CMS API.
   * @throws CmsError if the request fails or an unexpected error occurs.
   */
  @HandleCmsErrors()
  public async postAuthenticated<T extends BaseCmsRequest, P>(
    url: string,
    data: T,
    options?: { timeoutMs?: number }
  ): Promise<P> {
    // Before the host queue: a request waiting there when the user disconnects
    // must not count as use after the disconnect.
    const issuedAt = Date.now();
    return this.withHostQueue(url, async () => {
      const config = {
        headers: { 'Content-Type': 'application/json' },
        httpsAgent: this.getHttpsAgent(),
        // Only bound this diagnostic read. Never retry it here, and do not
        // impose a short deadline on mutations or long-running database jobs.
        ...(data.task === 'dbspaceinfo' ? { timeout: 30_000 } : {}),
        ...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
      };
      for (let attempt = 0; ; attempt++) {
        const startedAt = Date.now();
        this.logCmsRequest('authenticated', url, data);
        const response = await firstValueFrom(this.httpService.post<P>(url, data, config));
        this.logCmsResponse('authenticated', url, data, response.data, Date.now() - startedAt);
        // Any answer but "invalid token" means CMS accepted and renewed the token.
        noteCmsTokenUse(data.token, isInvalidTokenError(response.data), issuedAt);
        const cmsResponse = response.data as { status?: string; note?: string };
        if (attempt === 0 && data.task === 'getautoexecquery'
          && ['fail', 'failure'].includes(cmsResponse.status ?? '')
          && /^timeout$/i.test(cmsResponse.note?.trim() ?? '')) {
          this.logger.warn(formatAuditLog('cms_read_retry', {
            address: url, task: data.task, reason: 'CMS timeout', attempt: 1,
          }));
          continue;
        }
        return response.data;
      }
    }, this.extractTask(data));
  }

  /**
   * Forwards an authenticated client request to a CMS API endpoint.
   * This method retrieves host information, constructs the full CMS API URL,
   * and injects the necessary authentication token into the request body before sending it.
   * The client is not expected to provide the token directly.
   *
   * @param sub - The subject (user ID) from the authentication token, used to find the host.
   * @param requestBody - The original request payload from the client, containing hostUid and task.
   * @param shouldSkipStatusCheck - Optional callback to determine if status check should be skipped (for CMS bug workarounds).
   * @returns A Promise that resolves with the response data from the CMS API.
   * @throws HostError.NoSuchHost if the specified host is not found.
   * @throws CmsError if the forwarded request fails or an unexpected error occurs.
   */
  @HandleCmsErrors()
  public async forwardAuthenticated<T extends CmsForwardClientRequest, P>(
    sub: string,
    requestBody: T,
    shouldSkipStatusCheck?: ShouldSkipStatusCheckCallback
  ): Promise<P> {
    const hostUid = requestBody.hostUid;
    const host = await this.hostService.findHostInternal(sub, hostUid);
    const url = `https://${host.address}:${host.port}/cm_api`;

    const request: BaseCmsRequest = {
      token: (host.token as string) || '',
      ...requestBody,
    };
    const rv = (await this.postAuthenticated(url, request)) as any;

    checkCmsTokenError(rv);

    const task = requestBody.task;
    const shouldSkip = shouldSkipStatusCheck ? shouldSkipStatusCheck(task, rv) : false;

    if (!shouldSkip) {
      checkCmsStatusError(rv, `CMS request failed: ${rv.note || 'Unknown error'}`);
    }

    return rv;
  }

  private logCmsRequest(scope: 'public' | 'authenticated', url: string, data: unknown): void {
    this.logger.debug(
      formatAuditLog('cms_request', {
        scope,
        address: url,
        task: this.extractTask(data),
        payload: data,
      })
    );
  }

  private logCmsResponse(
    scope: 'public' | 'authenticated',
    url: string,
    data: unknown,
    response: unknown,
    durationMs: number
  ): void {
    const cmsResponse = response as { status?: string; __EXEC_TIME?: string };
    this.logger.debug(
      formatAuditLog('cms_response', {
        scope,
        address: url,
        task: this.extractTask(data),
        status: cmsResponse.status ?? 'unknown',
        execTime: cmsResponse.__EXEC_TIME,
        durationMs,
        payload: response,
      })
    );
  }

  private extractTask(data: unknown): string | undefined {
    if (!data || typeof data !== 'object' || !('task' in data)) {
      return undefined;
    }

    const task = (data as { task?: unknown }).task;
    return typeof task === 'string' ? task : undefined;
  }

  private getHttpsAgent(): CmsHttpsAgent {
    if (!this.httpsAgent) {
      const ca = this.configService.getCmsCaCert();
      this.httpsAgent = new CmsHttpsAgent({
        rejectUnauthorized: this.configService.getCmsRejectUnauthorized(),
        keepAlive: true,
        ...(ca ? { ca } : {}),
      });
    }
    return this.httpsAgent;
  }
}
