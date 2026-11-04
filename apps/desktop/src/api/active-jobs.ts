import * as https from 'node:https';

/**
 * The CMS jobs the server still runs (GET /jobs/active over its socket).
 * An empty list when the server does not answer: nothing can be running.
 */
export function listActiveJobs(socketPath: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const request = https.request(
      { socketPath, path: '/jobs/active', method: 'GET', servername: 'localhost', rejectUnauthorized: false, timeout: 5000 },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve(Array.isArray(body?.data) ? body.data : []);
          } catch {
            resolve([]);
          }
        });
      }
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve([]));
    request.end();
  });
}
