import apiClient from '../../api/apiClient';
import { createSingleFlight } from '../../infrastructure/utils/singleFlight';

const volumeReads = createSingleFlight();

export const databaseApi = {
  getStartInfo: (hostUid) => {
    return apiClient.get(`/${hostUid}/database/start-info`);
  },
  startDatabase: (hostUid, dbname) => {
    return apiClient.post(`/${hostUid}/database/start/${encodeURIComponent(dbname)}`, {});
  },
  stopDatabase: (hostUid, dbname) => {
    return apiClient.post(`/${hostUid}/database/stop/${encodeURIComponent(dbname)}`, {});
  },
  startAllDatabases: (hostUid, dbnames) => {
    return apiClient.post(`/${hostUid}/database/start-all`, { dbnames });
  },
  stopAllDatabases: (hostUid, dbnames) => {
    return apiClient.post(`/${hostUid}/database/stop-all`, { dbnames });
  },
  startWholeService: (hostUid) => {
    return apiClient.post(`/${hostUid}/database/service/start`, {});
  },
  stopWholeService: (hostUid) => {
    return apiClient.post(`/${hostUid}/database/service/stop`, {});
  },
  getVolumeInfo: (hostUid, dbname) => {
    const url = `/${hostUid}/database/volume-info/${encodeURIComponent(dbname)}`;
    // Do not share a response across login sessions.
    const key = JSON.stringify([apiClient.defaults.headers.common.Authorization, url]);
    return volumeReads(key, () => apiClient.get(url));
  },
  getClassInfo: (hostUid, dbname, dbstatus) => {
    return apiClient.post(`/${hostUid}/database/class-info/${dbname}`, { dbstatus });
  },
  unloadDatabase: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/unload/${dbname}`, payload);
  },
  getUnloadInfo: (hostUid) => {
    return apiClient.get(`/${hostUid}/database/unload-info`);
  },
  loadDatabase: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/load/${dbname}`, payload);
  },
  checkDatabase: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/check/${dbname}`, payload);
  },
  compactDatabase: (hostUid, dbname, payload) =>
    apiClient.post(`/${hostUid}/database/compact/${dbname}`, payload),
  optimizeDatabase: (hostUid, dbname, payload) =>
    apiClient.post(`/${hostUid}/database/optimize/${encodeURIComponent(dbname)}`, payload),

  getLockInfo: (hostUid, dbname) =>
    apiClient.post(`/${hostUid}/database/lock/${encodeURIComponent(dbname)}`, {}),

  getTransactionInfo: (hostUid, dbname, payload) =>
    apiClient.post(`/${hostUid}/database/transaction-info/${encodeURIComponent(dbname)}`, payload),

  killTransaction: (hostUid, dbname, payload) =>
    apiClient.post(`/${hostUid}/database/kill-transaction/${encodeURIComponent(dbname)}`, payload),

  setAutoStart: (hostUid, payload) => {
    return apiClient.post(`/${hostUid}/database/auto-start/set`, payload);
  },

  removeAutoStart: (hostUid, payload) => {
    return apiClient.post(`/${hostUid}/database/auto-start/remove`, payload);
  },

  deleteDatabase: (hostUid, dbname, payload) => {
    return apiClient.delete(`/${hostUid}/database/${dbname}`, { data: payload });
  },

  loginDatabase: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/users/login/${encodeURIComponent(dbname)}`, payload);
  },
  loginDatabaseWithProfile: (hostUid, dbname) => {
    return apiClient.post(`/${hostUid}/database/users/login-with-profile/${encodeURIComponent(dbname)}`, {});
  },
  logoutDatabase: (hostUid, dbname) => {
    return apiClient.post(`/${hostUid}/database/users/logout/${encodeURIComponent(dbname)}`, {});
  },
  registerDatabase: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/register/${encodeURIComponent(dbname)}`, payload);
  },
  deleteDatabaseProfile: (hostUid, dbname) => {
    return apiClient.delete(`/${hostUid}/database/register/${encodeURIComponent(dbname)}`);
  },
  addBackupSchedule: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/backup-schedule/${dbname}`, payload);
  },
  editBackupSchedule: (hostUid, dbname, payload) => {
    return apiClient.put(`/${hostUid}/database/backup-schedule/${dbname}`, payload);
  },
  getBackupSchedule: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/database/backup-schedule/${dbname}`);
  },
  deleteBackupSchedule: (hostUid, dbname, payload) => {
    return apiClient.delete(`/${hostUid}/database/backup-schedule/${dbname}`, { data: payload });
  },
  renameDatabase: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/rename/${encodeURIComponent(dbname)}`, payload);
  },
  getAddVolStatus: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/database/add-vol-status/${encodeURIComponent(dbname)}`);
  },
  addVolume: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/add-vol/${encodeURIComponent(dbname)}`, payload);
  },
  getAutoBackupLog: (hostUid) => {
    return apiClient.post(`/${hostUid}/database/auto-backup-db-err-log`, {});
  },
  getQueryPlan: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/database/auto-exec-query/${encodeURIComponent(dbname)}`);
  },
  setAutoExecQuery: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/auto-exec-query/${encodeURIComponent(dbname)}`, payload);
  },
  appendAutoExecQueryPlan: (hostUid, dbname, plan) => {
    return apiClient.post(`/${hostUid}/database/auto-exec-query/${encodeURIComponent(dbname)}/append`, { plan });
  },
  updateAutoExecQueryPlan: (hostUid, dbname, plan) => {
    return apiClient.post(`/${hostUid}/database/auto-exec-query/${encodeURIComponent(dbname)}/update`, { plan });
  },
  removeAutoExecQueryPlan: (hostUid, dbname, queryId) => {
    return apiClient.post(`/${hostUid}/database/auto-exec-query/${encodeURIComponent(dbname)}/remove`, { query_id: queryId });
  },
  getQueryPlanLog: (hostUid) => {
    return apiClient.post(`/${hostUid}/database/auto-exec-query-err-log`, {});
  },
  getStatDump: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/cms-config/stat-dump/${encodeURIComponent(dbname)}`);
  },
  getParamDump: (hostUid, dbname, both = 'n') => {
    return apiClient.get(`/${hostUid}/cms-config/param-dump/${encodeURIComponent(dbname)}?both=${both}`);
  },
  getPlanDump: (hostUid, dbname, plandrop = 'n') => {
    return apiClient.get(`/${hostUid}/cms-config/plan-dump/${encodeURIComponent(dbname)}?plandrop=${plandrop}`);
  },
  getAutoVolumeConfig: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/database/auto-add-vol/${encodeURIComponent(dbname)}`);
  },
  setAutoVolumeConfig: (hostUid, dbname, payload) => {
    return apiClient.post(`/${hostUid}/database/auto-add-vol/${encodeURIComponent(dbname)}`, payload);
  },
  getAutoVolumeLog: (hostUid) => {
    return apiClient.get(`/${hostUid}/database/auto-add-vol-log`, {});
  },
  copyDatabase: (hostUid, payload) => {
    return apiClient.post(`/${hostUid}/database/copy`, payload);
  },
  createDatabase: (hostUid, payload) => {
    return apiClient.post(`/${hostUid}/database/create`, payload);
  },
  getCreateInfo: (hostUid) => {
    return apiClient.get(`/${hostUid}/database/create-info`);
  },
  getBackupDbInfo: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/database/backup-db-info/${encodeURIComponent(dbname)}`);
  },
  getBackupList: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/database/backup-db-list/${encodeURIComponent(dbname)}`);
  },
};
