import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDbUserDto } from './database-user-request.dto';
import { SetDbmtPasswdDto } from './broker-request.dto';

const errorsOf = <T extends object>(cls: new () => T, body: object) =>
  validateSync(plainToInstance(cls, body) as object).map((e) => e.property);

describe('MaxUtf8Bytes on password fields', () => {
  const dbUser = (userpass: string) => ({
    dbname: 'demodb',
    username: 'u1',
    userpass,
    groups: { group: [] },
    authorization: [],
  });

  it('accepts an empty or 31-byte database password and rejects 32 bytes', () => {
    expect(errorsOf(CreateDbUserDto, dbUser(''))).toEqual([]);
    expect(errorsOf(CreateDbUserDto, dbUser('a'.repeat(31)))).toEqual([]);
    expect(errorsOf(CreateDbUserDto, dbUser('a'.repeat(32)))).toEqual(['userpass']);
  });

  it('measures bytes, not characters', () => {
    // 11 Hangul characters are 33 bytes.
    expect(errorsOf(CreateDbUserDto, dbUser('가'.repeat(11)))).toEqual(['userpass']);
  });

  it('rejects a CMS password CMS would cut to 32 bytes', () => {
    expect(errorsOf(SetDbmtPasswdDto, { targetid: 'admin', newpassword: 'a'.repeat(32) })).toEqual([]);
    expect(errorsOf(SetDbmtPasswdDto, { targetid: 'admin', newpassword: 'a'.repeat(33) })).toEqual(['newpassword']);
  });
});
