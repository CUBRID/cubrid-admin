// The Monaco editor from our own bundle, not from a CDN: @monaco-editor/react
// otherwise loads monaco-editor from cdn.jsdelivr.net at run time, which fails
// on a closed network. Only the SQL language and the base editor worker are
// included. Loaded on demand through SqlCodeEditor.
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/sql/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

export default Editor;
