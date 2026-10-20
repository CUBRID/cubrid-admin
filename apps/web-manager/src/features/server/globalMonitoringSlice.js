import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { hostApi } from '../host/hostApi';
import { databaseApi } from '../database/databaseApi';
import { brokerApi } from '../broker/brokerApi';
import monitoringApi from './monitoringApi';

/**
 * Thunk to fetch comprehensive summary for a single host
 */
export const fetchHostSummary = createAsyncThunk(
  'globalMonitoring/fetchHostSummary',
  async (arg, { getState, rejectWithValue }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    try {
      // 1. Fetch concurrent data
      const [hostStat, brokersResponse, dbInfo, envInfo] = await Promise.all([
        monitoringApi.getHostStat(hostUid).catch(() => null),
        brokerApi.getBrokerList(hostUid).catch(() => null),
        databaseApi.getStartInfo(hostUid).catch(() => null),
        hostApi.getHostEnv(hostUid).catch(() => null),
      ]);

      if (!hostStat) return rejectWithValue('Host unreachable');

      // 2. Fetch Volume data for all databases (needed for Permanent/Temp space)
      const dbs = dbInfo?.dblist?.dbs || [];
      const volumesData = await Promise.all(
        dbs.map(db => databaseApi.getVolumeInfo(hostUid, db.dbname).catch(() => null))
      );

      // 3. Process Volume Aggregation (Legacy Logic)
      let totalPagePerm = 0, freePagePerm = 0;
      let totalPagePermTemp = 0, freePagePermTemp = 0;
      let totalPageTempTemp = 0, freePageTempTemp = 0;
      let freespaceOnStorage = 0;

      volumesData.forEach(vol => {
        if (!vol || !vol.spaceinfo) return;
        freespaceOnStorage = (vol.freespace || 0) * 1024 * 1024;
        vol.spaceinfo.forEach(s => {
          const type = (s.type || '').toUpperCase();
          const purpose = (s.purpose || '').toUpperCase();
          // CMS returns totalpage/freepage as strings (e.g. "8192"), and some
          // volume rows (e.g. log volumes) return a blank/space value. Summing
          // those directly with += on a numeric accumulator silently degrades
          // into string concatenation the moment one value is a string, which
          // then yields NaN downstream once a non-digit sneaks into the mix —
          // parseInt(...) || 0 keeps every accumulation strictly numeric.
          const totalPage = parseInt(s.totalpage) || 0;
          const freePage = parseInt(s.freepage) || 0;

          if (type === 'DATA' || type === 'INDEX' || type === 'GENERIC') {
            totalPagePerm += totalPage;
            freePagePerm += freePage;
          } else if (type === 'TEMP') {
            totalPagePermTemp += totalPage;
            freePagePermTemp += freePage;
          } else if (type === 'PERMANENT') {
            if (purpose === 'PERMANENT') {
              totalPagePerm += totalPage;
              freePagePerm += freePage;
            } else {
              totalPagePermTemp += totalPage;
              freePagePermTemp += freePage;
            }
          } else if (type === 'TEMPORARY') {
            totalPageTempTemp += totalPage;
            freePageTempTemp += freePage;
          }
        });
      });

      // 4. Process Broker Data
      let totalTps = 0, totalQps = 0, totalErrorQ = 0;
      let brokerPorts = [];
      const brokerList = brokersResponse?.result || (Array.isArray(brokersResponse) ? brokersResponse[0]?.broker : []) || [];
      brokerList.forEach(b => {
        totalTps += parseFloat(b.tran || 0);
        totalQps += parseFloat(b.query || 0);
        totalErrorQ += parseFloat(b.error_query || 0);
        if (b.port) brokerPorts.push(b.port);
      });

      // 5. CPU Delta Calculation (Legacy Parity)
      const prev = getState().globalMonitoring.snapshots[hostUid];
      const snapshot = {
        user: parseInt(hostStat.cpu_user || 0, 10),
        kernel: parseInt(hostStat.cpu_kernel || 0, 10),
        idle: parseInt(hostStat.cpu_idle || 0, 10),
        iowait: parseInt(hostStat.cpu_iowait || 0, 10),
      };

      let cpuPercent = 0;
      if (prev) {
        const dUser = snapshot.user - prev.user;
        const dKernel = snapshot.kernel - prev.kernel;
        const dIdle = snapshot.idle - prev.idle;
        const dIo = snapshot.iowait - prev.iowait;
        const total = dUser + dKernel + dIdle + dIo;
        if (total > 0) {
          cpuPercent = (dUser / total) * 100;
        }
      }

      // 6. Build Final Summary Node
      return {
        hostUid,
        snapshot,
        summary: {
          hostUid,
          cpu: cpuPercent,
          memTotal: parseFloat(hostStat.mem_phy_total || 0),
          memUsed: parseFloat(hostStat.mem_phy_total || 0) - parseFloat(hostStat.mem_phy_free || 0),
          disk: hostStat.disk_usage || '0/0',
          freespaceOnStorage,
          tps: totalTps,
          qps: totalQps,
          errorQ: totalErrorQ,
          dbOn: dbInfo?.activelist?.active?.length || 0,
          dbOff: (dbInfo?.dblist?.dbs?.length || 0) - (dbInfo?.activelist?.active?.length || 0),
          version: envInfo?.os_info || envInfo?.os || 'Unknown',
          brokerPorts: brokerPorts.join(', '),
          permFree: totalPagePerm > 0 ? Math.round((freePagePerm * 100) / totalPagePerm) : -1,
          permTempFree: totalPagePermTemp > 0 ? Math.round((freePagePermTemp * 100) / totalPagePermTemp) : -1,
          tempTempFree: totalPageTempTemp > 0 ? Math.round((freePageTempTemp * 100) / totalPageTempTemp) : -1,
        }
      };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Failed to fetch monitoring data');
    }
  }
);

const globalMonitoringSlice = createSlice({
  name: 'globalMonitoring',
  initialState: {
    summaries: {}, // { [hostUid]: summary }
    snapshots: {}, // { [hostUid]: { user, kernel, idle, iowait } }
    loading: {},
    error: {}
  },
  reducers: {
    clearSummaries: (state) => {
      state.summaries = {};
      state.snapshots = {};
    },
    clearHostSummary: (state, action) => {
      const hostUid = action.payload;
      if (state.summaries[hostUid]) delete state.summaries[hostUid];
      if (state.snapshots[hostUid]) delete state.snapshots[hostUid];
      if (state.loading[hostUid]) delete state.loading[hostUid];
      if (state.error[hostUid]) delete state.error[hostUid];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHostSummary.pending, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg.hostUid;
        state.loading[hostUid] = true;
      })
      .addCase(fetchHostSummary.fulfilled, (state, action) => {
        const { summary, snapshot, hostUid } = action.payload;
        state.loading[hostUid] = false;
        state.summaries[hostUid] = summary;
        state.snapshots[hostUid] = snapshot;
        delete state.error[hostUid];
      })
      .addCase(fetchHostSummary.rejected, (state, action) => {
        const hostUid = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg.hostUid;
        state.loading[hostUid] = false;
        state.error[hostUid] = action.payload;
      });
  }
});

export const { clearSummaries, clearHostSummary } = globalMonitoringSlice.actions;
export default globalMonitoringSlice.reducer;
