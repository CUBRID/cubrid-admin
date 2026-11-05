import React from 'react';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { useCM } from '../../../constants/useCM';

/** In place of a database's screen while the user is not logged in to it; the screen reads nothing then. */
export default function DbLoginRequiredState() {
  const CM = useCM();
  return (
    <div data-testid="db-login-required" className="flex-1 flex items-center justify-center">
      <EmptyState icon="lock" accent="slate" title={CM.databaseNotLoggedIn} />
    </div>
  );
}
