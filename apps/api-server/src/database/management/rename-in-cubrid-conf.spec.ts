import { renameDbInCubridConf } from './rename-in-cubrid-conf';

describe('renameDbInCubridConf', () => {
  it('renames the database in the [service] autostart list and its own section', () => {
    const conf = [
      '[service]',
      'service=server,broker,manager',
      'server=demodb, olddb ,testdb  # autostart',
      '',
      '[common]',
      'data_buffer_size=512M',
      '',
      '[@olddb]',
      'data_buffer_size=1G',
    ];

    expect(renameDbInCubridConf(conf, 'olddb', 'newdb')).toEqual([
      '[service]',
      'service=server,broker,manager',
      'server=demodb,newdb,testdb # autostart',
      '',
      '[common]',
      'data_buffer_size=512M',
      '',
      '[@newdb]',
      'data_buffer_size=1G',
    ]);
  });

  it('returns null when nothing names the old database', () => {
    expect(renameDbInCubridConf(['[service]', 'server=demodb', '[@olddbx]'], 'olddb', 'newdb')).toBeNull();
  });

  it('leaves a server= line outside [service] and a commented-out one alone', () => {
    const conf = ['[common]', 'server=olddb', '[service]', '#server=olddb'];

    expect(renameDbInCubridConf(conf, 'olddb', 'newdb')).toBeNull();
  });

  it('keeps the old section header when a section for the new name already exists', () => {
    const conf = ['[service]', 'server=olddb', '[@olddb]', 'a=1', '[@newdb]', 'a=2'];

    expect(renameDbInCubridConf(conf, 'olddb', 'newdb')).toEqual([
      '[service]', 'server=newdb', '[@olddb]', 'a=1', '[@newdb]', 'a=2',
    ]);
  });

  it('does not list the new name twice when it was already in the autostart list', () => {
    expect(renameDbInCubridConf(['[service]', 'server=newdb,olddb'], 'olddb', 'newdb')).toEqual([
      '[service]', 'server=newdb',
    ]);
  });

  it('matches section names the way the engine does: [service] in any case, [@name] case-sensitive', () => {
    expect(renameDbInCubridConf(['[ Service ]', 'server=olddb', '[@OLDDB]'], 'olddb', 'newdb')).toEqual([
      '[ Service ]', 'server=newdb', '[@OLDDB]',
    ]);
  });
});
