import apiClient from '../../api/apiClient';

export const brokerApi = {
  getBrokerList: (hostUid) => {
    return apiClient.get(`/${hostUid}/broker/list`);
  },
  getBrokerStatus: (hostUid, brokerName) => {
    return apiClient.get(`/${hostUid}/broker/status/${brokerName}`);
  },
  // One request for many brokers; resolves to { brokers: [{ bname, time, asinfo?, jobinfo? }] }.
  getBrokerStatusBulk: (hostUid, brokerNames) => {
    return apiClient.post(`/${hostUid}/broker/status/bulk`, { bnames: brokerNames });
  },
  startBroker: (hostUid, brokerName) => {
    return apiClient.post(`/${hostUid}/broker/start/${brokerName}`);
  },
  stopBroker: (hostUid, brokerName) => {
    return apiClient.post(`/${hostUid}/broker/stop/${brokerName}`);
  },
  startAllBrokers: (hostUid) => {
    return apiClient.post(`/${hostUid}/broker/start-all`);
  },
  stopAllBrokers: (hostUid) => {
    return apiClient.post(`/${hostUid}/broker/stop-all`);
  },
  getBrokerLogs: (hostUid, brokerName) => {
    return apiClient.get(`/${hostUid}/log/broker/${brokerName}`);
  },
  captureLogSnapshot: (hostUid, path) => {
    return apiClient.post(`/${hostUid}/log/snapshot`, { path });
  },
  viewLog: (hostUid, logParams) => {
    return apiClient.post(`/${hostUid}/log/view`, logParams);
  },
  getAdminLogs: (hostUid) => {
    return apiClient.get(`/${hostUid}/log/admin`);
  },
  getCMSLogs: (hostUid) => {
    return apiClient.get(`/${hostUid}/log/cms`);
  },
  getDatabaseLogs: (hostUid, dbname) => {
    return apiClient.get(`/${hostUid}/log/database/${dbname}`);
  },
  getBrokerConfig: (hostUid, confname = 'brokerconf') => {
    return apiClient.get(`/${hostUid}/cms-config/broker-config/${confname}`);
  },
  updateBrokerConfig: (hostUid, confdata) => {
    return apiClient.post(`/${hostUid}/cms-config/broker-set-param`, { confdata });
  },
};
