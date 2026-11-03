/**
 * Client request for broker_setparam CMS task.
 * Sets broker configuration file content (array of lines).
 *
 * @category Requests
 * @since 1.0.0
 */
export type BrokerSetParamClientRequest = {
  /** Configuration data as array of lines (broker config file content) */
  confdata: string[];
  /** broker.conf as the editor loaded it; the save fails if it changed since */
  loaded: string[];
};
