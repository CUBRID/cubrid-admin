import React from 'react';

import { Icon } from '../ds/foundation/Icon';

/**
 * A premium, reusable error view for use inside modals or empty states.
 * Centralizes error parsing and consistent design.
 */
const ModalErrorView = ({ error, onRetry, retryText = "Try Again", title = "Operation Failed" }) => {
  // Centralized parsing for the specific API error format: { code, title, type }
  const getErrorMessage = () => {
    if (!error) return "An unexpected error occurred.";
    if (typeof error === 'string') return error;
    
    // Check for response-level data (Axios)
    const data = error.response?.data || error;
    return data.message || data.title || data.code || error.message || "Operation failed.";
  };

  const message = getErrorMessage();

  return (
    <div className="flex flex-col items-center justify-center py-6 space-y-6 animate-in fade-in zoom-in-95 duration-150 min-h-[300px]">
      {/* Premium Icon Container */}
      <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20 shadow-xl shadow-rose-500/5">
        <Icon name="error" size="sm" weight={300} className="text-4xl text-rose-500 animate-pulse" />
      </div>
      
      {/* Content */}
      <div className="text-center max-w-md space-y-2">
        <h4 className="text-17 font-bold text-slate-900 dark:text-white tracking-tight">{title}</h4>
        
        <div className="p-4 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/10 rounded-xl">
          <p className="text-14 text-rose-600 dark:text-rose-400 leading-relaxed font-medium">
            {message}
          </p>
        </div>
        
        <p className="text-13 text-slate-500 dark:text-slate-500 px-6">
          Please verify your credentials and try again. If the problem persists, contact your administrator.
        </p>
      </div>

      {/* Action */}
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-10 py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-13 font-bold hover:bg-slate-900 dark:hover:bg-slate-600 transition-all active:scale-95 shadow-lg shadow-slate-500/10"
        >
          {retryText}
        </button>
      )}
    </div>
  );
};

export default ModalErrorView;
