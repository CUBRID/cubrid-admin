import React, { useId } from 'react';
import { Icon } from '../foundation/Icon';
import { useCM } from '../../../constants/useCM';

export const SearchInput = ({
  value = '',
  onChange,
  onClear,
  placeholder = null,
  className = '',
  id,
  label,
}) => {
  const CM = useCM();
  const generatedId = useId();
  const resolvedPlaceholder = placeholder ?? CM.searchPlaceholder;
  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <div className="absolute left-3 text-slate-400 dark:text-slate-500 flex items-center pointer-events-none">
        <Icon name="search" size="sm"  weight={300} />
      </div>
      
      <input
        id={id || generatedId}
        type="text"
        aria-label={label || resolvedPlaceholder}
        className="w-full h-10 pl-9 pr-8 text-[13px] font-medium bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10 hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200"
        placeholder={resolvedPlaceholder}
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
      />

      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex items-center justify-center rounded-full p-0.5"
          aria-label={CM.clearSearchAriaLabel}
        >
          <Icon name="close" size="sm"  weight={300} />
        </button>
      )}
    </div>
  );
};
