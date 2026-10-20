import { useContext } from 'react';
import { CmsJobContext } from '../context/cmsJobContextValue';

export function useCmsJobs() {
  const ctx = useContext(CmsJobContext);
  if (!ctx) {
    throw new Error('useCmsJobs must be used within CmsJobProvider');
  }
  return ctx;
}
