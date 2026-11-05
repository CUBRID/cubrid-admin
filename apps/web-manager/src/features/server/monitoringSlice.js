import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import monitoringApi from './monitoringApi';
import { computeBrokerRates, cpuUsagePercent, mapDiskInfo } from './hostMetrics';
import apiClient from '../../api/apiClient';
import { createSharedReads } from '../../infrastructure/utils/singleFlight';
import { readSharedBrokerList } from '../broker/brokerSlice';
import { extractHaHeartbeatNodes } from '../host/haPeerUtils';

// Disk usage changes slowly and gethoststat has no disk field, so the
// separate getsysdiskinfo call runs at most this often per host.
const DISK_REFRESH_MS = 30 * 1000;

// Several views poll the same host (the system status section, the host
// dashboard, the HA failover watch), and heartbeatlist alone takes seconds
// on an HA host, so reads are shared per host. A shared monitoring sample is
// applied once: its rates and history are deltas from the previous sample.
const monitoringReads = createSharedReads();
const heartbeatReads = createSharedReads();
// Do not share a read across login sessions.
const readKey = (hostUid) => JSON.stringify([apiClient.defaults.headers.common.Authorization, hostUid]);
const readHeartbeat = (hostUid) => heartbeatReads(readKey(hostUid), () => monitoringApi.getHaHeartbeatList(hostUid));
const readHeartbeatNodes = (hostUid) => heartbeatReads(`${readKey(hostUid)}:nodes`,
  () => monitoringApi.getHaHeartbeatList(hostUid, { nodesOnly: true }));

// Node roles and states, to tell when they change.
const haNodesKey = (haHeartbeat) => JSON.stringify([
  haHeartbeat?.currentnode, haHeartbeat?.currentnodestate, extractHaHeartbeatNodes(haHeartbeat),
]);

// A full heartbeat (dbmodeall y) replaces what is shown when newer. Its
// database part (hadbinfolist) is kept by a later nodes-only read, so it has
// its own seq.
function applyHeartbeat(hostData, haHeartbeat, seq) {
  if (!haHeartbeat) return;
  if (seq > (hostData.heartbeatSeq ?? 0)) {
    hostData.haHeartbeat = haHeartbeat;
    hostData.heartbeatSeq = seq;
  } else if (seq > (hostData.haDbInfoSeq ?? 0) && hostData.haHeartbeat) {
    hostData.haHeartbeat = { ...hostData.haHeartbeat, hadbinfolist: haHeartbeat.hadbinfolist };
  }
  if (seq > (hostData.haDbInfoSeq ?? 0)) {
    hostData.haDbInfoSeq = seq;
    hostData.haDbInfoStale = false;
  }
}

// A nodes-only heartbeat (dbmodeall n) has no database part: it updates the
// nodes and keeps the databases from the last full one. When the nodes
// changed (a failover, or back to normal), the databases are marked stale so
// a full heartbeat is read once.
function applyHeartbeatNodes(hostData, haHeartbeat, seq) {
  if (!haHeartbeat || seq <= (hostData.heartbeatSeq ?? 0)) return;
  const previous = hostData.haHeartbeat;
  if (previous && haNodesKey(previous) !== haNodesKey(haHeartbeat)) hostData.haDbInfoStale = true;
  hostData.haHeartbeat = { ...haHeartbeat, hadbinfolist: previous?.hadbinfolist ?? haHeartbeat.hadbinfolist };
  hostData.heartbeatSeq = seq;
}

const readMonitoringData = async (hostUid, state) => {
  const haInfo = state.host.haInfo[hostUid];
  const isHA = haInfo?.isHA;

  const diskFetchedAt = state.monitoring?.hostsData?.[hostUid]?.diskFetchedAt;
  const shouldFetchDisk = !diskFetchedAt || Date.now() - diskFetchedAt >= DISK_REFRESH_MS;

  const [hostStat, brokers, heartbeat, diskInfo] = await Promise.all([
    monitoringApi.getHostStat(hostUid),
    readSharedBrokerList(hostUid),
    isHA ? readHeartbeat(hostUid) : Promise.resolve(undefined),
    // A disk failure must not fail the whole status poll: null = tried
    // and failed (keep the last value), undefined = not due this tick.
    shouldFetchDisk ? monitoringApi.getSysDiskInfo(hostUid).catch(() => null) : Promise.resolve(undefined),
  ]);
  if (heartbeat && !heartbeat.ok) throw heartbeat.error;
  return { hostStat, brokers, haHeartbeat: heartbeat?.value, heartbeatSeq: heartbeat?.seq, diskInfo };
};

// Thunk to fetch all monitoring data in parallel
export const fetchMonitoringData = createAsyncThunk(
  'monitoring/fetchAll',
  async (hostUid, { getState, rejectWithValue, fulfillWithValue }) => {
    const result = await monitoringReads(readKey(hostUid), () => readMonitoringData(hostUid, getState()));
    if (!result.ok) return rejectWithValue(result.error.response?.data || result.error.message);
    return fulfillWithValue(result.value, { seq: result.seq });
  }
);

// Lightweight companion to fetchMonitoringData — used to poll just the HA
// heartbeat during a suspected failover (see ServerContent's fast-poll
// effect), instead of re-fetching hostStat/brokers too at a 1s cadence. It
// shares a heartbeatlist already in flight, so the 1s watch can't pile up.
export const fetchHaHeartbeatOnly = createAsyncThunk(
  'monitoring/fetchHaHeartbeatOnly',
  async (hostUid, { rejectWithValue }) => {
    const result = await readHeartbeat(hostUid);
    if (!result.ok) return rejectWithValue(result.error.response?.data || result.error.message);
    return { haHeartbeat: result.value, heartbeatSeq: result.seq };
  }
);

// The 1s watch during a suspected failover: node states only, so CMS does
// not run `cubrid changemode` for every database each second.
export const fetchHaNodesOnly = createAsyncThunk(
  'monitoring/fetchHaNodesOnly',
  async (hostUid, { rejectWithValue }) => {
    const result = await readHeartbeatNodes(hostUid);
    if (!result.ok) return rejectWithValue(result.error.response?.data || result.error.message);
    return { haHeartbeat: result.value, heartbeatSeq: result.seq };
  }
);

const initialState = {
  hostsData: {}, // { [hostUid]: { currentStatus, averages, history, prevHostStat, loading, error } }
};

const MAX_HISTORY_MS = 5 * 60 * 1000; // 5 minutes

const monitoringSlice = createSlice({
  name: 'monitoring',
  initialState,
  reducers: {
    clearMonitoring: (state, action) => {
      const hostUid = action.payload;
      if (hostUid && state.hostsData[hostUid]) {
        state.hostsData[hostUid] = {
          ...state.hostsData[hostUid],
          history: [],
          prevHostStat: null,
          brokerSample: null,
          disk: null,
          diskFetchedAt: null,
          error: null,
          haHeartbeat: null,
          currentStatus: { cpu: null, memory: 0, tps: null, qps: null, memUsed: 0, memTotal: 0 },
          averages: { cpu: null, memory: null, tps: null, qps: null },
        };
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMonitoringData.pending, (state, action) => {
        const hostUid = action.meta.arg;
        if (!state.hostsData[hostUid]) {
          state.hostsData[hostUid] = {
            currentStatus: { cpu: null, memory: 0, tps: null, qps: null, memUsed: 0, memTotal: 0 },
            averages: { cpu: null, memory: null, tps: null, qps: null },
            history: [],
            prevHostStat: null,
            brokerSample: null,
            disk: null,
            diskFetchedAt: null,
            loading: true,
            error: null
          };
        } else {
          state.hostsData[hostUid].loading = true;
          state.hostsData[hostUid].error = null;
        }
      })
      .addCase(fetchMonitoringData.fulfilled, (state, action) => {
        const hostUid = action.meta.arg;
        const hostData = state.hostsData[hostUid];
        if (!hostData) return;

        hostData.loading = false;
        // Every view sharing this sample gets it; apply it only once.
        if (action.meta.seq <= (hostData.appliedSeq ?? 0)) return;
        hostData.appliedSeq = action.meta.seq;
        hostData.error = null;
        const { hostStat, brokers, haHeartbeat, heartbeatSeq, diskInfo } = action.payload;
        const now = Date.now();

        // 1. TPS/QPS: per-second rates from the brokers' cumulative counters
        // (null until two samples can be compared).
        const { sample: brokerSample, rates: brokerRates } = computeBrokerRates(hostData.brokerSample, brokers, now);
        hostData.brokerSample = brokerSample;
        const totalTps = brokerRates.tps;
        const totalQps = brokerRates.qps;

        // 2. CPU % (null on the first sample: no delta yet)
        const cpuUsage = cpuUsagePercent(hostData.prevHostStat, hostStat);
        hostData.prevHostStat = hostStat;

        // 3. Calculate Memory %
        const memTotalBytes = parseFloat(hostStat.mem_phy_total || 0);
        const memFreeBytes = parseFloat(hostStat.mem_phy_free || 0);
        const memUsedBytes = memTotalBytes - memFreeBytes;
        const memUsage = memTotalBytes > 0 ? (memUsedBytes / memTotalBytes) * 100 : 0;

        // 4. Update Current Status
        hostData.currentStatus = {
          cpu: cpuUsage,
          memory: memUsage,
          tps: totalTps,
          qps: totalQps,
          memUsed: memUsedBytes,
          memTotal: memTotalBytes,
          // When these were read (the DB dashboard's memory bar uses only a recent read).
          readAt: now,
        };

        // Disk (root filesystem on Linux), fetched on its own slower cadence.
        if (diskInfo !== undefined) {
          hostData.diskFetchedAt = now;
          const disk = mapDiskInfo(diskInfo);
          if (disk) hostData.disk = disk;
        }

        // 5. Update History
        hostData.history.push({
          timestamp: now,
          cpu: cpuUsage,
          memory: memUsage,
          tps: totalTps,
          qps: totalQps,
        });
        hostData.history = hostData.history.filter(h => now - h.timestamp < MAX_HISTORY_MS);

        // 6. Update HA Heartbeat Info if available and newer than shown
        applyHeartbeat(hostData, haHeartbeat, heartbeatSeq);

        // 6. Calculate Averages — only over samples that had a real value
        // (a first sample's "no rate yet" must not pull the average to 0).
        const average = (key) => {
          const values = hostData.history.map((h) => h[key]).filter((v) => v !== null && v !== undefined);
          return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
        };
        hostData.averages = {
          cpu: average('cpu'),
          memory: average('memory'),
          tps: average('tps'),
          qps: average('qps'),
        };
      })
      .addCase(fetchMonitoringData.rejected, (state, action) => {
        const hostUid = action.meta.arg;
        if (state.hostsData[hostUid]) {
          state.hostsData[hostUid].loading = false;
          state.hostsData[hostUid].error = action.payload;
        }
      })
      .addCase(fetchHaHeartbeatOnly.fulfilled, (state, action) => {
        const hostUid = action.meta.arg;
        const hostData = state.hostsData[hostUid];
        if (!hostData) return;
        const { haHeartbeat, heartbeatSeq } = action.payload;
        applyHeartbeat(hostData, haHeartbeat, heartbeatSeq);
      })
      .addCase(fetchHaNodesOnly.fulfilled, (state, action) => {
        const hostData = state.hostsData[action.meta.arg];
        if (!hostData) return;
        applyHeartbeatNodes(hostData, action.payload.haHeartbeat, action.payload.heartbeatSeq);
      });
  }
});

export const { clearMonitoring } = monitoringSlice.actions;
export default monitoringSlice.reducer;
