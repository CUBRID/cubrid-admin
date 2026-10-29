import React from 'react';

const SCOPE_COLORS = {
  SERVER: 'text-sky-500 bg-sky-500/8 border-sky-500/20',
  CLIENT: 'text-violet-500 bg-violet-500/8 border-violet-500/20',
  BOTH: 'text-emerald-500 bg-emerald-500/8 border-emerald-500/20',
};

/** SERVER / CLIENT / BOTH: which process(es) a cubrid.conf parameter affects. */
export function ParamScopeBadge({ scope }) {
  if (!SCOPE_COLORS[scope]) return <span className="text-12 text-slate-300 dark:text-slate-600">-</span>;
  return <span className={`text-11 font-medium uppercase tracking-widest px-1.5 py-0.5 rounded border ${SCOPE_COLORS[scope]}`}>{scope}</span>;
}
