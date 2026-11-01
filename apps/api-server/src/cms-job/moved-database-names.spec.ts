import { movedDatabaseNames } from './cms-job.service';

describe('movedDatabaseNames', () => {
  it('treats a rename and a copy with move=y as moving the database', () => {
    expect(movedDatabaseNames({ type: 'rename', dbname: 'a', payload: { rename: 'b' } } as any)).toEqual({ from: 'a', to: 'b' });
    expect(movedDatabaseNames({
      type: 'copy', dbname: 'b', payload: { srcdbname: 'a', destdbname: 'b', move: 'y' },
    } as any)).toEqual({ from: 'a', to: 'b' });
  });

  it('leaves a plain copy and other jobs alone', () => {
    expect(movedDatabaseNames({
      type: 'copy', dbname: 'b', payload: { srcdbname: 'a', destdbname: 'b', move: 'n' },
    } as any)).toBeNull();
    expect(movedDatabaseNames({ type: 'backupdb', dbname: 'a', payload: {} } as any)).toBeNull();
  });
});
