/**
 * What the workspace page shows while the server starts: "starting" with the
 * time so far, and "slow" after the soft limit, where the user picks Keep
 * waiting or Stop. Main sends every change to the page
 * ('desktop:api-start-status'); the page also reads it when it loads.
 */
export type ApiStartStatus =
  | { state: 'idle' }
  | { state: 'starting'; elapsedMs: number }
  | { state: 'slow'; elapsedMs: number };

export type ApiStartDecision = 'wait' | 'stop';

type Listener = (status: ApiStartStatus) => void;

let status: ApiStartStatus = { state: 'idle' };
let listener: Listener = () => undefined;
let pendingDecision: ((decision: ApiStartDecision) => void) | null = null;

/** Main sets how a change reaches the page (main.ts sends it to the window). */
export function onApiStartStatus(next: Listener): void {
  listener = next;
}

export function getApiStartStatus(): ApiStartStatus {
  return status;
}

export function setApiStartStatus(next: ApiStartStatus): void {
  status = next;
  if (next.state !== 'slow' && pendingDecision) {
    // Started or failed while the question was open: it no longer applies.
    pendingDecision('wait');
    pendingDecision = null;
  }
  listener(next);
}

/** Shows the slow notice and resolves with the user's answer. */
export function askKeepWaiting(elapsedMs: number): Promise<ApiStartDecision> {
  setApiStartStatus({ state: 'slow', elapsedMs });
  return new Promise((resolve) => {
    pendingDecision = resolve;
  });
}

/** The page's answer to the slow notice. */
export function decideApiStart(decision: ApiStartDecision): void {
  const resolve = pendingDecision;
  pendingDecision = null;
  resolve?.(decision);
}
