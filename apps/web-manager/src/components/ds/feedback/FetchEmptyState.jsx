import React from 'react';
import { EmptyState } from './EmptyState';
import { EmptyState as TableEmptyState } from '../layout/EmptyState';
import { useCM } from '../../../constants/useCM';

/**
 * What an empty, fetch-backed section shows in place of its rows, so "no
 * data" only appears after a fetch actually succeeded with nothing.
 *
 * @param {undefined|'loading'|'loaded'|'error'} status - unset/'loading' until the first fetch settles
 * @param {string} title - section name shown with the loading message
 * @param {React.ReactNode} empty - shown after a successful empty fetch (default: Table's "No data available")
 * @param {string} errorTitle - shown when the fetch failed (default: generic "unavailable")
 * @param {string} errorSubtitle
 */
export const FetchEmptyState = ({ status, title, empty, errorTitle, errorSubtitle, py = 'py-8' }) => {
  const CM = useCM();
  if (status === 'error') {
    return (
      <EmptyState
        icon="error"
        accent="rose"
        title={errorTitle ?? CM.dataUnavailableTitle}
        subtitle={errorSubtitle ?? CM.dataUnavailableMsg}
        py={py}
      />
    );
  }
  if (status === 'loaded') {
    return empty ?? <TableEmptyState title={CM.noDataAvailableMsg} icon="table_chart" />;
  }
  return <EmptyState icon="hourglass_empty" accent="slate" title={title} subtitle={CM.loadingLabel} py={py} />;
};
