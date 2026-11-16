import React, { lazy, Suspense } from 'react';

const CodeMirrorSqlEditor = lazy(() => import('./CodeMirrorSqlEditor'));

/**
 * The SQL editor (CodeMirror 6, bundled with the app, no CDN), loaded the
 * first time an editor is shown.
 *
 * @param value, onChange(text), height (CSS), readOnly, testId, placeholder
 */
export default function SqlCodeEditor(props) {
  return (
    <Suspense fallback={<div style={{ height: props.height }} />}>
      <CodeMirrorSqlEditor {...props} />
    </Suspense>
  );
}
