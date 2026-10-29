import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import monitoringApi from './monitoringApi';
import { computeBrokerRates, mapDiskInfo } from './hostMetrics';
import apiClient from '../../api/apiClient';
import { createSharedReads } from '../../infrastructure/utils/singleFlight';

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

const readMonitoringData = async (hostUid, state) => {
  const haInfo = state.host.haInfo[hostUid];
  const isHA = haInfo?.isHA;

  const diskFetchedAt = state.monitoring?.hostsData?.[hostUid]?.diskFetchedAt;
  const shouldFetchDisk = !diskFetchedAt || Date.now() - diskFetchedAt >= DISK_REFRESH_MS;

  const [hostStat, brokers, heartbeat, diskInfo] = await Promise.all([
    monitoringApi.getHostStat(hostUid),
    monitoringApi.getBrokerList(hostUid),
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

        // 2. Calculate CPU % (null on the first sample: no delta yet)
        let cpuUsage = null;
        if (hostData.prevHostStat) {
          const prev = hostData.prevHostStat;
          const curr = hostStat;

          const cpuUserDelta = parseFloat(curr.cpu_user) - parseFloat(prev.cpu_user);
          const cpuKernelDelta = parseFloat(curr.cpu_kernel) - parseFloat(prev.cpu_kernel);
          const cpuIdleDelta = parseFloat(curr.cpu_idle) - parseFloat(prev.cpu_idle);
          const cpuIowaitDelta = parseFloat(curr.cpu_iowait) - parseFloat(prev.cpu_iowait);

          const totalDelta = cpuUserDelta + cpuKernelDelta + cpuIdleDelta + cpuIowaitDelta;
          cpuUsage = totalDelta > 0 ? (cpuUserDelta / totalDelta) * 100 : null;
        }
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
          memTotal: memTotalBytes
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
        if (haHeartbeat && heartbeatSeq > (hostData.heartbeatSeq ?? 0)) {
          hostData.haHeartbeat = haHeartbeat;
          hostData.heartbeatSeq = heartbeatSeq;
        }

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
        if (haHeartbeat && heartbeatSeq > (hostData.heartbeatSeq ?? 0)) {
          hostData.haHeartbeat = haHeartbeat;
          hostData.heartbeatSeq = heartbeatSeq;
        }
      });
  }
});

export const { clearMonitoring } = monitoringSlice.actions;
export default monitoringSlice.reducer;
