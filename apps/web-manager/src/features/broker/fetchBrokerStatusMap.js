import { brokerApi } from './brokerApi';

// Map of broker name -> getbrokerstatus entry ({ bname, time, asinfo?, jobinfo? })
// from one bulk request. Resolves to an empty Map when there are no names or
// the request fails, so callers treat every broker as having no status.
export const fetchBrokerStatusMap = async (hostUid, brokerNames) => {
  const names = brokerNames.filter(Boolean);
  if (names.length === 0) return new Map();
  try {
    const res = await brokerApi.getBrokerStatusBulk(hostUid, names);
    return new Map((res?.brokers || []).map((entry) => [entry.bname, entry]));
  } catch {
    return new Map();
  }
};
