import * as https from 'node:https';

/**
 * The CMS jobs the server still runs (GET /jobs/active over its socket), or
 * null when it did not answer in time or the answer could not be read: the
 * jobs are then unknown, not none, so a workspace change asks first.
 */
export function listActiveJobs(socketPath: string): Promise<unknown[] | null> {
  return new Promise((resolve) => {
    const request = https.request(
      { socketPath, path: '/jobs/active', method: 'GET', servername: 'localhost', rejectUnauthorized: false, timeout: 5000 },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve(Array.isArray(body?.data) ? body.data : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
    request.end();
  });
}
