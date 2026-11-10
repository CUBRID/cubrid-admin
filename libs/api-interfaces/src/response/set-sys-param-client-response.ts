import type { CmsSuccessClientResponse } from './cms-success-client-response';
import type { ConfTextProblem } from '../param-schema/validate-conf-text';

/**
 * Client-facing response for setting system parameters (CMS envelope fields removed).
 *
 * @category Responses
 * @since 1.0.0
 */
export type SetSysParamClientResponse = CmsSuccessClientResponse & {
  /**
   * Non-blocking notes from the server-side conf check on a raw-text save
   * (e.g. a deprecated key), formatted "Line N: ..." — the save went through.
   */
  warnings?: string[];
  /** The same notes as problems (code, params, line, key), in the same order. */
  warningProblems?: ConfTextProblem[];
};
