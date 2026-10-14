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
        return <span key={i} className="text-slate-400 dark:text-editor-comment">{line}{'\n'}</span>;
      if (t.startsWith('[') && t.endsWith(']'))
        return <span key={i} className="text-amber-600 dark:text-editor-section font-semibold">{line}{'\n'}</span>;
      // key = value — color the key
      const eq = line.indexOf('=');
      if (eq > 0) {
        const k = line.substring(0, eq);
        const v = line.substring(eq);
        return (
          <span key={i}>
            <span className="text-sky-600 dark:text-editor-key">{k}</span>
            <span className="text-slate-500 dark:text-editor-value">{v}</span>
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
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono">cubrid_broker.conf</span>
        </div>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest">
          {CM.linesLabel(lineCount)}
        </span>
      </div>

      {/* Editor area */}
      <div className="config-source-editor flex-1 relative overflow-hidden bg-white dark:bg-editor-bg">
        {/* Line numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 dark:bg-editor-gutter border-r border-slate-100 dark:border-editor-border overflow-hidden pointer-events-none z-10">
          <div className="p-4 pt-6 flex flex-col items-end gap-0">
            {rawContent.split('\n').map((_, i) => (
              <span key={i} className="text-[12px] font-mono text-slate-300 dark:text-editor-line leading-relaxed select-none">
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        {/* Highlighted overlay */}
        <pre
          ref={preRef}
          className="absolute inset-0 left-12 p-6 font-mono text-[12.5px] leading-relaxed text-slate-800 dark:text-editor-text pointer-events-none whitespace-pre-wrap break-all overflow-hidden"
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
          className="config-source-input absolute inset-0 left-12 w-[calc(100%-3rem)] h-full bg-transparent p-6 font-mono text-[12.5px] leading-relaxed text-transparent caret-slate-800 dark:caret-editor-section focus-visible:outline-2 focus-visible:outline-amber-500/70 dark:focus-visible:outline-editor-key/60 focus-visible:outline-offset-[-2px] resize-none whitespace-pre-wrap break-all overflow-auto"
          placeholder={CM.brokerConfigPlaceholder}
        />
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
        <span>{CM.commentsPreserved}</span>
        <StatusBadge label={CM.source} variant="emerald" className="border-none bg-transparent" />
      </div>
    </div>
  );
}
