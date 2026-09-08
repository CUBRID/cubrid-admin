import React, { useState } from 'react';
import { Icon } from '../foundation/Icon';
import { useCM } from '../../../constants/useCM';

export const CodeBlock = ({
  language = 'sql',
  value = '',
  copyable = true,
  className = '',
}) => {
  const CM = useCM();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative group/code rounded-md bg-slate-900 border border-slate-800 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-800/50 border-b border-slate-800">
        <span className="text-12 font-mono text-slate-400 uppercase tracking-wider">{language}</span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="text-slate-400 hover:text-white transition-colors"
            title={CM.copyToClipboard}
          >
            {copied ? <Icon name="check" size="sm" className="text-emerald-400"  weight={300} /> : <Icon name="content_copy" size="sm"  weight={300} />}
          </button>
        )}
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-slate-300 whitespace-pre">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
};
