import apiClient from '../../api/apiClient';

/**
 * Monitoring API for server resource and broker status
 */
export const monitoringApi = {
  /**
   * Get host statistics (raw counters)
   * @param {string} hostUid
   * @returns {Promise<any>}
   */
  getHostStat: (hostUid) => 
    apiClient.get(`/${hostUid}/resource-monitoring/get-host-stat`),

  /**
   * Get disk usage (CMS getsysdiskinfo): `disk_info: [{ name, total_size, free_size }]`
   * @param {string} hostUid
   * @returns {Promise<any>}
   */
  getSysDiskInfo: (hostUid) =>
    apiClient.get(`/${hostUid}/resource-monitoring/get-sys-disk-info`),

  /**
   * Get broker list (includes TPS/QPS)
   * @param {string} hostUid
   * @returns {Promise<any>}
   */
  getBrokerList: (hostUid) => 
    apiClient.get(`/${hostUid}/broker/list`),

  /**
   * Get HA heartbeat list
   * @param {string} hostUid
   * @returns {Promise<any>}
   */
  getHaHeartbeatList: (hostUid) =>
    apiClient.post(`/${hostUid}/ha/heartbeat-list`, { dbmodeall: 'y' }),
};

export default monitoringApi;
