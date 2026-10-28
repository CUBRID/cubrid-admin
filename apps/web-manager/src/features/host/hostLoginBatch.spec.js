import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
vi.mock('./hostApi', () => ({
  hostApi: { loginToHost: vi.fn(), markGroupHa: vi.fn(), moveHost: vi.fn() },
}));
import { hostApi } from './hostApi';
import hostReducer, {
  loginHostsBatch, loginToHost, loginToHostWithSideEffects, processHaLoginSideEffects, haFollowUpAction,
  mergeHaPeers,
} from './hostSlice';
import { hostLoginResultStatusModal } from './hostLoginReport';
import { CM } from '../../constants/cmLabels';

// Bulk logins used to open an HA modal per host mid-batch (discovery /
// merge / cluster-linked), then the result modal on top. Now the batch
// collects them and the single result dialog offers each one on demand.

const host = (uid, alias, address) => ({ uid, id: 'admin', alias, address, port: 8001, initialLogin: false });
const makeStore = () => {
  const base = hostReducer(undefined, { type: '@@init' });
  const hosts = [host('h1', 'node-a', '10.0.0.1'), host('h2', 'node-b', '10.0.0.2')];
  return configureStore({
    reducer: { host: hostReducer },
    preloadedState: {
      host: {
        ...base,
        hosts,
        hostGroups: { g1: { name: 'G1', hosts: { h1: hosts[0], h2: hosts[1] } } },
        hostsAwaitingHaLogin: ['h1'],
      },
    },
  });
};
// h1's cluster has a peer nobody registered yet → discovery follow-up.
const haLogin = { success: true, isHA: true, haNodes: [{ hostname: 'peer-x', ip: '10.9.9.9', port: 8001 }] };

beforeEach(() => {
  vi.resetAllMocks();
  hostApi.markGroupHa.mockRejectedValue(new Error('not needed here'));
});

describe('HA side effects: collect mode for bulk logins', () => {
  it('collect mode returns the follow-up and opens no HA modal', async () => {
    hostApi.loginToHost.mockResolvedValue(haLogin);
    const store = makeStore();
    await store.dispatch(loginToHost('h1'));
    const seen = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getState().host.isDiscoveryModalOpen));

    const out = await store.dispatch(processHaLoginSideEffects({ hostUid: 'h1', collect: true })).unwrap();
    unsubscribe();

    expect(out.followUp).toEqual({
      type: 'discovery',
      payload: { nodes: haLogin.haNodes, groupId: 'g1', anchorHostUid: 'h1' },
    });
    const state = store.getState().host;
    expect(seen).not.toContain(true);
    expect(state.isDiscoveryModalOpen).toBe(false);
    expect(state.isHaMergeModalOpen).toBe(false);
    expect(state.isHaClusterLinkModalOpen).toBe(false);
    expect(state.suggestedHaNodes).toEqual([]);
    // Non-modal bookkeeping still ran, so nothing is left pending to pop later.
    expect(state.hostsAwaitingHaLogin).not.toContain('h1');
  });

  it('loginHostsBatch returns per-host results with the collected follow-up', async () => {
    hostApi.loginToHost.mockImplementation(async (uid) => {
      if (uid === 'h2') throw { response: { data: { message: 'Error: bad password' } } };
      return haLogin;
    });
    const store = makeStore();

    const batch = await store.dispatch(loginHostsBatch(['h1', 'h2'])).unwrap();

    expect(store.getState().host.isDiscoveryModalOpen).toBe(false);
    expect(batch.successCount).toBe(1);
    expect(batch.failed).toEqual([{ name: 'node-b', reason: 'Error: bad password' }]);
    expect(batch.results).toEqual([
      {
        uid: 'h1', name: 'node-a', status: 'connected',
        followUp: {
          type: 'discovery',
          payload: { nodes: haLogin.haNodes, groupId: 'g1', anchorHostUid: 'h1' },
        },
      },
      { uid: 'h2', name: 'node-b', status: 'failed', reason: 'Error: bad password' },
    ]);
  });

  it('marks an already-connected host as skipped without logging in again', async () => {
    hostApi.loginToHost.mockResolvedValue({ success: true, isHA: false });
    const store = makeStore();
    await store.dispatch(loginHostsBatch(['h2']));
    hostApi.loginToHost.mockClear();

    const batch = await store.dispatch(loginHostsBatch(['h2'])).unwrap();

    expect(hostApi.loginToHost).not.toHaveBeenCalled();
    expect(batch.results).toEqual([{ uid: 'h2', name: 'node-b', status: 'skipped' }]);
  });

  it('single-host login (loginToHostWithSideEffects) is unchanged: it opens the modal', async () => {
    hostApi.loginToHost.mockResolvedValue(haLogin);
    const store = makeStore();

    await store.dispatch(loginToHostWithSideEffects('h1'));

    const state = store.getState().host;
    expect(state.isDiscoveryModalOpen).toBe(true);
    expect(state.suggestedHaNodes).toEqual(haLogin.haNodes);
    expect(state.suggestedHaAnchorHostUid).toBe('h1');
  });

  it('haFollowUpAction rebuilds the exact deferred modal action', () => {
    const payload = { nodes: haLogin.haNodes, groupId: 'g1', anchorHostUid: 'h1' };
    expect(haFollowUpAction({ type: 'discovery', payload })).toEqual({ type: 'host/setSuggestedHaNodes', payload });
    expect(haFollowUpAction({ type: 'merge', payload: { peers: [1] } }).type).toBe('host/setPendingHaMerge');
    expect(haFollowUpAction({ type: 'clusterLink', payload: { peers: [1] } }).type).toBe('host/setHaClusterLinkNotice');
    expect(haFollowUpAction(null)).toBeNull();
  });
});

describe('deferred HA merge follow-ups are re-based on the current groups', () => {
  // Bug: A and B (one HA pair) in different groups, logged in together,
  // each got a stored plan — "move B into A's group" and "move A into B's
  // group". Running both in turn split the pair again.
  const a = host('h1', 'node-a', '10.0.0.1');
  const b = host('h2', 'node-b', '10.0.0.2');
  const pairLogin = {
    success: true,
    isHA: true,
    haNodes: [{ hostname: 'node-a', ip: '10.0.0.1', state: 'master' }, { hostname: 'node-b', ip: '10.0.0.2', state: 'slave' }],
  };
  const makeSplitStore = () => configureStore({
    reducer: { host: hostReducer },
    preloadedState: {
      host: {
        ...hostReducer(undefined, { type: '@@init' }),
        hosts: [a, b],
        hostGroups: { g1: { name: 'G1', hosts: { h1: a } }, g2: { name: 'G2', hosts: { h2: b } } },
      },
    },
  });

  it('drops the second merge once the first one has put both hosts in one group', async () => {
    hostApi.loginToHost.mockResolvedValue(pairLogin);
    const store = makeSplitStore();
    const batch = await store.dispatch(loginHostsBatch(['h1', 'h2'])).unwrap();
    const [fa, fb] = batch.results.map((r) => r.followUp);
    expect([fa?.type, fb?.type]).toEqual(['merge', 'merge']);

    const first = haFollowUpAction(fa, store.getState().host);
    expect(first.payload).toMatchObject({ targetGroupId: 'g1', peers: [{ hostUid: 'h2' }] });
    hostApi.moveHost.mockResolvedValue({ host_groups: { g1: { name: 'G1', hosts: { h1: a, h2: b } }, g2: { name: 'G2', hosts: {} } } });
    await store.dispatch(mergeHaPeers(first.payload)).unwrap();

    expect(haFollowUpAction(fb, store.getState().host)).toBeNull();
    expect(haFollowUpAction(fa, store.getState().host)).toBeNull();
  });

  it('a discovery follow-up takes the anchor host\'s current group', () => {
    const followUp = { type: 'discovery', payload: { nodes: [{ hostname: 'peer-x' }], groupId: 'g2', anchorHostUid: 'h2' } };
    const hostState = { hostGroups: { g1: { name: 'G1', hosts: { h1: a, h2: b } } }, haInfo: {} };
    expect(haFollowUpAction(followUp, hostState).payload.groupId).toBe('g1');
  });
});

describe('hostLoginResultStatusModal', () => {
  it('builds one table row per host with result, reason and follow-up', () => {
    const followUp = { type: 'discovery', payload: { nodes: [], groupId: 'g1', anchorHostUid: 'h1' } };
    const report = hostLoginResultStatusModal(CM, {
      title: CM.loginAll,
      batch: {
        successCount: 1,
        failed: [{ name: 'node-b', reason: 'bad password' }],
        results: [
          { uid: 'h1', name: 'node-a', status: 'connected', followUp },
          { uid: 'h2', name: 'node-b', status: 'failed', reason: 'bad password' },
          { uid: 'h3', name: 'node-c', status: 'skipped' },
        ],
      },
    });

    expect(report.type).toBe('info');
    expect(report.message).toBe('Connected 1 host(s). 1 host(s) failed to log in. 1 host(s) have an HA follow-up.');
    expect(report.tables[0].rows).toEqual([
      { uid: 'h1', name: 'node-a', result: 'Connected', reasons: [], followUp },
      { uid: 'h2', name: 'node-b', result: 'Failed', reasons: [{ reason: 'bad password' }], followUp: null },
      { uid: 'h3', name: 'node-c', result: 'Already connected', reasons: [], followUp: null },
    ]);
  });

  it('no table when every host just connected', () => {
    const report = hostLoginResultStatusModal(CM, {
      title: CM.loginAll,
      batch: { successCount: 2, failed: [], results: [
        { uid: 'h1', name: 'a', status: 'connected' }, { uid: 'h2', name: 'b', status: 'connected' },
      ] },
    });
    expect(report).toEqual({ type: 'success', title: CM.loginAll, message: 'Connected 2 host(s).', tables: null });
  });
});
