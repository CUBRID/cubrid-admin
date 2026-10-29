import { useEffect, useState } from 'react';

/**
 * Splits rows already in the browser into fixed-size pages.
 *
 * The page is clamped to the last page when the rows shrink (a refresh, a
 * killed transaction), and goes back to the first page whenever `resetKey`
 * changes (e.g. another database).
 */
export const useClientPagination = (rows, pageSize, resetKey) => {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  // Keep the clamp: otherwise rows growing back would jump to the old page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    setPage,
    totalPages,
    pageRows: rows.slice(start, start + pageSize),
    from: rows.length ? start + 1 : 0,
    to: Math.min(rows.length, start + pageSize),
    total: rows.length,
  };
};
