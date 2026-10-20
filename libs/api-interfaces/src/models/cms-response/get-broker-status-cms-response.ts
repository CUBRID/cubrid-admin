import { BaseCmsResponse } from './base-cms-response';

/**
 * Application Server information in broker status response.
 */
export type ApplicationServerInfo = {
  as_c: string;
  as_client_ip: string;
  as_cpu: string;
  as_ctime: string;
  as_cur: string;
  as_dbhost: string;
  as_dbname: string;
  as_error_query: string;
  as_id: string;
  as_lat: string;
  as_lct: string;
  as_long_query: string;
  as_long_tran: string;
  as_num_query: string;
  as_num_tran: string;
  as_pid: string;
  as_psize: string;
  as_status: string;
};

/**
 * Job queue entry in broker status response (`getbrokerstatus`).
 */
export type BrokerJobInfo = {
  job_id: string;
  job_priority: string;
  job_ip: string;
  job_time: string;
  job_request: string;
};

/**
 * CMS response for broker status request.
 */
export type GetBrokerStatusCmsResponse = BaseCmsResponse & {
  asinfo: ApplicationServerInfo[];
  jobinfo: BrokerJobInfo[];
  bname: string;
  time: string;
};
