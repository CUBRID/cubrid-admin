import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import monitoringApi from './monitoringApi';

// Thunk to fetch all monitoring data in parallel
export const fetchMonitoringData = createAsyncThunk(
  'monitoring/fetchAll',
  async (hostUid, { getState, rejectWithValue }) => {
    try {
      const state = getState();
      const haInfo = state.host.haInfo[hostUid];
      const isHA = haInfo?.isHA;

      const promises = [
        monitoringApi.getHostStat(hostUid),
        monitoringApi.getBrokerList(hostUid)
      ];

      if (isHA) {
        promises.push(monitoringApi.getHaHeartbeatList(hostUid));
      }

      const [hostStat, brokers, haHeartbeat] = await Promise.all(promises);
      return { hostStat, brokers, haHeartbeat };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Lightweight companion to fetchMonitoringData — used to poll just the HA
// heartbeat during a suspected failover (see ServerContent's fast-poll
// effect), instead of re-fetching hostStat/brokers too at a 1s cadence.
export const fetchHaHeartbeatOnly = createAsyncThunk(
  'monitoring/fetchHaHeartbeatOnly',
  async (hostUid, { rejectWithValue }) => {
    try {
      const haHeartbeat = await monitoringApi.getHaHeartbeatList(hostUid);
      return { haHeartbeat };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
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
          error: null,
          haHeartbeat: null,
          currentStatus: { cpu: 0, memory: 0, tps: 0, qps: 0, memUsed: 0, memTotal: 0 },
          averages: { cpu: 0, memory: 0, tps: 0, qps: 0 },
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
            currentStatus: { cpu: 0, memory: 0, tps: 0, qps: 0, memUsed: 0, memTotal: 0 },
            averages: { cpu: 0, memory: 0, tps: 0, qps: 0 },
            history: [],
            prevHostStat: null,
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
        hostData.error = null;
        const { hostStat, brokers, haHeartbeat } = action.payload;
        const now = Date.now();

        // 1. Calculate TPS/QPS from brokers
        let totalTps = 0;
        let totalQps = 0;
        if (brokers && Array.isArray(brokers)) {
          brokers.forEach(broker => {
            totalTps += parseFloat(broker.tran || 0);
            totalQps += parseFloat(broker.query || 0);
          });
        }

        // 2. Calculate CPU %
        let cpuUsage = 0;
        if (hostData.prevHostStat) {
          const prev = hostData.prevHostStat;
          const curr = hostStat;

          const cpuUserDelta = parseFloat(curr.cpu_user) - parseFloat(prev.cpu_user);
          const cpuKernelDelta = parseFloat(curr.cpu_kernel) - parseFloat(prev.cpu_kernel);
          const cpuIdleDelta = parseFloat(curr.cpu_idle) - parseFloat(prev.cpu_idle);
          const cpuIowaitDelta = parseFloat(curr.cpu_iowait) - parseFloat(prev.cpu_iowait);

          const totalDelta = cpuUserDelta + cpuKernelDelta + cpuIdleDelta + cpuIowaitDelta;
          if (totalDelta > 0) cpuUsage = (cpuUserDelta / totalDelta) * 100;
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

        // 5. Update History
        hostData.history.push({ 
          timestamp: now, 
          cpu: cpuUsage, 
          memory: memUsage, 
          tps: totalTps, 
          qps: totalQps, 
          disk: hostStat.disk_usage 
        });
        hostData.history = hostData.history.filter(h => now - h.timestamp < MAX_HISTORY_MS);

        // 6. Update HA Heartbeat Info if available
        if (haHeartbeat) {
          hostData.haHeartbeat = haHeartbeat;
        }

        // 6. Calculate Averages
        const historyLen = hostData.history.length;
        if (historyLen > 0) {
          const sums = hostData.history.reduce((a, b) => ({
            cpu: a.cpu + b.cpu,
            memory: a.memory + b.memory,
            tps: a.tps + b.tps,
            qps: a.qps + b.qps
          }), { cpu: 0, memory: 0, tps: 0, qps: 0 });
          hostData.averages = {
            cpu: sums.cpu / historyLen,
            memory: sums.memory / historyLen,
            tps: sums.tps / historyLen,
            qps: sums.qps / historyLen
          };
        }
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
        const { haHeartbeat } = action.payload;
        if (haHeartbeat) {
          hostData.haHeartbeat = haHeartbeat;
        }
      });
  }
});

export const { clearMonitoring } = monitoringSlice.actions;
export default monitoringSlice.reducer;
