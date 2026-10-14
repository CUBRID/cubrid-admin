import React, { useState } from 'react';
import { Button } from '../../ds/foundation/Button';
import { CodeBlock } from '../../ds/layout/CodeBlock';
import { Icon } from '../../ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

export const SQLEditor = ({
  value = '',
  onChange,
  onExecute,
  onFormat,
  language = 'sql',
  readOnly = false,
  height = 'h-64',
}) => {
  const CM = useCM();
  const [internalCode, setInternalCode] = useState(value);

  const handleChange = (e) => {
    setInternalCode(e.target.value);
    if (onChange) onChange(e.target.value);
  };

  const handleExecute = () => {
    if (onExecute) onExecute(internalCode);
  };

  if (readOnly) {
    return <CodeBlock language={language} value={value} className={height} />;
  }

  return (
    <div className={`flex flex-col border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${height}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-13 font-mono text-slate-500 uppercase tracking-wider">{language}</span>
        </div>
        <div className="flex items-center gap-2">
          {onFormat && (
            <Button
              variant="ghost"
              size="sm"
              icon="format_align_left"
              onClick={() => onFormat(internalCode)}
              className="px-2 py-1 text-xs"
            >
              {CM.formatBtn}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            icon="play_arrow"
            onClick={handleExecute}
            className="px-3 py-1 text-xs shadow-xs"
          >
            {CM.execute}
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        {/* Placeholder text area since we don't have Monaco or CodeMirror installed natively */}
        <textarea
          className="absolute inset-0 w-full h-full p-4 resize-none font-mono text-sm bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden"
          value={internalCode}
          onChange={handleChange}
          spellCheck={false}
          placeholder={CM.sqlQueryPlaceholder}
        />
      </div>
    </div>
  );
};
