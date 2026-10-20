import { BaseCmsResponse } from '../models/cms-response/base-cms-response';
import { GetAllSysParamCmsResponse } from '../models/cms-response/get-all-sys-param-cms-response';

/**
 * Client-facing response for getting all system parameters.
 * Strips CMS envelope fields from GetAllSysParamCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type GetAllSysParamClientResponse = Omit<GetAllSysParamCmsResponse, keyof BaseCmsResponse>;
