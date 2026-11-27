import { EDIT_REDO_EVENT, redoAccelerator, redoInPage, type PageDocument } from './edit-redo';

const page = (activeElement: EventTarget | null) => {
  const execCommand = jest.fn(() => true);
  const doc: PageDocument = { activeElement, body: null, execCommand };
  return { doc, execCommand };
};

describe('Edit > Redo in the page', () => {
  it('an editor that takes the event redoes, and the browser redo does not run as well', () => {
    const editor = new EventTarget();
    const handled = jest.fn((event: Event) => event.preventDefault());
    editor.addEventListener(EDIT_REDO_EVENT, handled);
    const { doc, execCommand } = page(editor);
    expect(redoInPage(doc)).toBe('editor');
    expect(handled).toHaveBeenCalledTimes(1);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('a text field (nothing takes the event): the browser redo, as the role did', () => {
    const { doc, execCommand } = page(new EventTarget());
    expect(redoInPage(doc)).toBe('browser');
    expect(execCommand).toHaveBeenCalledWith('redo');
  });

  it('no focused element: the browser redo', () => {
    const { doc, execCommand } = page(null);
    expect(redoInPage(doc)).toBe('browser');
    expect(execCommand).toHaveBeenCalledWith('redo');
  });

  it('the key the redo role has', () => {
    expect(redoAccelerator('win32')).toBe('Control+Y');
    expect(redoAccelerator('darwin')).toBe('Shift+CommandOrControl+Z');
    expect(redoAccelerator('linux')).toBe('Shift+CommandOrControl+Z');
  });
});
