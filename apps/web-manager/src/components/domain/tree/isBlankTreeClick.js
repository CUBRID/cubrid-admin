// A click in a tree's panel that hit no row or control, only blank space (the
// panel itself, padding, a group's empty area, below a short list). Such a
// click ends a Ctrl/Shift multi-selection, as in a file explorer.
const ROW_OR_CONTROL = 'summary, [data-testid^="tree-node-"], [data-testid^="host-item-"], button, a, input, select, textarea, label, [role="menuitem"], [role="tab"]';

export function isBlankTreeClick(event) {
  const target = event.target;
  return target instanceof Element && !target.closest(ROW_OR_CONTROL);
}
