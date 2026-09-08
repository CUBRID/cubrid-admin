import React from 'react';

export const Typography = ({
  variant = 'p',
  className = '',
  children,
  ...props
}) => {
  const Component = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label'].includes(variant) 
    ? variant 
    : 'span';

  const baseStyles = {
    h1: 'text-4xl font-bold text-slate-900 dark:text-white',
    h2: 'text-3xl font-bold text-slate-900 dark:text-white',
    h3: 'text-2xl font-semibold text-slate-900 dark:text-white',
    h4: 'text-xl font-semibold text-slate-900 dark:text-white',
    h5: 'text-lg font-medium text-slate-900 dark:text-white',
    h6: 'text-base font-medium text-slate-900 dark:text-white',
    p: 'text-slate-700 dark:text-slate-300',
    span: 'text-inherit',
    label: 'text-sm font-medium text-slate-700 dark:text-slate-300',
    caption: 'text-13 text-slate-500 dark:text-slate-400',
    code: 'font-mono text-sm bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded-sm text-slate-800 dark:text-slate-200',
  };

  const appliedClass = `${baseStyles[variant] || baseStyles.span} ${className}`;

  if (variant === 'code') {
    return <code className={appliedClass} {...props}>{children}</code>;
  }
  if (variant === 'caption') {
    return <span className={appliedClass} {...props}>{children}</span>;
  }

  return (
    <Component className={appliedClass} {...props}>
      {children}
    </Component>
  );
};
