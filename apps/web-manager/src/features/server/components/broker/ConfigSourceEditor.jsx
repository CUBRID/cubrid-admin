import React, { lazy, Suspense } from 'react';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { Spinner } from '../../../../components/ds/foundation/Spinner';
import { useCM } from '../../../../constants/useCM';

// The editor (CodeMirror) is loaded only when the broker conf is opened.
const ConfEditor = lazy(() => import('../../confEditor/ConfEditor'));

export default function ConfigSourceEditor({ rawContent, handleSourceChange, paramSchemas }) {
  const CM = useCM();
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
      <div className="config-source-editor flex-1 relative overflow-hidden bg-white dark:bg-editor-bg">
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Spinner size="md" /></div>}>
          <ConfEditor
            testId="broker-config-textarea"
            kind="brokerconf"
            value={rawContent}
            onChange={handleSourceChange}
            paramSchemas={paramSchemas}
            placeholder={CM.brokerConfigPlaceholder}
          />
        </Suspense>
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
        <span>{CM.commentsPreserved}</span>
        <StatusBadge label={CM.source} variant="emerald" className="border-none bg-transparent" />
      </div>
    </div>
  );
}
