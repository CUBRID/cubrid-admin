// The DB dashboard's memory bar: the host's physical memory (gethoststat
// mem_phy_total = 100%) split into what the host uses apart from this
// database's CAS, the CAS themselves (sum of getbrokerstatus psize) and what
// is free. Only values the dashboard already reads; no request of its own.
//
// The CAS sum can be larger than the host's used memory: the engine sizes
// each CAS as VmRSS + VmSwap (broker_process_size.c), so shared pages count
// once per CAS and swap is included. Then "host" is 0 and the CAS part is
// drawn up to the used memory, so the three parts still add up to 100%.

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

/** Bytes with a binary unit and one decimal: "512.0 MiB". */
export function formatBytes1(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  return i === 0 ? `${bytes} B` : `${(bytes / 1024 ** i).toFixed(1)} ${UNITS[i]}`;
}

/**
 * @param {number} casBytes this database's CAS memory
 * @param {number} hostTotal mem_phy_total in bytes (0 or missing = unknown)
 * @param {number} hostUsed mem_phy_total - mem_phy_free in bytes
 * @returns {{ host: number, cas: number, free: number, total: number,
 *   hostPct: number, casPct: number, freePct: number } | null} null while the host's memory is unknown
 */
export function dbMemorySegments(casBytes, hostTotal, hostUsed) {
  if (!(hostTotal > 0) || !Number.isFinite(hostUsed)) return null;
  const cas = Math.max(0, Number.isFinite(casBytes) ? casBytes : 0);
  const used = Math.min(Math.max(0, hostUsed), hostTotal);
  const host = Math.max(0, used - cas);
  const free = hostTotal - used;
  const pct = (bytes) => (bytes / hostTotal) * 100;
  return {
    host,
    cas,
    free,
    total: hostTotal,
    hostPct: pct(host),
    casPct: pct(used - host),
    freePct: pct(free),
  };
}
