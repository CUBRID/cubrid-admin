/**
 * Length rules for the passwords NCA sets, matching what stores them. The
 * engine and CMS measure with strlen, so lengths are UTF-8 bytes.
 *
 * NCA's own account password has its own policy (api-server
 * password-validity-checker) and is not covered here.
 */

/**
 * Database user and DBA passwords. AU_MAX_PASSWORD_CHARS
 * (authenticate_constants.h): a longer one fails with
 * ER_AU_PASSWORD_OVERFLOW. Empty is allowed and means no password.
 */
export const DB_PASSWORD_MAX_BYTES = 31;

/**
 * CMS user passwords (adddbmtuser, setdbmtpasswd). PASSWD_LENGTH
 * (cm_server_util.h): setdbmtpasswd stores only the first 32 bytes without
 * an error, so a longer password could never be used to log in again.
 * setdbmtpasswd rejects an empty one.
 */
export const CMS_PASSWORD_MAX_BYTES = 32;

export const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

export type PasswordProblem = 'required' | 'tooLong';

export function checkDbPassword(value: string): PasswordProblem | null {
  return utf8ByteLength(value ?? '') > DB_PASSWORD_MAX_BYTES ? 'tooLong' : null;
}

export function checkCmsPassword(value: string): PasswordProblem | null {
  if (!value) return 'required';
  return utf8ByteLength(value) > CMS_PASSWORD_MAX_BYTES ? 'tooLong' : null;
}
