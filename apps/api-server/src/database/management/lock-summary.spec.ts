import { lockObjectLabel, summarizeLocks } from './lock-summary';

// CMS lockdb JSON: each lock object comes as a metadata entry followed by an
// entry with only its lock_holders.
const lockObject = (obType: string, holders: Array<[string, string]>) => [
  { ob_type: obType, oid: '0|553|1', num_holders: String(holders.length), num_b_holders: '0', num_waiters: '0' },
  { lock_holders: holders.map(([tran_index, granted_mode]) => ({ tran_index, granted_mode, count: '1', nsubgranules: '0' })) },
];

const lockinfo = (entry: unknown[]) => [{
  esc: '100000',
  dinterval: '0',
  transaction: [
    { index: '1', '@uid': 'DBA', host: 'app1', pid: '111', pname: 'loader', isolevel: 'READ COMMITTED', timeout: '-1' },
    { index: '2', '@uid': 'PUBLIC', host: 'app2', pid: '222', pname: 'csql', isolevel: 'READ COMMITTED', timeout: '-1' },
  ],
  lot: [{ maxnumlock: '10000', numlocked: String(entry.length / 2), entry }],
}];

describe('lockObjectLabel', () => {
  it('drops the OID from instance and index key locks only', () => {
    expect(lockObjectLabel('Instance of class ( 0|   553|   1) = dba.t1')).toBe('Instance of class = dba.t1');
    expect(lockObjectLabel('Index key of class ( 0| 553| 1) = dba.t1')).toBe('Index key of class = dba.t1');
    expect(lockObjectLabel('Class = dba.t1')).toBe('Class = dba.t1');
    expect(lockObjectLabel('Root class')).toBe('Root class');
  });
});

describe('summarizeLocks', () => {
  it('groups per transaction, table and mode with the number of locks, most first', () => {
    const entries = [
      ...lockObject('Class = dba.t1', [['1', 'IX_LOCK'], ['2', 'IX_LOCK']]),
      ...lockObject('Instance of class ( 0| 553| 1) = dba.t1', [['1', 'X_LOCK']]),
      ...lockObject('Instance of class ( 0| 553| 2) = dba.t1', [['1', 'X_LOCK']]),
      ...lockObject('Instance of class ( 0| 553| 3) = dba.t1', [['1', 'X_LOCK']]),
      ...lockObject('Instance of class ( 0| 600| 1) = dba.t2', [['2', 'X_LOCK']]),
    ];

    expect(summarizeLocks(lockinfo(entries))).toEqual({
      totalLocks: 5,
      rows: [
        { index: '1', user: 'DBA', host: 'app1', pid: '111', program: 'loader', obj: 'Instance of class = dba.t1', mode: 'X_LOCK', count: 3 },
        { index: '1', user: 'DBA', host: 'app1', pid: '111', program: 'loader', obj: 'Class = dba.t1', mode: 'IX_LOCK', count: 1 },
        { index: '2', user: 'PUBLIC', host: 'app2', pid: '222', program: 'csql', obj: 'Class = dba.t1', mode: 'IX_LOCK', count: 1 },
        { index: '2', user: 'PUBLIC', host: 'app2', pid: '222', program: 'csql', obj: 'Instance of class = dba.t2', mode: 'X_LOCK', count: 1 },
      ],
    });
  });

  it('returns no rows for an empty or missing lock table', () => {
    expect(summarizeLocks(lockinfo([]))).toEqual({ rows: [], totalLocks: 0 });
    expect(summarizeLocks(undefined)).toEqual({ rows: [], totalLocks: 0 });
  });

  it('shows a holder with no matching transaction by its index alone', () => {
    const { rows } = summarizeLocks(lockinfo(lockObject('Class = dba.t1', [['9', 'S_LOCK']])));
    expect(rows).toEqual([{ index: '9', user: '-', host: '-', pid: '-', program: '-', obj: 'Class = dba.t1', mode: 'S_LOCK', count: 1 }]);
  });

  it('turns a 30,000-row bulk insert into one row', () => {
    const entries = Array.from({ length: 30000 }, (_, i) =>
      lockObject(`Instance of class ( 0| ${600 + Math.floor(i / 100)}| ${i % 100}) = dba.big`, [['1', 'X_LOCK']])
    ).flat();

    const started = Date.now();
    const { rows, totalLocks } = summarizeLocks(lockinfo(entries));

    expect(totalLocks).toBe(30000);
    expect(rows).toEqual([expect.objectContaining({ obj: 'Instance of class = dba.big', mode: 'X_LOCK', count: 30000 })]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
