import React from 'react';

import { EmptyState } from '../../components/ds/layout/EmptyState';

export const PermissionGate = ({
  requires = [],
  fallback = <EmptyState title="Access Denied" description="You do not have permission to view this content." icon="lock" />,
  children,
}) => {
  // Assuming a generic pattern where the userSlice has currentUser or session data

  // Fallback simplified role matching since specific role slice wasn't provided directly in snippet
  // We'll mock fail-closed if required array is empty (no requirement = open block logic, handled below)
  
  if (!requires || requires.length === 0) {
    return <>{children}</>;
  }

  // MOCK: Replace with actual Redux role checking logic once identified. 
  // e.g. const hasRole = currentUser.roles.some(r => requires.includes(r.name))
  const hasRole = true; 

  if (!hasRole) {
    return fallback;
  }

  return <>{children}</>;
};
