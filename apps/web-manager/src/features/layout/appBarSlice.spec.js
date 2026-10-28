import { describe, expect, it } from 'vitest';
import reducer, { closeUpdateCheck, openUpdateCheck } from './appBarSlice';

const preloadedStatus = { currentVersion: '1.0.0', lastCheckedAt: null, result: { status: 'up-to-date' } };

describe('appBarSlice update check', () => {
  it('starts closed', () => {
    expect(reducer(undefined, { type: '@@init' }).updateCheck).toEqual({
      isOpen: false,
      source: 'manual',
      preloadedStatus: null,
    });
  });

  it('opens a manual check without a preloaded status', () => {
    const state = reducer(undefined, openUpdateCheck({ source: 'manual' }));
    expect(state.updateCheck).toEqual({ isOpen: true, source: 'manual', preloadedStatus: null });
  });

  it('opens a startup notice with its preloaded status', () => {
    const state = reducer(undefined, openUpdateCheck({ source: 'startup', preloadedStatus }));
    expect(state.updateCheck).toEqual({ isOpen: true, source: 'startup', preloadedStatus });
  });

  it('treats an unknown or missing source as manual', () => {
    expect(reducer(undefined, openUpdateCheck({ source: 'bogus' })).updateCheck.source).toBe('manual');
    expect(reducer(undefined, openUpdateCheck()).updateCheck.source).toBe('manual');
  });

  it('does not let a startup notice replace a modal the user already opened', () => {
    const opened = reducer(undefined, openUpdateCheck({ source: 'manual' }));
    const state = reducer(opened, openUpdateCheck({ source: 'startup', preloadedStatus }));
    expect(state.updateCheck).toEqual({ isOpen: true, source: 'manual', preloadedStatus: null });
  });

  it('resets everything on close', () => {
    const opened = reducer(undefined, openUpdateCheck({ source: 'startup', preloadedStatus }));
    expect(reducer(opened, closeUpdateCheck()).updateCheck).toEqual({
      isOpen: false,
      source: 'manual',
      preloadedStatus: null,
    });
  });
});
