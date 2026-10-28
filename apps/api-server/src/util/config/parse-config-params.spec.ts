import { parseConfigParams, parseConfigParamsBySection } from './parse-config-params';

const conf = (lines: string[]) => ({ conflist: [{ confdata: lines }] }) as never;

describe('parseConfigParams / parseConfigParamsBySection — engine INI rules', () => {
  it('lowercases section names and keys the way the engine matches them', () => {
    const grouped = parseConfigParamsBySection(conf(['[Common]', 'HA_MODE=on', '[SERVICE]', 'Server=demodb']));
    expect(grouped.common.ha_mode).toBe('on');
    expect(grouped.service.server).toBe('demodb');
  });

  it('keeps [@dbname] case-sensitive, like the engine', () => {
    const grouped = parseConfigParamsBySection(conf(['[@DemoDB]', 'ha_mode=off', '[@demodb]', 'ha_mode=on']));
    expect(grouped['@DemoDB'].ha_mode).toBe('off');
    expect(grouped['@demodb'].ha_mode).toBe('on');
  });

  it('strips quotes and inline comments from values', () => {
    const params = parseConfigParams(conf(['[service]', 'server="db1,db2" # autostart']));
    expect(params).toEqual([{ key: 'server', value: 'db1,db2', section: 'service', lineNumber: 2 }]);
  });

  it('merges a repeated section, last value winning', () => {
    const grouped = parseConfigParamsBySection(conf(['[common]', 'max_clients=100', '[@db]', 'a=1', '[common]', 'max_clients=200']));
    expect(grouped.common.max_clients).toBe('200');
  });
});
