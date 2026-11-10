import { describe, expect, it } from 'vitest';
import { autoStartDatabases, splitConfList } from '@api-interfaces';

describe('autoStartDatabases', () => {
  it('reads a plain [service] section', () => {
    expect(autoStartDatabases(['[service]', 'service=server,broker', 'server=a,b'])).toEqual(['a', 'b']);
  });

  it('reads an upper-case key with spaces, quotes and a trailing comment', () => {
    expect(autoStartDatabases(['[service]', 'service = server, broker', '  SERVER = "a, b"   # autostart'])).toEqual(['a', 'b']);
  });

  it('reads a server= value continued over lines with a backslash', () => {
    expect(autoStartDatabases(['[service]', 'service=server', 'server=a,\\', '       b,\\', '       c'])).toEqual(['a', 'b', 'c']);
  });

  it('ignores server= outside [service] and commented-out keys', () => {
    expect(autoStartDatabases(['[service]', 'service=server', '#server=x', 'server=a', '[common]', 'server=y'])).toEqual(['a']);
  });

  it('uses the last server= key, as the engine does', () => {
    expect(autoStartDatabases(['[service]', 'service=server', 'server=a', 'server=b'])).toEqual(['b']);
  });

  it('is empty when service= does not include server', () => {
    expect(autoStartDatabases(['[service]', 'service=broker,manager', 'server=a'])).toEqual([]);
  });

  it('splits server= on spaces, commas and colons, as util_service.c does', () => {
    expect(autoStartDatabases(['[service]', 'service=server', 'server=a b:c,, d'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('splits service= on spaces, tabs and commas but not colons, and matches server case-sensitively', () => {
    expect(autoStartDatabases(['[service]', 'service=broker\tserver', 'server=a'])).toEqual(['a']);
    expect(autoStartDatabases(['[service]', 'service=server:broker', 'server=a'])).toEqual([]);
    expect(autoStartDatabases(['[service]', 'service=Server,broker', 'server=a'])).toEqual([]);
  });
});

describe('splitConfList', () => {
  it('drops empty pieces between runs of delimiters', () => {
    expect(splitConfList(' a,,b : c ')).toEqual(['a', 'b', 'c']);
    expect(splitConfList('')).toEqual([]);
    expect(splitConfList(undefined)).toEqual([]);
  });

  it('splits only on the delimiters given', () => {
    expect(splitConfList('a\tb,c')).toEqual(['a\tb', 'c']);
    expect(splitConfList('a\tb:c', ' \t,')).toEqual(['a', 'b:c']);
  });
});
