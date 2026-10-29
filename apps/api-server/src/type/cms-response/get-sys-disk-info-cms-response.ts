import { BaseCmsResponse } from './base-cms-response';

/**
 * One filesystem entry from CMS `getsysdiskinfo`. Sizes are byte counts as
 * decimal strings. On Linux CMS reports a single statvfs("/") entry named
 * "/"; on Windows one entry per fixed drive (e.g. "C:").
 */
export type CmsSysDiskInfoEntry = {
  name: string;
  total_size: string;
  free_size: string;
};

export type CmsGetSysDiskInfoResponse = BaseCmsResponse & {
  disk_info: CmsSysDiskInfoEntry[];
};
