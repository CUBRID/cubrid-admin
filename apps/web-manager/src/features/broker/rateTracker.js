// CMS reports as_num_query/as_num_tran (and similar) as raw lifetime totals
// since the AS/broker process started — there is no time window involved.
// Genuine per-second TPS/QPS has to be derived client-side from the delta
// between two consecutive polls, so this turns a running cumulative counter
// into a rate.
const MIN_SAMPLE_INTERVAL_MS = 1000;

export function createRateTracker() {
  const samples = new Map(); // key -> { value, time, rate }

  return function trackRate(key, cumulativeValue) {
    const now = Date.now();
    const value = Number(cumulativeValue) || 0;
    const prev = samples.get(key);

    if (!prev) {
      samples.set(key, { value, time: now, rate: null });
      return null; // no baseline yet — can't derive a rate from one sample
    }

    const elapsedMs = now - prev.time;
    if (elapsedMs < MIN_SAMPLE_INTERVAL_MS) {
      // Too soon since the last real sample (e.g. rapid manual refresh) —
      // dividing by a near-zero interval would blow up the rate, so keep
      // showing the last known-good value instead of updating it.
      return prev.rate;
    }

    // A counter reset (broker/AS restart) makes the delta negative; clamp
    // to 0 rather than showing a nonsensical negative rate.
    const rate = Math.max(0, (value - prev.value) / (elapsedMs / 1000));
    samples.set(key, { value, time: now, rate });
    return rate;
  };
}
