import React, { Suspense } from 'react';
import { ErrorBoundary } from '../../infrastructure/ErrorBoundary';
import { Button } from '../ds/foundation/Button';
import { Icon } from '../ds/foundation/Icon';
import { useCM } from '../../constants/useCM';

function EditorLoadFailed({ className }) {
  const CM = useCM();
  return (
    <div
      role="alert"
      data-testid="editor-load-failed"
      className={`flex flex-col items-center justify-center gap-3 p-6 text-center text-14 text-slate-600 dark:text-slate-300 ${className}`}
    >
      <Icon name="error_outline" size="lg" className="text-amber-500" />
      <p>{CM.editorLoadFailed}</p>
      <Button variant="outline" size="sm" icon="refresh" onClick={() => window.location.reload()}>
        {CM.reloadApplication}
      </Button>
    </div>
  );
}

/**
 * Around a lazily loaded editor: `fallback` while its code loads, and a
 * message with a reload button in its place (not the whole app) when the code
 * cannot be loaded. It does not retry by itself.
 */
export default function EditorLoadBoundary({ fallback, className = '', children }) {
  return (
    <ErrorBoundary fallback={<EditorLoadFailed className={className} />}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}
