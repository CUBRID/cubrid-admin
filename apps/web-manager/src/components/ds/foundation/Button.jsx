import React from 'react';

export const Button = React.forwardRef(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  className = '',
  children,
  ...props
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg whitespace-nowrap transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-amber-500 hover:bg-amber-400 text-white border border-amber-600/20 shadow-lg shadow-amber-500/10 active:scale-[0.98]',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 border border-transparent active:scale-[0.98]',
    outline: 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/4 active:scale-[0.98]',
    ghost: 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 active:scale-[0.98]',
    danger: 'bg-rose-500 hover:bg-rose-400 text-white border border-rose-600/20 shadow-lg shadow-rose-500/10 active:scale-[0.98]',
  };


  const sizes = {
    sm: 'px-4 py-1.5 text-13 h-[32px]',
    md: 'px-6 py-2 text-15 h-[40px]',
    lg: 'px-8 py-3 text-16 h-[48px]',
    icon: 'p-1.5',
  };

  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;

  return (
    <button
      ref={ref}
      className={`${baseClasses} ${variantClass} ${sizeClass} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="material-symbols-outlined mr-2" style={{ fontVariationSettings: "'wght' 300", fontSize: '1.2em' }}>
          {icon}
        </span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && (
        <span className="material-symbols-outlined ml-2" style={{ fontVariationSettings: "'wght' 300", fontSize: '1.2em' }}>
          {icon}
        </span>
      )}
    </button>
  );
});

Button.displayName = 'Button';
