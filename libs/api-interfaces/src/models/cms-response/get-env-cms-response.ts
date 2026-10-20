import { BaseCmsResponse } from './base-cms-response';

/**
 * CMS response for getenv request.
 * Contains environment variables and system information.
 */
export type GetEnvCmsResponse = BaseCmsResponse & {
  BROKERVER: string;
  CUBRID: string;
  CUBRIDVER: string;
  CUBRID_DATABASES: string;
  CUBRID_DBMT: string;
  HOSTMONTAB0: string;
  HOSTMONTAB1: string;
  HOSTMONTAB2: string;
  HOSTMONTAB3: string;
  osinfo: string;
};
