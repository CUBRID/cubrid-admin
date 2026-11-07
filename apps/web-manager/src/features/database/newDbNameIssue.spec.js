import { describe, expect, it } from 'vitest';
import { newDbNameIssue, takenDbNames } from './newDbNameIssue';

describe('newDbNameIssue', () => {
  const taken = takenDbNames([{ dbname: 'demodb' }, { dbname: 'repdb', cmsListed: false }, { dbname: 'src' }, {}], 'src');

  it("lists the host's databases but the one being copied or renamed", () => {
    expect(taken).toEqual(['demodb', 'repdb']);
  });

  it('refuses a name already on the host, compared case-sensitively as databases.txt is', () => {
    expect(newDbNameIssue('demodb', taken)?.code).toBe('DB_NAME_EXISTS');
    expect(newDbNameIssue('repdb', taken)?.code).toBe('DB_NAME_EXISTS');
    expect(newDbNameIssue('DemoDB', taken)).toBeNull();
    expect(newDbNameIssue('newdb', taken)).toBeNull();
  });

  it('reports the name rule first, and takes any name while the list is unknown', () => {
    expect(newDbNameIssue('1demodb', taken)?.code).toBe('DB_NAME_START');
    expect(newDbNameIssue('demodb', undefined)).toBeNull();
  });
});
