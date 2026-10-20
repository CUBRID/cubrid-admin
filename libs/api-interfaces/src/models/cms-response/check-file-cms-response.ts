/**
 * Represents the response structure for a CMS file check request.
 *
 * @category Responses
 * @since 1.0.0
 */
export type CheckFileCmsResponse = {
  __EXEC_TIME: string;
  existfile?: string;
  note: string;
  status: string;
  task: string;
};
