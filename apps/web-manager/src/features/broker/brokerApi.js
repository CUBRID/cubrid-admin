import apiClient from '../../api/apiClient';

export const brokerApi = {
  getBrokerList: (hostUid) => {
    return apiClient.get(`/${hostUid}/broker/list`);
  },
  getBrokerStatus: (hostUid, brokerName) => {
    return apiClient.get(`/${hostUid}/broker/status/${brokerName}`);
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
  setBrokerConfigParams: (hostUid, brokerName, params) => {
    return apiClient.post(`/${hostUid}/cms-config/broker-params/${brokerName}`, params);
  },
};
