import { BaseCmsResponse } from './base-cms-response';

export type BrokerInstanceInfo = {
  access_list: string;
  access_mode: string;
  appl_server_shm_id: string;
  as: string;
  auto: string;
  error_query: string;
  jq: string;
  keep_conn: string;
  log: string;
  long_query: string;
  long_query_time: string;
  long_tran: string;
  long_tran_time: string;
  name: string;
  pid: string;
  port: string;
  query: string;
  req: string;
  ses: string;
  source_env: string;
  sqll: string;
  state: string;
  tran: string;
  type: string;
};

export type BrokerList = {
  broker: BrokerInstanceInfo[];
};

export type GetBrokersInfoCmsResponse = BaseCmsResponse & {
  brokersinfo: BrokerList[];
  brokerstatus: string;
};
