// plandump prints the XASL cache block ("XASL cache", "Stats:", then
// "Key: number" lines) followed by the filter predicate cache block, which
// repeats keys such as "Lookups:". Only the XASL block's counters are read.
export const parseXaslCacheStats = (lines = []) => {
  const stats = {};
  const start = lines.findIndex((line) => line?.trim() === 'XASL cache');
  if (start < 0) return stats;
  for (const raw of lines.slice(start + 1)) {
    const match = raw?.trim().match(/^([A-Za-z][A-Za-z ]*):\s*(\d+)$/);
    if (match) stats[match[1]] = match[2];
    // "Stats:" comes before the counters; anything else after them ends the block.
    else if (Object.keys(stats).length) break;
  }
  return stats;
};

// Percentage of XASL cache lookups that were hits, or null before any lookup.
export const xaslCacheHitRatio = (stats) => {
  const lookups = Number(stats.Lookups);
  if (!lookups) return null;
  return ((Number(stats.Hits) || 0) / lookups * 100).toFixed(1);
};
