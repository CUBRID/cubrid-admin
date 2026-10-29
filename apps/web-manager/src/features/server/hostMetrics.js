// Helpers for the host-level System Status / Service Dashboard metrics.

// Same floor as the broker rate tracker: a near-zero interval (rapid manual
// refresh) would blow the rate up, so keep the last sample and its rates.
const MIN_SAMPLE_INTERVAL_MS = 1000;

const toNumber = (raw) => {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).replace(/,/g, '').trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

/**
 * `/broker/list` (CMS getbrokersinfo) resolves to `[{ broker: [...] }]`;
 * `{ result: [...] }` is accepted too, like fetchBrokerList does.
 */
export const extractBrokerList = (response) => {
  if (Array.isArray(response?.result)) return response.result;
  if (Array.isArray(response)) return response[0]?.broker || [];
  return [];
};

/**
 * getbrokersinfo's `tran`/`query` are cumulative per-broker counters, not
 * rates. Derive host-wide TPS/QPS from the per-broker delta between two
 * polls, summed over the brokers present in both samples. A broker whose
 * counter went backwards (restart) or that just appeared is skipped for that
 * interval rather than counted as a jump or a drop.
 *
 * @returns {{ sample: object, rates: { tps: number|null, qps: number|null } }}
 *   null = no rate yet (first sample, or no broker comparable to the last one)
 */
export function computeBrokerRates(prevSample, brokersResponse, now) {
  if (prevSample && now - prevSample.time < MIN_SAMPLE_INTERVAL_MS) {
    return { sample: prevSample, rates: prevSample.rates };
  }

  const counters = {};
  extractBrokerList(brokersResponse).forEach((broker) => {
    if (!broker?.name) return;
    counters[broker.name] = { tran: toNumber(broker.tran), query: toNumber(broker.query) };
  });

  const rates = { tps: null, qps: null };
  if (prevSample) {
    const elapsedSec = (now - prevSample.time) / 1000;
    const brokerNames = Object.keys(counters);
    [['tps', 'tran'], ['qps', 'query']].forEach(([metric, field]) => {
      let delta = 0;
      let compared = 0;
      brokerNames.forEach((name) => {
        const current = counters[name][field];
        const previous = prevSample.counters?.[name]?.[field];
        if (current === null || previous === null || previous === undefined || current < previous) return;
        delta += current - previous;
        compared += 1;
      });
      if (compared > 0) rates[metric] = delta / elapsedSec;
      // No brokers on the host at all: genuinely nothing processed.
      else if (brokerNames.length === 0) rates[metric] = 0;
    });
  }

  return { sample: { time: now, counters, rates }, rates };
}

/**
 * CMS getsysdiskinfo: `disk_info: [{ name, total_size, free_size }]` in
 * bytes. On Linux it is a single statvfs("/") entry (the root filesystem,
 * not necessarily where the database volumes live); on Windows one entry per
 * fixed drive, summed here.
 *
 * @returns {{ total: number, used: number, pct: number, names: string[] } | null}
 */
export function mapDiskInfo(response) {
  const entries = Array.isArray(response?.disk_info) ? response.disk_info : [];
  let total = 0;
  let free = 0;
  const names = [];
  entries.forEach((entry) => {
    const entryTotal = toNumber(entry?.total_size);
    const entryFree = toNumber(entry?.free_size);
    if (entryTotal === null || entryFree === null || entryTotal <= 0) return;
    total += entryTotal;
    free += Math.min(entryFree, entryTotal);
    names.push(entry.name);
  });
  if (names.length === 0) return null;
  const used = total - free;
  return { total, used, pct: (used / total) * 100, names };
}

/**
 * Which of CUBRID Admin's three volume groups a dbspaceinfo `spaceinfo` row
 * belongs to: permanent volumes with permanent data, permanent volumes with
 * temporary data, and temporary volumes. Pre-10.1 engines report the purpose
 * as the type (DATA/INDEX/GENERIC, TEMP). Log volumes belong to none.
 *
 * @returns {'permPerm'|'permTemp'|'tempTemp'|null}
 */
export function volumeGroup(space) {
  const type = (space?.type || '').toUpperCase();
  const purpose = (space?.purpose || '').toUpperCase();
  if (type === 'DATA' || type === 'INDEX' || type === 'GENERIC') return 'permPerm';
  if (type === 'TEMP') return 'permTemp';
  if (type === 'PERMANENT') return purpose === 'PERMANENT' ? 'permPerm' : 'permTemp';
  if (type === 'TEMPORARY') return 'tempTemp';
  return null;
}
