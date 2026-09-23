import React from 'react';

import { Icon } from '../ds/foundation/Icon';

const ErrorOverlay = ({ isVisible, error, title = "Operation Failed", onRetry, onClose }) => {
  if (!isVisible || !error) return null;

  return (
    <div className="absolute inset-0 z-200 flex flex-col items-center justify-center bg-white dark:bg-[#1e2230] animate-in fade-in duration-200 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
      </div>

      {/* Ambient Red Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-rose-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-8 w-full max-w-[420px]">
        <div className="relative h-16 w-16 flex items-center justify-center">
            {/* Pulsing Icon Container */}
            <div className="absolute inset-0 bg-rose-500/10 rounded-full animate-ping duration-[2s]"></div>
            <div className="relative h-12 w-12 bg-rose-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                <Icon name="error" size="sm" weight={300} className="text-white" />
            </div>
        </div>

        <div className="space-y-4 w-full">
          <h4 className="text-19 font-black text-slate-900 dark:text-white tracking-tight">{title}</h4>
          
          <div className="max-h-[160px] overflow-y-auto custom-scrollbar px-2">
            <p className="text-13 text-slate-500 dark:text-slate-400 font-mono leading-relaxed break-words bg-slate-50 dark:bg-black/20 p-3 rounded-lg border border-slate-100 dark:border-white/5">
              {typeof error === 'string' ? error : 'Something went wrong. Please try again.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2">
            {onClose && (
                <button 
                onClick={onClose}
                className="px-5 py-1.5 text-13 font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors tracking-wide"
                >
                Close
                </button>
            )}
            {onRetry && (
                <button 
                onClick={onRetry}
                className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white text-13 font-medium rounded-sm shadow-lg shadow-rose-500/20 transition-all active:scale-95 tracking-wide flex items-center gap-2"
                >
                <Icon name="refresh" size="sm" weight={300} />
                Try again
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default ErrorOverlay;
