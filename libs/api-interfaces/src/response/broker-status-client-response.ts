import { BaseCmsResponse } from '../models/cms-response/base-cms-response';
import {
  BrokerStatusEntry,
  GetBrokerStatusCmsResponse,
} from '../models/cms-response/get-broker-status-cms-response';

/**
 * Client-facing response for broker status.
 * Strips CMS envelope fields from GetBrokerStatusCmsResponse.
 */
export type GetBrokerStatusClientResponse = Omit<GetBrokerStatusCmsResponse, keyof BaseCmsResponse>;

/**
 * Client-facing response for the bulk broker status route: one entry per
 * requested broker that CMS reported on.
 */
export type GetBrokerStatusBulkClientResponse = {
  brokers: BrokerStatusEntry[];
};
