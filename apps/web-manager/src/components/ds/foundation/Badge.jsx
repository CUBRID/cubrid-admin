import React from 'react';

export const Badge = ({
  variant = 'default',
  size = 'md',
  className = '',
  children,
}) => {
  const baseClasses = 'inline-flex items-center font-semibold rounded-sm px-2 py-0.5 tracking-wide';
  
  const variants = {
    default: 'bg-slate-100 text-slate-600 dark:bg-bk-main/50 dark:text-slate-400',
    primary: 'bg-amber/10 text-amber',
    success: 'bg-emerald-500/10 text-emerald-500',
    warning: 'bg-amber-500/10 text-amber-500',
    danger: 'bg-rose-500/10 text-rose-500',
    info: 'bg-blue-500/10 text-blue-500',
  };

  const sizes = {
    sm: 'text-11 h-4',
    md: 'text-12 h-5',
    lg: 'text-13 h-6',
  };

  return (
    <span className={`${baseClasses} ${variants[variant] || variants.default} ${sizes[size] || sizes.md} ${className}`}>
      {children}
    </span>
  );
};
