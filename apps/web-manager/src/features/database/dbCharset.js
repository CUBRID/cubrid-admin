/**
 * A database's character set, from a paramdump with client parameters
 * (CMS paramdump both=y).
 *
 * The engine keeps the charset in the database (db_root.charset, read at
 * boot). The client side of `cubrid paramdump -C -b` then sets intl_collation,
 * when cubrid.conf does not, to the binary collation of that charset
 * (system_parameter.c sysprm_init_intl_param:
 * LANG_GET_BINARY_COLLATION (LANG_SYS_CODESET)), e.g. "iso88591_bin". When
 * cubrid.conf sets intl_collation, the client value is that setting instead,
 * which may belong to another charset (language_support.c
 * lang_get_client_charset), so the caller must not use this then.
 *
 * In SA mode (database not running) the client values come back empty.
 *
 * @returns the charset name ("UTF-8", "EUC-KR", "ISO-8859-1", or the
 *   collation's prefix as is), or null when the dump does not tell it.
 */
const NAMES = { utf8: 'UTF-8', euckr: 'EUC-KR', iso88591: 'ISO-8859-1' };

export function dbCharsetFromParamDump(dump) {
  const raw = dump?.client?.[0]?.intl_collation;
  const collation = String(raw ?? '').replace(/^"|"$/g, '').trim();
  if (!collation) return null;
  const prefix = collation.split('_')[0].toLowerCase();
  return NAMES[prefix] ?? prefix;
}
