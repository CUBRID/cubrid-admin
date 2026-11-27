/** The most entries the server returns in one page (MAX_PAGE in api-log.service.ts and admin-audit.service.ts). */
export const MAX_PAGE_SIZE = 5000;

/**
 * Every entry a filter matches, read page by page, for a CSV export: one
 * page stops at MAX_PAGE_SIZE and would leave the rest out without a word.
 * `query` is adminApi.queryApiLog or adminApi.queryAudit.
 */
export async function fetchAllEntries(query, filter) {
  const entries = [];
  for (;;) {
    const res = await query({ ...filter, limit: MAX_PAGE_SIZE, offset: entries.length });
    const page = res?.entries ?? [];
    entries.push(...page);
    // A short or empty page is the last; so is reaching the total.
    if (page.length < MAX_PAGE_SIZE || entries.length >= (res?.total ?? 0)) return entries;
  }
}
