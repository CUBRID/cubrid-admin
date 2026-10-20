// CMS persists each auto-exec-query plan as one line in a flat conf file
// (autoexecquery.conf), with the query text as the trailing field on that
// line. A real newline inside the query text splits that one record across
// multiple physical lines with no escaping, corrupting the file — the next
// read of the plan list for that db/user then fails to parse entirely (not
// just the newly-added plan). SQL is whitespace-insensitive, so collapsing
// embedded newlines to single spaces before submit is safe UNLESS the query
// uses a `--` line comment, since removing the newline would let that
// comment swallow the rest of the statement.
export const hasLineCommentAcrossLines = (sql) => sql.includes('\n') && sql.includes('--');

export const normalizeQueryForCms = (sql) =>
  sql
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
