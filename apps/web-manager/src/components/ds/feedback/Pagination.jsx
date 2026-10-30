import React from 'react';
import { Icon } from '../foundation/Icon';
import { useCM } from '../../../constants/useCM';

// Same box as the page number buttons. (Button adds a text gap after its icon.)
const STEP_CLASS = 'min-w-[32px] h-8 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-slate-900';

export const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  className = '',
}) => {
  const CM = useCM();
  // Simple logic to show window of numbers
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, currentPage + 2);
      
      if (currentPage <= 3) {
        end = 5;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 4;
      }
      
      if (start > 1) pages.push(1, '...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages) pages.push('...', totalPages);
    }
    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <nav className={`flex items-center justify-center gap-1 ${className}`} aria-label={CM.paginationAriaLabel}>
      <button
        type="button"
        aria-label={CM.previousPage}
        className={STEP_CLASS}
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <Icon name="chevron_left" size="19px" />
      </button>
      
      {getPageNumbers().map((page, idx) => {
        if (page === '...') {
          return <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">...</span>;
        }
        
        const isActive = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onPageChange(page)}
            className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-amber-600 text-white border border-amber-600'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {page}
          </button>
        );
      })}
      
      <button
        type="button"
        aria-label={CM.nextPage}
        className={STEP_CLASS}
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <Icon name="chevron_right" size="19px" />
      </button>
    </nav>
  );
};

/**
 * The row range and page buttons under a table paged with
 * useClientPagination. Renders nothing while everything fits on one page.
 */
export const TablePagination = ({ pager, testId, className = '' }) => {
  const CM = useCM();
  if (pager.totalPages <= 1) return null;
  return (
    <div data-testid={testId} className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-12 font-bold text-slate-400 dark:text-slate-500 font-mono">
        {CM.showingRangeOfTotal(pager.from, pager.to, pager.total)}
      </span>
      <Pagination currentPage={pager.page} totalPages={pager.totalPages} onPageChange={pager.setPage} />
    </div>
  );
};
