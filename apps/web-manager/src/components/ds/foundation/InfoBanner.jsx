import React from 'react';
import { Icon } from './Icon';
import { Typography } from './Typography';

/**
 * Standardized Information Banner for Modals and Forms
 * Provides a consistent source of truth for informational strips.
 * 
 * @param {string} title - Strategic title for the notice
 * @param {React.ReactNode} children - Narrative content for the banner
 * @param {string} icon - Material Icon name (default based on variant)
 * @param {string} variant - Theme variant: 'info', 'warning', 'danger', 'success'
 * @param {string} className - Optional container overrides
 */
export const InfoBanner = ({ 
  title, 
  children, 
  icon,
  variant = "info",
  className = "" 
}) => {

  const variants = {
    info: {
      bg: "bg-blue-50 dark:bg-blue-500/5",
      border: "border-blue-200 dark:border-blue-500/10",
      iconBoxBg: "bg-white dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20",
      iconColor: "text-blue-500",
      defaultIcon: "info"
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-500/5",
      border: "border-amber-200 dark:border-amber-500/10",
      iconBoxBg: "bg-white dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20",
      iconColor: "text-amber-500",
      defaultIcon: "warning"
    },
    danger: {
      bg: "bg-rose-50 dark:bg-rose-500/5",
      border: "border-rose-200 dark:border-rose-500/10",
      iconBoxBg: "bg-white dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20",
      iconColor: "text-rose-500",
      defaultIcon: "error"
    },
    success: {
      bg: "bg-emerald-50 dark:bg-emerald-500/5",
      border: "border-emerald-200 dark:border-emerald-500/10",
      iconBoxBg: "bg-white dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
      iconColor: "text-emerald-500",
      defaultIcon: "check_circle"
    }
  };

  const theme = variants[variant] || variants.info;
  const activeIcon = icon || theme.defaultIcon;

  return (
    <div className={`flex items-start gap-4 p-4 ${theme.bg} border ${theme.border} rounded-2xl shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-300 ${className}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${theme.iconBoxBg}`}>
        <Icon name={activeIcon} size="md" weight={300} className={theme.iconColor} />
      </div>
      <div className="space-y-1">
        <Typography variant="p" className="text-15 font-black text-slate-700 dark:text-slate-200 tracking-tight capitalize">
          {title}
        </Typography>
        <div className="text-14 text-slate-500 dark:text-slate-400 font-medium leading-relaxed block">
          {children}
        </div>
      </div>
    </div>
  );
};
