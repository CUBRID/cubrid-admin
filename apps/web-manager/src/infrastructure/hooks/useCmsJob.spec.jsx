import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCmsJob } from './useCmsJob';

const mocks = vi.hoisted(() => ({ runJob: vi.fn(), dismissJobResult: vi.fn() }));
vi.mock('./useCmsJobs', () => ({ useCmsJobs: () => mocks }));
vi.mock('../services/cmsJobRunner', () => ({ cancelCmsJobPoll: vi.fn() }));
let root;
let container;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it.each([
  [false, false, false], [false, true, false],
  [true, false, false], [true, true, false],
  [false, false, true], [true, false, true],
])('handles Strict Mode result ownership: shared=%s failure=%s background=%s', async (sharedResult, failure, backgrounded) => {
  let settle;
  mocks.runJob.mockImplementation(async submit => {
    const created = await submit();
    await new Promise(resolve => { settle = resolve; });
    if (failure) throw new Error('Job failed');
    return created;
  });
  function Harness() {
    const { runJob, background } = useCmsJob({ sharedResult });
    return <>
      <button id="run" onClick={() => runJob(async () => ({ jobId: 'job-1' })).catch(() => undefined)}>Run</button>
      <button id="background" onClick={background}>Background</button>
    </>;
  }
  await act(async () => root.render(<StrictMode><Harness /></StrictMode>));
  await act(async () => container.querySelector('#run').click());
  if (backgrounded) await act(async () => container.querySelector('#background').click());
  await act(async () => settle());
  if (sharedResult || backgrounded) expect(mocks.dismissJobResult).not.toHaveBeenCalled();
  else expect(mocks.dismissJobResult).toHaveBeenCalledWith('job-1');
});
