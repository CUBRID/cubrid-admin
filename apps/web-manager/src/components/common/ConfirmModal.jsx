import React from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../ds/foundation/Icon';

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Unsaved Changes', 
  message = 'You have unsaved changes. Are you sure you want to proceed?',
  confirmLabel = 'Discard Changes',
  cancelLabel = 'Keep Editing',
  variant = 'danger' // 'danger' or 'primary'
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-[360px] bg-white dark:bg-bk-side rounded-[28px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.7)] border border-slate-200/50 dark:border-white/5 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        
        {/* Top Decorative Graphic */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-linear-to-r from-transparent via-amber-400 to-transparent opacity-60"></div>
        
        <div className="p-6">
          {/* Header with Icon */}
          <div className="flex flex-col items-center mb-5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
              variant === 'danger' 
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/15' 
                : 'bg-amber/10 text-amber border border-amber/15'
            }`}>
              <Icon name="{variant === 'danger' ? 'warning' : 'help'}" size="sm" weight={300} className="select-none" />
            </div>
            
            <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center leading-tight">
              {title}
            </h3>
          </div>

          {/* Message */}
          <div className="mb-8 overflow-hidden">
            <p className="text-15 text-slate-500 dark:text-slate-400 leading-relaxed text-center px-2">
              {message}
            </p>
          </div>

          {/* Buttons - Sequential for small width but compact */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`w-full py-2.5 rounded-2xl text-15 font-bold transition-all shadow-md active:scale-[0.98] ${
                variant === 'danger'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/10 hover:shadow-rose-500/20'
                  : 'bg-amber hover:bg-amber-400 text-bk-side shadow-amber/10 hover:shadow-amber/20'
              }`}
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl text-15 font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
            >
              {cancelLabel}
            </button>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="py-2.5 bg-slate-50/50 dark:bg-black/20 border-t border-slate-100 dark:border-white/5 flex justify-center">
            <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-11 uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">Unsaved Session</span>
            </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
