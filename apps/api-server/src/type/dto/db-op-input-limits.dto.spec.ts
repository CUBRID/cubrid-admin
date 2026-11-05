import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UnloadDatabaseDto, AddVolDbDto } from './database-management-request.dto';
import { BackupDbDto, BackupScheduleDto, RestoreDbDto } from './database-backup-request.dto';
import { CreateDatabaseWithConfigDto } from './database-lifecycle-request.dto';
import { SetAutoAddVolDto } from './database-config-request.dto';

// The ranges the database operation dialogs check (db-op-input-limits),
// checked again here so a request that skips the dialog is refused too.

const failedFields = (cls: new () => object, body: Record<string, unknown>): string[] => {
  const errors = validateSync(plainToInstance(cls, body));
  const names = (list: typeof errors, prefix = ''): string[] =>
    list.flatMap((e) => [
      ...(e.constraints ? [`${prefix}${e.property}`] : []),
      ...names(e.children ?? [], `${prefix}${e.property}.`),
    ]);
  return names(errors);
};

describe('unloaddb', () => {
  const base = { targetdir: '/tmp/u', isSchemaIncluded: true, isDataIncluded: true, dbuser: 'dba', dbpasswd: '', classonly: 'no' };

  it('takes cached pages from 1 and estimated rows from 0, and leaves an empty (unchecked) option alone', () => {
    expect(failedFields(UnloadDatabaseDto, { ...base, cach: '1', estimate: '0' })).toEqual([]);
    expect(failedFields(UnloadDatabaseDto, { ...base, cach: '', estimate: '' })).toEqual([]);
  });

  it('refuses 0 cached pages, a negative estimate and non-integers', () => {
    expect(failedFields(UnloadDatabaseDto, { ...base, cach: '0' })).toContain('cach');
    expect(failedFields(UnloadDatabaseDto, { ...base, estimate: '-1' })).toContain('estimate');
    expect(failedFields(UnloadDatabaseDto, { ...base, cach: '1.5' })).toContain('cach');
  });
});

describe('createdb', () => {
  const base = {
    dbname: 'demo', numpage: '32768', pagesize: 16384, logsize: 512, logpagesize: 16384,
    genvolpath: '/d', logvolpath: '/l', charset: 'en_US', overwrite_config_file: 'YES',
  };

  it('takes 4K-16K pages and a 20-4096 MiB log', () => {
    expect(failedFields(CreateDatabaseWithConfigDto, base)).toEqual([]);
    expect(failedFields(CreateDatabaseWithConfigDto, { ...base, pagesize: 4096, logpagesize: 8192, logsize: 20 })).toEqual([]);
  });

  it('refuses 32K pages, a log under 20 MiB or over 4 GiB, and an empty extra volume', () => {
    expect(failedFields(CreateDatabaseWithConfigDto, { ...base, pagesize: 32768 })).toContain('pagesize');
    expect(failedFields(CreateDatabaseWithConfigDto, { ...base, logpagesize: 32768 })).toContain('logpagesize');
    expect(failedFields(CreateDatabaseWithConfigDto, { ...base, logsize: 19 })).toContain('logsize');
    expect(failedFields(CreateDatabaseWithConfigDto, { ...base, logsize: 4097 })).toContain('logsize');
    const exvol = [{ demo_x1: { type: 'data', size: 0, pagesize: 16384, volpath: '/d' } }];
    expect(failedFields(CreateDatabaseWithConfigDto, { ...base, exvol })).toContain('exvol');
  });
});

describe('auto add volume', () => {
  const on = { data: 'ON', data_warn_outofspace: '0.15', data_ext_page: '1000', index: 'ON', index_warn_outofspace: '0.15', index_ext_page: '1000' };

  it('takes a ratio up to 0.5 and 1000 pages or more while ON', () => {
    expect(failedFields(SetAutoAddVolDto, on)).toEqual([]);
  });

  it('refuses fewer than 1000 pages or a ratio over 0.5 while ON, but not while OFF', () => {
    expect(failedFields(SetAutoAddVolDto, { ...on, data_ext_page: '999' })).toContain('data_ext_page');
    expect(failedFields(SetAutoAddVolDto, { ...on, index_warn_outofspace: '0.6' })).toContain('index_warn_outofspace');
    expect(failedFields(SetAutoAddVolDto, { ...on, data: 'OFF', data_ext_page: '0' })).toEqual([]);
  });
});

describe('addvoldb', () => {
  const base = { volname: '', purpose: 'data', path: '/v', numberofpages: '32768' };

  it('refuses a size of 0 or less', () => {
    expect(failedFields(AddVolDbDto, { ...base, size_need_mb: '512.000(MB)' })).toEqual([]);
    expect(failedFields(AddVolDbDto, { ...base, size_need_mb: '0.000(MB)' })).toContain('size_need_mb');
    expect(failedFields(AddVolDbDto, { ...base, size_need_mb: '-5.000(MB)' })).toContain('size_need_mb');
  });
});

describe('backupdb and backup plans', () => {
  it('takes 0 or more threads for a backup, and no value', () => {
    expect(failedFields(BackupDbDto, { level: '0', backupdir: '/b', mt: '0' })).toEqual([]);
    expect(failedFields(BackupDbDto, { level: '0', backupdir: '/b', mt: '' })).toEqual([]);
    expect(failedFields(BackupDbDto, { level: '0', backupdir: '/b', mt: '-1' })).toContain('mt');
  });

  const plan = {
    backupid: 'p1', path: '/b', period_type: 'Monthly', period_date: '1,15', time: '0130', level: '0',
    archivedel: 'OFF', updatestatus: 'ON', storeold: 'ON', onoff: 'ON', zip: 'y', check: 'y', mt: '0', bknum: '1',
  };

  it('takes a valid plan', () => {
    expect(failedFields(BackupScheduleDto, plan)).toEqual([]);
  });

  it('refuses keeping 0 backups (each run would delete the older ones), negative threads and a level over 2', () => {
    expect(failedFields(BackupScheduleDto, { ...plan, bknum: '0' })).toContain('bknum');
    expect(failedFields(BackupScheduleDto, { ...plan, mt: '-2' })).toContain('mt');
    expect(failedFields(BackupScheduleDto, { ...plan, level: '3' })).toContain('level');
  });

  it('refuses a time that is not HHMM and a monthly plan without a day', () => {
    expect(failedFields(BackupScheduleDto, { ...plan, time: '2460' })).toContain('time');
    expect(failedFields(BackupScheduleDto, { ...plan, period_date: '' })).toContain('period_date');
    expect(failedFields(BackupScheduleDto, { ...plan, period_date: '0,32' })).toContain('period_date');
    expect(failedFields(BackupScheduleDto, { ...plan, period_type: 'Daily', period_date: '' })).toEqual([]);
  });
});

describe('restoredb', () => {
  const base = { level: '0', partial: 'n', pathname: '/b', recoverypath: 'none' };

  it('takes the backup time or a date from 1900', () => {
    expect(failedFields(RestoreDbDto, { ...base, date: 'backuptime' })).toEqual([]);
    expect(failedFields(RestoreDbDto, { ...base, date: '05-11-2026:13:30:00' })).toEqual([]);
    expect(failedFields(RestoreDbDto, { ...base, date: '01-01-1900:00:00:00' })).toEqual([]);
  });

  it('refuses a year before 1900 and a level over 2', () => {
    expect(failedFields(RestoreDbDto, { ...base, date: '31-12-1899:23:59:00' })).toContain('date');
    expect(failedFields(RestoreDbDto, { ...base, date: 'backuptime', level: '3' })).toContain('level');
  });
});
