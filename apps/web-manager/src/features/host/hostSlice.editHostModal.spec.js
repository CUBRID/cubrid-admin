import { describe, expect, it } from 'vitest';
import reducer, { openEditHostModal, closeEditHostModal } from './hostSlice';

describe('Edit Host modal state', () => {
  it('opens for a plain host uid with the password kept', () => {
    const state = reducer(undefined, openEditHostModal('h1'));
    expect(state.isEditHostModalOpen).toBe(true);
    expect(state.hostToEditUid).toBe('h1');
    expect(state.editHostPasswordRejected).toBe(false);
  });

  it('remembers that the saved password was turned down, until it closes', () => {
    let state = reducer(undefined, openEditHostModal({ hostUid: 'h1', passwordRejected: true }));
    expect(state.hostToEditUid).toBe('h1');
    expect(state.editHostPasswordRejected).toBe(true);
    state = reducer(state, closeEditHostModal());
    expect(state.editHostPasswordRejected).toBe(false);
    state = reducer(state, openEditHostModal('h1'));
    expect(state.editHostPasswordRejected).toBe(false);
  });
});
