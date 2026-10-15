import React, { useState } from 'react';
import { Icon } from '../../ds/foundation/Icon';
import { Typography } from '../../ds/foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const CopyableValue = ({
  value,
  label,
  className = '',
  truncate = false,
}) => {
  const CM = useCM();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <Typography variant="label" className="text-slate-500 dark:text-slate-400 text-13 uppercase tracking-wider">
          {label}
        </Typography>
      )}
      <div 
        className="group flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md cursor-pointer hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-colors"
        onClick={handleCopy}
        title={CM.copyToClipboard}
      >
        <Typography variant="span" className={`font-mono text-sm text-slate-700 dark:text-slate-300 ${truncate ? 'truncate flex-1' : 'break-all'}`}>
          {value || '-'}
        </Typography>
        <span className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
          {copied ? <Icon name="check" size="sm" className="text-emerald-500"  weight={300} /> : <Icon name="content_copy" size="sm"  weight={300} />}
        </span>
      </div>
    </div>
  );
};
