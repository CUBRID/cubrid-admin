import { describe, expect, it } from 'vitest';
import { autoStartDatabases } from './autoStartDatabases';

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
});
