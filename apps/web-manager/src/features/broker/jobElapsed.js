// getbrokerstatus reports a queued job's `job_time` as the time of day the
// broker received it ("HH:MM:SS", server local time), not how long it has
// waited. The same response's `time` ("YYYY/MM/DD HH:MM:SS") is the server's
// local clock when the status was taken, so the wait is the difference —
// computed from the server's own clock, not the browser's.

const SECONDS_PER_DAY = 24 * 60 * 60;
const TIME_OF_DAY_RE = /(?:^|\s)(\d{1,2}):(\d{2}):(\d{2})$/;

function secondsOfDay(value) {
  const m = typeof value === 'string' ? value.trim().match(TIME_OF_DAY_RE) : null;
  if (!m) return null;
  const [h, min, s] = m.slice(1).map(Number);
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/** Seconds the job has been queued, or null if either time is missing. */
export function jobElapsedSeconds(serverTime, jobTime) {
  const now = secondsOfDay(serverTime);
  const received = secondsOfDay(jobTime);
  if (now === null || received === null) return null;
  // Received before midnight, sampled after it.
  return (now - received + SECONDS_PER_DAY) % SECONDS_PER_DAY;
}

/** 5 -> "5s", 65 -> "1m 05s", 3725 -> "1h 02m 05s". */
export function formatElapsed(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}
