import {
  editServerList,
  forgetDbInCubridConf,
  isAutostart,
  removeAutostart,
  renameAutostart,
  renameDbSection,
} from './cubrid-conf-edit';

describe('rename autostart configuration', () => {
  it('replaces exact tokens while preserving quotes, spacing, comments, and unrelated sections', () => {
    const before = ['# old', '[SERVICE]', 'service=server,broker', '  SERVER = "other, old ,old_archive" # keep old comment', '[common]', 'server=old', 'max_clients=100'];
    expect(renameAutostart(before, 'old', 'new')).toEqual([
      '# old', '[SERVICE]', 'service=server,broker', '  SERVER = "other, new ,old_archive" # keep old comment', '[common]', 'server=old', 'max_clients=100',
    ]);
    expect(before[3]).toContain(' old ');
  });

  it.each([
    ['[service]', 'server=other,old_archive'],
    ['[service]', 'server='],
    ['[service]', 'service=broker'],
    ['[common]', 'server=old'],
  ])('does not enable autostart when the old name is absent: %j', (...lines) => {
    expect(renameAutostart(lines, 'old', 'new')).toEqual(lines);
  });

  it('does not duplicate the new name, including repeated old entries', () => {
    expect(renameAutostart(['[service]', 'server=old,new,old,other'], 'old', 'new')).toEqual(['[service]', 'server=new,other']);
  });

  it('is idempotent after an interrupted completion is reconciled', () => {
    const once = renameAutostart(['[service]', 'server=old,other'], 'old', 'new');
    expect(renameAutostart(once, 'old', 'new')).toEqual(once);
  });

  it('updates repeated service definitions without touching commented server lines', () => {
    expect(renameAutostart(['[service]', '#server=old', 'server=old', '[service]', 'server=other,new'.replace('new', 'old')], 'old', 'new')).toEqual([
      '[service]', '#server=old', 'server=new', '[service]', 'server=other,new',
    ]);
  });

  it('handles an old name split across continued physical lines', () => {
    expect(renameAutostart(['[service]', 'server=other,ol\\', 'd,last # keep'], 'old', 'new')).toEqual([
      '[service]', 'server=other,new,last # keep',
    ]);
  });
});

describe('editServerList', () => {
  const add = (dbname: string) => (names: string[]) => [...names, dbname];

  it('adds a name keeping indentation, key case, spacing around =, the list spacing and the comment', () => {
    expect(editServerList(['[service]', '\tServer = a, b   # autostart', 'x=1'], add('c'), { firstOnly: true })).toEqual([
      '[service]', '\tServer = a, b, c   # autostart', 'x=1',
    ]);
  });

  it('adds a name inside quotes, also to an empty quoted list', () => {
    expect(editServerList(['[service]', "server='a,b'"], add('c'))).toEqual(['[service]', "server='a,b,c'"]);
    expect(editServerList(['[service]', 'server=""  ; none'], add('c'))).toEqual(['[service]', 'server="c"  ; none']);
  });

  it('joins a server= key continued over several lines into one, so no piece is left behind', () => {
    const conf = ['[service]', '  server=a,\\', '         gone,\\', '         b  # list', '[common]'];
    expect(removeAutostart(conf, 'gone')).toEqual(['[service]', '  server=a, b  # list', '[common]']);
  });

  it('leaves a continued key untouched when its list does not change', () => {
    const conf = ['[service]', 'server=a,\\', '  b'];
    expect(removeAutostart(conf, 'gone')).toBe(conf);
  });

  it('only edits the first server= key with firstOnly', () => {
    expect(editServerList(['[service]', 'server=a', 'server=b'], add('c'), { firstOnly: true })).toEqual(['[service]', 'server=a,c', 'server=b']);
  });

  it('removes the last name, leaving an empty value with its comment', () => {
    expect(removeAutostart(['[service]', 'server=gone # only'], 'gone')).toEqual(['[service]', 'server= # only']);
  });

  it('tells whether a name is in a [service] server= list, as the engine reads it', () => {
    expect(isAutostart(['[service]', 'server=a,\\', ' b'], 'b')).toBe(true);
    expect(isAutostart(['[service]', '#server=b'], 'b')).toBe(false);
    expect(isAutostart(['[common]', 'server=b'], 'b')).toBe(false);
  });
});

describe('renameDbSection', () => {
  it("renames the database's own [@old] section header and nothing else", () => {
    const conf = ['[service]', 'server=old', '[@old]', 'ha_mode=off', '[@other]', 'ha_mode=off'];
    expect(renameDbSection(conf, 'old', 'new')).toEqual({
      lines: ['[service]', 'server=old', '[@new]', 'ha_mode=off', '[@other]', 'ha_mode=off'],
      kept: false,
    });
  });

  it('keeps [@old] and says so when a [@new] section already exists', () => {
    const conf = ['[@old]', 'ha_mode=off', '[@new]', 'ha_mode=on'];
    expect(renameDbSection(conf, 'old', 'new')).toEqual({ lines: conf, kept: true });
  });

  it('changes nothing when there is no [@old] section', () => {
    const conf = ['[service]', 'server=old'];
    expect(renameDbSection(conf, 'old', 'new')).toEqual({ lines: conf, kept: false });
  });

  it('matches [@name] like the engine and changes only the name: indentation and spaces in the brackets stay', () => {
    expect(renameDbSection(['  [ @old ]', '  # its settings', '  ha_mode=off'], 'old', 'new').lines).toEqual([
      '  [ @new ]', '  # its settings', '  ha_mode=off',
    ]);
    expect(renameDbSection(['[@OLD]'], 'old', 'new').lines).toEqual(['[@OLD]']);
  });
});

describe('forgetDbInCubridConf', () => {
  it('takes the database out of the autostart list and drops its own section only', () => {
    const conf = ['[service]', 'server="a, gone, b"  # x', '[@gone]', 'ha_mode=off', '', '[@b]', 'a=1'];

    expect(forgetDbInCubridConf(conf, 'gone')).toEqual(['[service]', 'server="a, b"  # x', '', '[@b]', 'a=1']);
  });

  it("keeps the comments after the section's last key, which introduce the next section", () => {
    const conf = ['[@gone]', '# gone settings', 'ha_mode=off', '', '# settings of b', '[@b]', 'a=1'];

    expect(forgetDbInCubridConf(conf, 'gone')).toEqual(['', '# settings of b', '[@b]', 'a=1']);
  });

  it('removes the database from a continued server= key without leaving a piece behind', () => {
    const conf = ['[service]', 'server=a,\\', '  gone'];

    expect(forgetDbInCubridConf(conf, 'gone')).toEqual(['[service]', 'server=a']);
  });

  it('returns null when nothing names the database', () => {
    expect(forgetDbInCubridConf(['[service]', 'server=a', '[@gonex]'], 'gone')).toBeNull();
  });
});
