import { renameAutostart } from './rename-autostart';

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
    expect(renameAutostart(['[service]', '#server=old', 'server=old', '[service]', 'server=other,old'], 'old', 'new')).toEqual([
      '[service]', '#server=old', 'server=new', '[service]', 'server=other,new',
    ]);
  });

  it('handles an old name split across continued physical lines', () => {
    expect(renameAutostart(['[service]', 'server=other,ol\\', 'd,last # keep'], 'old', 'new')).toEqual([
      '[service]', 'server=other,new,last # keep',
    ]);
  });
});
