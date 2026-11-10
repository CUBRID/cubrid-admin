import { describe, expect, it } from 'vitest';
import { dbCharsetFromParamDump } from './dbCharset';

describe('dbCharsetFromParamDump', () => {
  // Client values of `cubrid paramdump -C -b` measured on 11.4.5 for databases
  // made with en_US (db_root.charset 3), en_US.utf8 (5) and ko_KR.euckr (4).
  it('names the charset of the client intl_collation', () => {
    expect(dbCharsetFromParamDump({ client: [{ intl_collation: '"iso88591_bin"' }] })).toBe('ISO-8859-1');
    expect(dbCharsetFromParamDump({ client: [{ intl_collation: '"utf8_bin"' }] })).toBe('UTF-8');
    expect(dbCharsetFromParamDump({ client: [{ intl_collation: '"euckr_bin"' }] })).toBe('EUC-KR');
  });

  it('tells nothing when the client values are empty (SA mode) or missing', () => {
    expect(dbCharsetFromParamDump({ client: [{ intl_collation: '""' }] })).toBeNull();
    expect(dbCharsetFromParamDump({ server: [{}] })).toBeNull();
    expect(dbCharsetFromParamDump(undefined)).toBeNull();
  });
});
