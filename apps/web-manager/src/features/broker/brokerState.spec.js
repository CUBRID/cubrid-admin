import { describe, expect, it } from 'vitest';
import { brokerStateOf, isBrokerOn, isBrokerRunning } from './brokerState';

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
