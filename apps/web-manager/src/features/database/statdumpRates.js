// `cubrid statdump` (CMS task "statdump") reports cumulative counters since
// the database server started, not per-second values. The dashboard's rate
// columns are derived here from the delta between two consecutive samples of
// the same database, divided by the time between them.

// TPS counts a transaction once it ends, either committed or rolled back.
// Rollbacks are optional so an older statdump without the field still yields
// a commit-only TPS.
const RATE_COUNTERS = {
  tps: { required: ['num_tran_commits'], optional: ['num_tran_rollbacks'] },
  fetchPerSec: { required: ['num_data_page_fetches'] },
  dirtyPerSec: { required: ['num_data_page_dirties'] },
  ioReadPerSec: { required: ['num_file_ioreads'] },
  ioWritePerSec: { required: ['num_file_iowrites'] },
};

// Same floor as the broker rate tracker: a near-zero interval (rapid manual
// refresh) would blow the rate up, so keep the last sample and its rates.
const MIN_SAMPLE_INTERVAL_MS = 1000;

const toCounter = (raw) => {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).replace(/,/g, '').trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

const readCounter = (statdump, { required, optional = [] }) => {
  let total = 0;
  for (const field of required) {
    const value = toCounter(statdump?.[field]);
    if (value === null) return null;
    total += value;
  }
  for (const field of optional) {
    total += toCounter(statdump?.[field]) ?? 0;
  }
  return total;
};

const noRates = () => Object.fromEntries(Object.keys(RATE_COUNTERS).map((metric) => [metric, null]));

/**
 * @param {{ time: number, counters: object, rates: object } | undefined} prevSample
 *   the previous sample for the same host+db (undefined for the first one)
 * @param {object} statdump the raw statdump response
 * @param {number} now sample time in ms
 * @returns {{ sample: object, rates: object }} rates per metric; null means
 *   "no rate yet": first sample, missing counter, or a counter that went
 *   backwards (server restart). The returned sample is the next baseline.
 */
export function computeStatdumpRates(prevSample, statdump, now) {
  if (prevSample && now - prevSample.time < MIN_SAMPLE_INTERVAL_MS) {
    return { sample: prevSample, rates: prevSample.rates };
  }

  const counters = {};
  const rates = noRates();
  const elapsedSec = prevSample ? (now - prevSample.time) / 1000 : 0;

  for (const [metric, spec] of Object.entries(RATE_COUNTERS)) {
    const current = readCounter(statdump, spec);
    counters[metric] = current;
    const previous = prevSample?.counters?.[metric];
    if (current === null || previous === null || previous === undefined || elapsedSec <= 0) continue;
    if (current < previous) continue; // counter reset: this sample is the new baseline
    rates[metric] = (current - previous) / elapsedSec;
  }

  return { sample: { time: now, counters, rates }, rates };
}
