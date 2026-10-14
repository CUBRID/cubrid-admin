import React, { useRef } from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const FileUpload = ({
  onFileSelect,
  accept = '*',
  disabled = false,
  label = null,
  className = '',
}) => {
  const CM = useCM();
  const resolvedLabel = label ?? CM.chooseFileLabel;
  const fileInputRef = useRef(null);

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div 
      className={`relative w-full border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 transition-colors rounded-lg bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center p-6 text-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={handleClick}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
          event.preventDefault();
          handleClick();
        }
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={resolvedLabel}
      aria-disabled={disabled}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept={accept}
        className="hidden"
        disabled={disabled}
        tabIndex={-1}
      />
      <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3 text-amber-600 dark:text-amber-500">
        <Icon name="cloud_upload" size="xl"  weight={300} />
      </div>
      <Typography variant="h6" className="text-slate-700 dark:text-slate-200 mb-1 font-medium">{resolvedLabel}</Typography>
      <Typography variant="p" className="text-sm text-slate-500">
        {CM.dragDropFileHint}
      </Typography>
    </div>
  );
};
