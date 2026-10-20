import { BaseCmsResponse } from '../models/cms-response/base-cms-response';
import { ParamdumpCmsResponse } from '../models/cms-response/paramdump-cms-response';

/**
 * Client-facing response for paramdump.
 * Strips CMS envelope fields from ParamdumpCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type ParamdumpClientResponse = Omit<ParamdumpCmsResponse, keyof BaseCmsResponse>;
