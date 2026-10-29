// Pure broker SQL-log parsing helpers for LogViewer.jsx's "Parsed SQL" and
// "Top SQL" views — kept dependency-free (no Redux/API imports) so they stay
// directly unit-testable.

const QM = ' ?.?.? ';
const QM_RE = / \?\.?\?\.?\? /;
const SQL_RE = /(?:execute_all\s+|execute\s+|srv_prepare:\s*|srv_execute:\s*)(?:srv_h_id\s+\d+\s+)?(?:0:\s*)?(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|REPLACE|DESCRIBE|COMMIT|ROLLBACK|PREPARE)(.*?)(?=\n\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}|\n$|$)/gis;
const BIND_RE = /bind\s+\d+\s+:\s+(INT|DATETIME|TIME|DATE|BIGINT|DOUBLE|FLOAT|SHORT|VARCHAR\s\(\d+\)|NULL)\s*(.*)/gi;

export function extractSQL(ls) {
  const text = ls.join('\n');
  const stmts = [];
  let m;
  const r1 = new RegExp(SQL_RE);
  while ((m = r1.exec(text)) !== null)
    stmts.push((m[1] + m[2]).trim().replace(/<end>$/, '').replace(/\s{2,}/g, ' ').replace(/\?/g, QM));

  const params = [];
  const r2 = new RegExp(BIND_RE);
  let p;
  while ((p = r2.exec(text)) !== null)
    params.push({ t: p[1].toUpperCase(), v: p[2].trim().replace(/<end>$/, '') });

  let pi = 0;
  return stmts.map(s => {
    while (s.includes(QM) && pi < params.length) {
      const { t, v } = params[pi++];
      s = s.replace(QM_RE, /^(INT|BIGINT|DOUBLE|FLOAT|SHORT)/.test(t) ? (v || '0') : t === 'NULL' ? 'NULL' : `'${v}'`);
    }
    return s.replace(new RegExp(QM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '?').trim();
  });
}

// Matches the execute-result line CAS actually writes, e.g.
// "execute_all error:-670 tuple 0 time 0.001" (failure) or
// "execute 0 tuple 1 time 0.004" (success, no "error:" prefix) — see
// broker_log_top.c's read_execute_end_msg, the reference parser this
// mirrors. The result code is always a plain number (optionally preceded
// by the literal text "error:"); a query failed iff that number is
// negative, regardless of the "error:" text being present.
const EXEC_RESULT_RE = /\bexecute(?:_all|_call|_batch)?\s+(?:error:)?(-?\d+)\s+tuple\s+\d+\s+time\s+(\d+(?:\.\d+)?)/;

// Keep one unfinished execution between chunks so SQL, binds, and the result
// may cross a read boundary without splitting the count or timing statistics.
export function createTopSQLAccumulator() {
  const stats = new Map();
  let pending = '';

  const record = (match, followingText) => {
    // Group the logged template, before bind substitution. Parsed SQL still
    // uses extractSQL(), where substituting values is useful for copying.
    const sql = (match[1] + match[2]).trim().replace(/<end>$/, '').trim();
    if (!stats.has(sql)) stats.set(sql, { c: 0, e: 0, timed: 0, sum: 0, min: Infinity, max: -Infinity });
    const stat = stats.get(sql);
    stat.c++;
    const result = followingText.match(EXEC_RESULT_RE);
    if (result) {
      const time = Number(result[2]);
      stat.timed++;
      stat.sum += time;
      stat.min = Math.min(stat.min, time);
      stat.max = Math.max(stat.max, time);
      if (Number(result[1]) < 0) stat.e++;
    }
  };

  const consume = (final) => {
    const matches = [...pending.matchAll(new RegExp(SQL_RE))];
    const last = matches[matches.length - 1];
    const lastComplete = last && EXEC_RESULT_RE.test(pending.slice(last.index + last[0].length));
    const count = final || lastComplete ? matches.length : Math.max(0, matches.length - 1);
    for (let i = 0; i < count; i++) {
      const match = matches[i];
      record(match, pending.slice(match.index + match[0].length, matches[i + 1]?.index ?? pending.length));
    }
    pending = count < matches.length ? pending.slice(last.index) : '';
  };

  return {
    addLines(lines) {
      pending += (pending ? '\n' : '') + lines.join('\n');
      consume(false);
    },
    finish() {
      consume(true);
      return [...stats.entries()].map(([sql, stat]) => ({
        sql,
        max: stat.timed ? stat.max.toFixed(3) : '-',
        min: stat.timed ? stat.min.toFixed(3) : '-',
        avg: stat.timed ? (stat.sum / stat.timed).toFixed(3) : '-',
        c: stat.c, e: stat.e,
      })).sort((a, b) => b.c - a.c).map((row, i) => ({ id: `Q${i + 1}`, ...row }));
    },
  };
}

export function extractTopSQL(lines) {
  const accumulator = createTopSQLAccumulator();
  accumulator.addLines(lines);
  return accumulator.finish();
}
