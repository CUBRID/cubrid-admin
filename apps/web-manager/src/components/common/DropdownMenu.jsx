import { useState, useRef, useCallback, useLayoutEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const MenuContext = createContext({ closeMenu: () => {} });

/**
 * Reusable submenu component with hover delay.
 * Aligned with the "Technical Compact" design system.
 */
export function SubMenu({ icon, iconColor = '', label, children, width = 'w-56', gap = 'ml-1' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 'right', top: 0, left: 0, maxHeight: 300 });
  const [isPositioned, setIsPositioned] = useState(false);
  const timerRef = useRef(null);
  const menuRef = useRef(null);
  const containerRef = useRef(null);

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setOpen(false);
      setIsPositioned(false);
    }, 120);
  }, []);

  useLayoutEffect(() => {
    if (open && menuRef.current && containerRef.current && !isPositioned) {
      const parentRect = containerRef.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let newX = 'right';
      let maxHeight = viewportHeight - 40; // 20px padding top/bottom

      // Horizontal positioning
      let left = parentRect.right + 4; // Small gap
      if (left + menuRect.width > viewportWidth) {
        newX = 'left';
        left = parentRect.left - menuRect.width - 4;
      }
      
      // Vertical positioning with screen-boundary awareness
      let top = parentRect.top;
      
      // If it overflows the bottom, shift it up
      if (top + menuRect.height > viewportHeight - 20) {
        top = viewportHeight - menuRect.height - 20;
      }
      
      // If after shifting up it overflows the top, pin it to the top and use scrolling
      if (top < 20) {
        top = 20;
        maxHeight = viewportHeight - 40;
      }

      setPosition({ x: newX, top, left, maxHeight });
      setIsPositioned(true);
    }
  }, [open, isPositioned]);

  const menuStyle = isPositioned ? {
    top: `${position.top}px`,
    left: `${position.left}px`,
    maxHeight: `${position.maxHeight}px`,
    visibility: 'visible',
    position: 'fixed',
    zIndex: 100000
  } : {
    top: '-9999px',
    left: '-9999px',
    visibility: 'hidden',
    position: 'fixed'
  };

  const portalContent = open && (
    <div 
      ref={menuRef}
      className={`${width} bg-white dark:bg-bk-side border border-slate-200 dark:border-slate-800 rounded-xl 
        shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-1.5 animate-in fade-in transition duration-200 context-menu-container
        ${isPositioned ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        ${position.x === 'right' ? 'origin-left' : 'origin-right'}
        overflow-y-auto overflow-x-hidden custom-scrollbar`}
      onClick={(e) => e.stopPropagation()}

      style={menuStyle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Subtle Decorative Side Bar */}
      <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-bk-yellow/20 rounded-full"></div>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button className={`w-full text-left px-3 py-2 text-14 font-medium tracking-wide transition-all rounded-md flex items-center justify-between group relative overflow-hidden
        ${open ? 'bg-amber-500/6 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500' : 'text-slate-600 dark:text-slate-400 hover:bg-amber-500/6 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-500'}`}>
        
        {/* Decorative hover/open indicator matching TreeNode */}
        <div className={`absolute left-0 top-1.5 bottom-1.5 bg-amber-500 rounded-full transition-all duration-200 ${open ? 'w-[2px]' : 'w-0 group-hover:w-[2px]'}`}></div>
        
        <span className="flex items-center gap-2.5">
          {icon && (
            <span className={`material-symbols-outlined transition-colors 
              ${open ? 'text-amber-500' : (iconColor || 'text-slate-400 dark:text-slate-500 group-hover:text-amber-500')}`}
              style={{ fontSize: '18px' }}>
              {icon}
            </span>
          )}
          <span>{label}</span>
        </span>
        <span className={`material-symbols-outlined transition-transform duration-200 
          ${open ? 'text-amber-500 rotate-90' : 'text-slate-400 dark:text-slate-600'}`}
          style={{ fontSize: '16px' }}>
          {position.x === 'right' ? 'chevron_right' : 'chevron_left'}
        </span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(portalContent, document.body)}
    </div>
  );
}

/**
 * Reusable top-level dropdown menu with hover delay.
 * Adheres to the "Technical Compact" design language.
 */
export function DropdownMenu({ label, children, width = 'w-52' }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('left');
  const [isPositioned, setIsPositioned] = useState(false);
  const timerRef = useRef(null);
  const menuRef = useRef(null);

  const handleEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setOpen(false);
      setIsPositioned(false);
    }, 120);
  }, []);

  useLayoutEffect(() => {
    if (open && menuRef.current && !isPositioned) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      let newAlign = 'left';
      if (rect.right > viewportWidth) {
        newAlign = 'right';
      } else if (rect.left < 0) {
        newAlign = 'left';
      }

      setAlign(newAlign);
      setIsPositioned(true);
    }
  }, [open, isPositioned]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setIsPositioned(false);
  }, []);

  return (
    <div className="relative font-sans" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-15 font-medium tracking-wide transition-all duration-200
        ${open ? 'text-bk-yellow bg-bk-yellow/5' : 'text-slate-600 dark:text-slate-400 hover:text-bk-yellow'}`}>
        <span>{label}</span>
        <span className={`material-symbols-outlined transition-transform duration-200 ${open ? 'rotate-180 text-bk-yellow' : 'text-slate-400'}`}
          style={{ fontSize: '18px' }}>
          expand_more
        </span>
      </button>

      {open && (
        <MenuContext.Provider value={{ closeMenu }}>
          <div 
            ref={menuRef}
            className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full mt-2
              ${width} bg-white dark:bg-bk-side border border-slate-200 dark:border-slate-800 rounded-xl 
              shadow-[0_4px_25px_rgba(0,0,0,0.2)] p-1.5 z-1000 animate-in fade-in transition duration-200
              ${isPositioned ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95'}`}
          >
            {/* Subtle Top Accent */}
            <div className="absolute top-0 left-4 right-4 h-[2px] bg-linear-to-r from-transparent via-bk-yellow/30 to-transparent"></div>
            
            <div className="space-y-0.5" onClick={(e) => e.stopPropagation()}>
              {children}
            </div>
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

/**
 * Enhanced menu item for the professional ecosystem.
 */
export function MenuItem({ icon, iconColor = '', label, onClick, href, disabled = false }) {
  const { closeMenu } = useContext(MenuContext);
  const baseClasses = `flex items-center gap-2.5 px-3 py-2 text-14 font-medium tracking-wide transition-all w-full text-left rounded-lg font-sans relative group overflow-hidden`;
  
  const handleClick = (e) => {
    if (disabled) return;
    if (onClick) onClick(e);
    closeMenu();
  };
  const stateClasses = disabled 
    ? 'opacity-30 cursor-not-allowed text-slate-400' 
    : 'text-slate-600 dark:text-slate-300 hover:bg-amber-500/6 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-500 active:scale-[0.98]';

  const content = (
    <>
      {/* Decorative hover indicator matching TreeNode */}
      {!disabled && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-0 bg-amber-500 transition-all duration-200 group-hover:w-[2px] rounded-full"></div>
      )}
      
      {icon && (
        <span className={`material-symbols-outlined transition-colors duration-200
          ${disabled ? 'text-slate-300 dark:text-slate-700' : (iconColor || 'text-slate-400 dark:text-slate-500')}
          ${!disabled && !iconColor ? 'group-hover:text-amber-600 dark:group-hover:text-amber-500' : ''}`}
          style={{ fontSize: '18px' }}>
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <a className={`${baseClasses} ${stateClasses}`} href={href} onClick={handleClick}>
        {content}
      </a>
    );
  }

  return (
    <button className={`${baseClasses} ${stateClasses}`} onClick={handleClick} disabled={disabled}>
      {content}
    </button>
  );
}

export function MenuDivider() {
  return (
    <div className="px-3 py-1.5 flex items-center gap-2 opacity-50">
      <div className="h-px flex-1 bg-linear-to-r from-slate-100 dark:from-slate-800 to-transparent"></div>
      <div className="flex gap-1">
        <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800"></div>
        <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800"></div>
      </div>
    </div>
  );
}
