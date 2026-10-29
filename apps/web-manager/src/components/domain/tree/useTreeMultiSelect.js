import { useRef } from 'react';

/**
 * Ctrl/Cmd toggles an item in a tree's multi-selection and Shift selects
 * the range from the last clicked item, the same rules as the host tree
 * (HostGroupTree.handleMultiSelect). A plain click on an item outside the
 * selection ends it; one inside keeps it, so a right-click right after
 * still acts on all of them.
 *
 * @param {string[]} order - item keys in the order the tree shows them
 * @returns {(event, key) => boolean} true when the click was a
 *   multi-selection click, which should neither select nor toggle the node
 */
export function useTreeMultiSelect(order, selected, onSelectedChange) {
  const lastClickedRef = useRef(null);
  return (e, key) => {
    if (!onSelectedChange) return false;
    if (e?.shiftKey && lastClickedRef.current) {
      const startIdx = order.indexOf(lastClickedRef.current);
      const endIdx = order.indexOf(key);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        onSelectedChange(new Set(order.slice(from, to + 1)));
        return true;
      }
    }
    if (e?.metaKey || e?.ctrlKey) {
      onSelectedChange((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      lastClickedRef.current = key;
      return true;
    }
    lastClickedRef.current = key;
    if (selected?.size > 0 && !selected.has(key)) onSelectedChange(new Set());
    return false;
  };
}
