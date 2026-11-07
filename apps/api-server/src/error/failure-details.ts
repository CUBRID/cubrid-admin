import { AppError } from './app-error';

/**
 * How a result entry (a bulk action's `failed[]`, a service step's failure)
 * describes an error: `error` is the message the API would send for it, and
 * an AppError also brings the fields a client maps it by — `type`, `code`,
 * `reason`, `cmsNote`, `cmsTask`, values like `dbname` — the same as the
 * `data` of its error response.
 */
export type FailureDetails = {
  error: string;
  type?: string;
  code?: string;
  [field: string]: unknown;
};

export function failureDetails(err: unknown): FailureDetails {
  if (err instanceof AppError) {
    const { title: _title, status: _status, detail, ...fields } = err.toProblemDetails();
    return { ...fields, error: detail };
  }
  return { error: err instanceof Error ? err.message : String(err) };
}
