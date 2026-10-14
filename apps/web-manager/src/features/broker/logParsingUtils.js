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

export function extractTopSQL(ls) {
  const text = ls.join('\n');
  const sqls = extractSQL(ls);
  const stats = {};
  const r = new RegExp(SQL_RE);
  const matches = [];
  let m;
  while ((m = r.exec(text)) !== null) matches.push(m);

  matches.forEach((match, i) => {
    const s = sqls[i]; if (!s) return;
    if (!stats[s]) stats[s] = { c: 0, e: 0, t: [] };
    stats[s].c++;
    // Search up to the next statement's own log lines (or end of text)
    // instead of a fixed character window — a long bind value or literal
    // can otherwise push this execution's own result line out of a
    // fixed-size lookahead, silently dropping its error/time.
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const em = text.slice(start, end).match(EXEC_RESULT_RE);
    if (em) {
      stats[s].t.push(parseFloat(em[2]));
      if (parseInt(em[1], 10) < 0) stats[s].e++;
    }
  });
  return Object.entries(stats).map(([sql, s], idx) => ({
    id: `Q${idx + 1}`, sql,
    // '-' (rather than '0.000') when no execution's result line was found at
    // all, so a genuinely instantaneous (0.000s) query isn't confused with
    // one whose timing/error couldn't be determined.
    max: s.t.length ? Math.max(...s.t).toFixed(3) : '-',
    min: s.t.length ? Math.min(...s.t).toFixed(3) : '-',
    avg: s.t.length ? (s.t.reduce((a, b) => a + b, 0) / s.t.length).toFixed(3) : '-',
    c: s.c, e: s.e,
  })).sort((a, b) => b.c - a.c);
}
