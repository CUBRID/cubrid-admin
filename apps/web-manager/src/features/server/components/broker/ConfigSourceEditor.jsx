import React, { useRef } from 'react';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../../constants/useCM';

export default function ConfigSourceEditor({ rawContent, handleSourceChange }) {
  const CM = useCM();
  const textareaRef = useRef(null);
  const preRef      = useRef(null);

  const syncScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const renderHighlighted = () =>
    rawContent.split('\n').map((line, i) => {
      const t = line.trim();
      if (t.startsWith('#'))
        return <span key={i} className="text-slate-400 dark:text-slate-500 italic">{line}{'\n'}</span>;
      if (t.startsWith('[') && t.endsWith(']'))
        return <span key={i} className="text-amber-600 dark:text-bk-yellow font-bold">{line}{'\n'}</span>;
      // key = value — color the key
      const eq = line.indexOf('=');
      if (eq > 0) {
        const k = line.substring(0, eq);
        const v = line.substring(eq);
        return (
          <span key={i}>
            <span className="text-sky-600 dark:text-sky-400">{k}</span>
            <span className="text-slate-500 dark:text-slate-400">{v}</span>
            {'\n'}
          </span>
        );
      }
      return <span key={i}>{line}{'\n'}</span>;
    });

  const lineCount = rawContent.split('\n').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-bk-main">

      {/* Mini toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-400">
          <Icon name="description" size="sm" weight={300} />
          <span className="text-13 font-semibold text-slate-500 dark:text-slate-400 font-mono">cubrid_broker.conf</span>
        </div>
        <span className="text-12 font-medium text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest">
          {CM.linesLabel(lineCount)}
        </span>
      </div>

      {/* Editor area */}
      <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#0D1117]">
        {/* Line numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 dark:bg-white/3 border-r border-slate-100 dark:border-white/5 overflow-hidden pointer-events-none z-10">
          <div className="p-4 pt-6 flex flex-col items-end gap-0">
            {rawContent.split('\n').map((_, i) => (
              <span key={i} className="text-14 font-mono text-slate-300 dark:text-slate-700 leading-relaxed select-none">
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        {/* Highlighted overlay */}
        <pre
          ref={preRef}
          className="absolute inset-0 left-12 p-6 font-mono text-14 leading-relaxed text-slate-800 dark:text-slate-300 pointer-events-none whitespace-pre-wrap break-all overflow-hidden"
          aria-hidden="true"
        >
          {renderHighlighted()}
        </pre>

        {/* Transparent textarea */}
        <textarea
          data-testid="broker-config-textarea"
          ref={textareaRef}
          value={rawContent}
          onChange={handleSourceChange}
          onScroll={syncScroll}
          spellCheck="false"
          className="absolute inset-0 left-12 w-[calc(100%-3rem)] h-full bg-transparent p-6 font-mono text-14 leading-relaxed text-transparent caret-slate-800 dark:caret-bk-yellow outline-none resize-none whitespace-pre-wrap break-all overflow-auto"
          placeholder={CM.brokerConfigPlaceholder}
        />
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
        <span>{CM.commentsPreserved}</span>
        <StatusBadge label={CM.source} variant="emerald" className="border-none bg-transparent" />
      </div>
    </div>
  );
}
