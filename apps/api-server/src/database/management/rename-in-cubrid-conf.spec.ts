import { forgetDbInCubridConf, renameDbSection } from './rename-in-cubrid-conf';

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

  it('matches [@name] like the engine: spaces inside the brackets, case-sensitive name', () => {
    expect(renameDbSection(['[ @old ]'], 'old', 'new').lines).toEqual(['[@new]']);
    expect(renameDbSection(['[@OLD]'], 'old', 'new').lines).toEqual(['[@OLD]']);
  });
});

describe('forgetDbInCubridConf', () => {
  it('takes the database out of the autostart list and drops its own section only', () => {
    const conf = ['[service]', 'server="a, gone, b"  # x', '[@gone]', 'ha_mode=off', '', '[@b]', 'a=1'];

    expect(forgetDbInCubridConf(conf, 'gone')).toEqual(['[service]', 'server="a,b"  # x', '[@b]', 'a=1']);
  });

  it('returns null when nothing names the database', () => {
    expect(forgetDbInCubridConf(['[service]', 'server=a', '[@gonex]'], 'gone')).toBeNull();
  });
});
