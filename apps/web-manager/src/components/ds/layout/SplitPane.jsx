import React, { useState, useRef, useEffect } from 'react';
import { useCM } from '../../../constants/useCM';

export const SplitPane = ({
  children,
  split = 'vertical', // 'vertical' (Left/Right) or 'horizontal' (Top/Bottom)
  defaultSize = 260,
  minSize = 100,
  maxSize = 800,
  className = '',
  size: propSize,
  onSizeChange,
}) => {
  const CM = useCM();
  const [internalSize, setInternalSize] = useState(defaultSize);
  const size = propSize !== undefined ? propSize : internalSize;
  const setSize = onSizeChange || setInternalSize;
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const isVertical = split === 'vertical';

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      let newSize = isVertical 
        ? e.clientX - containerRect.left
        : e.clientY - containerRect.top;
      
      if (newSize < minSize) newSize = minSize;
      if (newSize > maxSize) newSize = maxSize;
      
      // Prevent pane from crushing the other pane entirely
      const maxContainerSize = isVertical ? containerRect.width : containerRect.height;
      if (newSize > maxContainerSize - 50) newSize = maxContainerSize - 50;

      setSize(newSize);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minSize, maxSize, isVertical, setSize]);

  // Read the first two children as Pane 1 and Pane 2
  const childrenArray = React.Children.toArray(children);
  const pane1 = childrenArray[0] || null;
  const pane2 = childrenArray[1] || null;

  return (
    <div 
      ref={containerRef} 
      className={`flex h-full w-full overflow-hidden ${isVertical ? 'flex-row' : 'flex-col'} ${className}`}
    >
      <div 
        className="shrink-0 relative h-full w-full overflow-hidden" 
        style={{ [isVertical ? 'width' : 'height']: `${size}px`, [isVertical ? 'height' : 'width']: '100%' }}
      >
        {pane1}
      </div>
      
      {/* Keep the divider and its glow above pane headers (z-20/z-40), below dialogs. */}
      <div
        className={`shrink-0 z-50 group/resize relative flex items-center justify-center transition-colors ${
          isVertical ? 'w-1.5 cursor-col-resize h-full mx-[-3px]' : 'h-1.5 cursor-row-resize w-full my-[-3px]'
        } ${isDragging ? 'bg-bk-yellow/10' : 'bg-transparent hover:bg-bk-yellow/5'}`}
        onMouseDown={() => {
          setIsDragging(true);
          document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
          document.body.style.userSelect = 'none';
        }}
        title={CM.dragToResizeTitle}
      >
        <div className={`transition-all duration-200 ${
          isVertical ? 'w-0.5 h-full' : 'h-0.5 w-full'
        } ${
          isDragging ? 'bg-bk-yellow shadow-[0_0_8px_rgba(255,193,7,0.5)] scale-x-150' : 'bg-slate-200 dark:bg-white/10 group-hover/resize:bg-bk-yellow'
        }`} />
      </div>
      
      <div className="flex-1 min-w-0 min-h-0 relative h-full w-full overflow-hidden">
        {pane2}
      </div>
    </div>
  );
};
