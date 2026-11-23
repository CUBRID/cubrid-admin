const { expect } = require('@playwright/test');

/**
 * The conf and SQL editors are CodeMirror 6: a contenteditable `.cm-content`
 * (the element with the editor's data-testid), not a textarea. CodeMirror
 * draws only the lines in view, so the whole text is read from the editor
 * itself, not from the page.
 *
 * The view is found the way EditorView.findFromDOM does (CodeMirror 6.43:
 * `.cm-content`.cmTile.root.view; older: .cmView.rootView.view). If neither
 * is there, this fails instead of returning a partial text.
 */
async function editorText(content) {
  return content.evaluate((el) => {
    const view = el.cmTile?.root?.view ?? el.cmView?.rootView?.view ?? el.cmView?.view;
    if (!view?.state?.doc) throw new Error('No CodeMirror view on this element (CodeMirror internals changed?)');
    return view.state.doc.toString();
  });
}

/** Waits until the editor has text (the file has loaded), and returns it. */
async function loadedEditorText(content, timeout = 15000) {
  await expect.poll(() => editorText(content), { timeout }).not.toBe('');
  return editorText(content);
}

/** Puts the cursor at the end of the document and types `text`. */
async function typeAtEnd(page, content, text) {
  await content.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

module.exports = { editorText, loadedEditorText, typeAtEnd };
