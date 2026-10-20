import { BaseCmsResponse } from '../models/cms-response/base-cms-response';
import { GetBrokerStatusCmsResponse } from '../models/cms-response/get-broker-status-cms-response';

/**
 * Client-facing response for broker status.
 * Strips CMS envelope fields from GetBrokerStatusCmsResponse.
 */
export type GetBrokerStatusClientResponse = Omit<GetBrokerStatusCmsResponse, keyof BaseCmsResponse>;
