/**
 * Client request for the raw cubrid.conf / cm.conf editor's save
 * (setsysparam CMS task).
 *
 * @category Requests
 * @since 1.0.0
 */
export type SetSysParamClientRequest = {
  /** "cubridconf" or "cmconf" */
  confname: string;
  /** Configuration data as array of lines */
  confdata: string[];
  /** The file as the editor loaded it; the save fails if it changed since */
  loaded: string[];
};
