import { BrokerList } from '../models/cms-response/get-brokers-info-cms-response';

/**
 * Client-facing response for broker list.
 */
export type BrokerListClientResponse = BrokerList[];

/**
 * Single broker start/stop success (CMS envelope stripped from API body).
 */
export type BrokerStartStopClientResponse = {
  success: boolean;
};
