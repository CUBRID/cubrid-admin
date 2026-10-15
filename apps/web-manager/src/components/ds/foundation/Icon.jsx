import React from 'react';

export const Icon = ({ name, size = '16px', weight = 300, className = '', ...props }) => {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: `'wght' ${weight}`,
        fontSize: size === 'sm' ? '15px' : size === 'md' ? '17px' : size === 'lg' ? '21px' : size === 'xl' ? '25px' : size,
      }}
      {...props}
    >
      {name}
    </span>
  );
};
