import { describe, expect, it } from 'vitest';
import { brokerAccessModeOf, brokerDotStatus, brokerStateOf, brokerStateVariant, isBrokerOn, isBrokerRunning } from './brokerState';

describe('brokerStateOf', () => {
  it('reads a broker listed without a state (broker service stopped) as OFF', () => {
    expect(brokerStateOf({ name: 'query_editor', port: '30000' })).toBe('OFF');
    expect(brokerStateOf({ name: 'b', state: '' })).toBe('OFF');
    expect(brokerStateOf({ name: 'b', state: '  ' })).toBe('OFF');
    expect(brokerStateOf(undefined)).toBe('OFF');
    expect(isBrokerOn({ name: 'b' })).toBe(false);
    expect(isBrokerRunning({ name: 'b' })).toBe(false);
  });

  it('keeps the state CMS sent', () => {
    expect(brokerStateOf({ state: 'ON' })).toBe('ON');
    expect(brokerStateOf({ state: 'OFF' })).toBe('OFF');
    expect(brokerStateOf({ state: 'SUSPENDED' })).toBe('SUSPENDED');
    expect(brokerStateOf({ status: 'ON' })).toBe('ON');
    expect(isBrokerOn({ state: 'ON' })).toBe(true);
    expect(isBrokerRunning({ state: 'SUSPENDED' })).toBe(true);
  });
});

describe('a SUSPENDED broker', () => {
  const suspended = { name: 'b', state: 'SUSPENDED' };
  it('counts as running, not as ON', () => {
    expect(isBrokerRunning(suspended)).toBe(true);
    expect(isBrokerOn(suspended)).toBe(false);
  });

  it('shows in orange, apart from ON and OFF', () => {
    expect(brokerStateVariant(suspended)).toBe('amber');
    expect(brokerStateVariant({ state: 'ON' })).toBe('emerald');
    expect(brokerStateVariant({})).toBe('rose');
    expect(brokerDotStatus(suspended)).toBe('suspended');
    expect(brokerDotStatus({ state: 'ON' })).toBe('on');
    expect(brokerDotStatus({})).toBe('off');
  });
});

describe('brokerAccessModeOf', () => {
  it('gives RW, RO or SO as CMS sends it for a running broker', () => {
    expect(brokerAccessModeOf({ state: 'ON', access_mode: 'RW' })).toBe('RW');
    expect(brokerAccessModeOf({ state: 'ON', access_mode: ' ro ' })).toBe('RO');
    expect(brokerAccessModeOf({ state: 'SUSPENDED', access_mode: 'SO' })).toBe('SO');
  });

  it('gives nothing for a stopped broker or a missing value', () => {
    expect(brokerAccessModeOf({ state: 'OFF', access_mode: 'RW' })).toBe('');
    expect(brokerAccessModeOf({ access_mode: 'RW' })).toBe('');
    expect(brokerAccessModeOf({ state: 'ON' })).toBe('');
    expect(brokerAccessModeOf(undefined)).toBe('');
  });
});
