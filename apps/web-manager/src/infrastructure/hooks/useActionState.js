import { useState, useCallback } from 'react';
import { getCM, getStoredLocale } from '../../constants/useCM';

/**
 * State constants for action lifecycle
 */
export const ACTION_STATE = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * A shared hook to manage the lifecycle of an asynchronous action (e.g., API calls in modals)
 * Returns state, error, and convenience methods to transition between states.
 */
export const useActionState = (initialState = ACTION_STATE.IDLE) => {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState(null);

  const startAction = useCallback(() => {
    setError(null);
    setState(ACTION_STATE.LOADING);
  }, []);

  const endSuccess = useCallback(() => {
    setState(ACTION_STATE.SUCCESS);
  }, []);

  const endError = useCallback((err) => {
    // Normalize error message
    const msg = typeof err === 'string' ? err : (err?.message || err?.error || getCM(getStoredLocale()).operationFailed);
    setError(msg);
    setState(ACTION_STATE.ERROR);
  }, []);

  const resetAction = useCallback(() => {
    setError(null);
    setState(ACTION_STATE.IDLE);
  }, []);

  const isIdle = state === ACTION_STATE.IDLE;
  const isLoading = state === ACTION_STATE.LOADING;
  const isSuccess = state === ACTION_STATE.SUCCESS;
  const isError = state === ACTION_STATE.ERROR;

  return {
    state,
    error,
    startAction,
    endSuccess,
    endError,
    resetAction,
    // Convenience booleans
    isIdle,
    isLoading,
    isSuccess,
    isError,
  };
};
