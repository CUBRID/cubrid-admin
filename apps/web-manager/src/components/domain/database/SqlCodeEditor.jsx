import React, { lazy, Suspense } from 'react';

const MonacoSqlEditor = lazy(() => import('./MonacoSqlEditor'));

/**
 * @monaco-editor/react's Editor, with Monaco bundled locally and loaded the
 * first time an editor is shown (it is large). Same props as that Editor.
 */
export default function SqlCodeEditor(props) {
  return (
    <Suspense fallback={<div style={{ height: props.height }} />}>
      <MonacoSqlEditor {...props} />
    </Suspense>
  );
}
