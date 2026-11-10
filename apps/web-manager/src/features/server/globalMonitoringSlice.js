import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { hostApi } from '../host/hostApi';
import { databaseApi } from '../database/databaseApi';
import { brokerApi } from '../broker/brokerApi';
import monitoringApi from './monitoringApi';
import { computeBrokerRates, cpuUsagePercent, extractBrokerList, volumeGroup } from './hostMetrics';
import { getCM, getStoredLocale } from '../../constants/useCM';
import { requestErrorText } from '../../infrastructure/errors/serverErrorText';

const usedPct = (totalPages, freePages) => (totalPages > 0 ? Math.round(((totalPages - freePages) * 100) / totalPages) : -1);

/**
 * Thunk to fetch comprehensive summary for a single host
 */
export const fetchHostSummary = createAsyncThunk(
  'globalMonitoring/fetchHostSummary',
  async (arg, { getState, rejectWithValue }) => {
    const hostUid = typeof arg === 'string' ? arg : arg.hostUid;
    // `withVolumes: false` keeps the volume usage of the last read (the
    // service dashboard reads it on its own, longer interval).
    const withVolumes = typeof arg === 'string' || arg.withVolumes !== false;
    try {
      // 1. Fetch concurrent data
      const [hostStat, brokersResponse, dbInfo, envInfo] = await Promise.all([
        monitoringApi.getHostStat(hostUid).catch(() => null),
        brokerApi.getBrokerList(hostUid).catch(() => null),
        // Shares a start-info read already in flight for the host.
        databaseApi.readStartInfo(hostUid).then((r) => (r.ok ? r.value : null)),
        hostApi.getHostEnv(hostUid).catch(() => null),
      ]);

      if (!hostStat) return rejectWithValue(getCM(getStoredLocale()).hostUnreachableMsg);

      // 2. Fetch Volume data (needed for Permanent/Temp space) only for
      // databases that are running and logged in: volume-info is a per-db
      // request, and the server refuses it for a db with no DB login.
      const active = dbInfo?.activelist?.active;
      const activeList = Array.isArray(active) ? active : active ? [active] : [];
      const dbnames = withVolumes
        ? activeList.filter((a) => a?.isLoggedIn === true && a.dbname).map((a) => a.dbname)
        : [];
      const volumesData = await Promise.all(
        dbnames.map(dbname => databaseApi.getVolumeInfo(hostUid, dbname).catch(() => null))
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
          // CMS returns totalpage/freepage as strings (e.g. "8192"), and some
          // volume rows (e.g. log volumes) return a blank/space value. Summing
          // those directly with += on a numeric accumulator silently degrades
          // into string concatenation the moment one value is a string, which
          // then yields NaN downstream once a non-digit sneaks into the mix —
          // parseInt(...) || 0 keeps every accumulation strictly numeric.
          const totalPage = parseInt(s.totalpage) || 0;
          const freePage = parseInt(s.freepage) || 0;

          const group = volumeGroup(s);
          if (group === 'permPerm') {
            totalPagePerm += totalPage;
            freePagePerm += freePage;
          } else if (group === 'permTemp') {
            totalPagePermTemp += totalPage;
            freePagePermTemp += freePage;
          } else if (group === 'tempTemp') {
            totalPageTempTemp += totalPage;
            freePageTempTemp += freePage;
          }
        });
      });

      // 4. Process Broker Data — tran/query are cumulative counters, so
      // TPS/QPS are per-second rates against this host's previous sample
      // (null until two samples can be compared, or if the list failed).
      const prev = getState().globalMonitoring.snapshots[hostUid];
      let totalErrorQ = 0;
      const brokerPorts = [];
      const brokerList = extractBrokerList(brokersResponse);
      brokerList.forEach(b => {
        totalErrorQ += parseFloat(b.error_query || 0);
        if (b.port) brokerPorts.push(b.port);
      });
      const { sample: brokerSample, rates: brokerRates } = brokersResponse
        ? computeBrokerRates(prev?.brokerSample, brokersResponse, Date.now())
        : { sample: prev?.brokerSample ?? null, rates: { tps: null, qps: null } };

      // 5. CPU % against this host's previous sample (0 until there is one)
      const snapshot = {
        cpu_user: hostStat.cpu_user,
        cpu_kernel: hostStat.cpu_kernel,
        cpu_idle: hostStat.cpu_idle,
        cpu_iowait: hostStat.cpu_iowait,
        brokerSample,
      };
      // Null until there are two samples to compare; shown as "-".
      const cpuPercent = cpuUsagePercent(prev, snapshot);

      // ON: the running databases; OFF: the others start-info knows of. A
      // running database can be missing from dblist, so both lists count.
      const runningNames = new Set(activeList.map((a) => a?.dbname).filter(Boolean));
      const knownNames = new Set([...(dbInfo?.dblist?.dbs || []).map((d) => d?.dbname).filter(Boolean), ...runningNames]);
      const memTotal = parseFloat(hostStat.mem_phy_total || 0);
      const memUsed = memTotal - parseFloat(hostStat.mem_phy_free || 0);

      // 6. Build Final Summary Node
      return {
        hostUid,
        snapshot,
        summary: {
          hostUid,
          cpu: cpuPercent,
          memTotal,
          memUsed,
          readAt: Date.now(),
          memory: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
          disk: hostStat.disk_usage || '0/0',
          tps: brokerRates.tps,
          qps: brokerRates.qps,
          errorQ: totalErrorQ,
          dbOn: runningNames.size,
          dbOff: [...knownNames].filter((dbname) => !runningNames.has(dbname)).length,
          version: envInfo?.os_info || envInfo?.os || getCM(getStoredLocale()).unknownFallback,
          brokerPorts: brokerPorts.join(', '),
          ...(withVolumes
            ? {
              freespaceOnStorage,
              // Percent of each volume group in use (-1 = the host has none).
              permUsed: usedPct(totalPagePerm, freePagePerm),
              permTempUsed: usedPct(totalPagePermTemp, freePagePermTemp),
              tempTempUsed: usedPct(totalPageTempTemp, freePageTempTemp),
              volumesReadAt: Date.now(),
            }
            : volumesOf(getState().globalMonitoring.summaries[hostUid])),
        }
      };
    } catch (err) {
      return rejectWithValue(requestErrorText(err));
    }
  }
);

// The volume usage of a summary, kept when a read skips the volumes.
const volumesOf = (summary) => ({
  freespaceOnStorage: summary?.freespaceOnStorage ?? 0,
  permUsed: summary?.permUsed ?? -1,
  permTempUsed: summary?.permTempUsed ?? -1,
  tempTempUsed: summary?.tempTempUsed ?? -1,
  volumesReadAt: summary?.volumesReadAt ?? null,
});

const globalMonitoringSlice = createSlice({
  name: 'globalMonitoring',
  initialState: {
    summaries: {}, // { [hostUid]: summary }
    snapshots: {}, // { [hostUid]: { cpu_user, cpu_kernel, cpu_idle, cpu_iowait, brokerSample } }
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
