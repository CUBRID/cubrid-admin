import { useRef } from 'react';

/**
 * Ctrl/Cmd toggles an item in a tree's multi-selection and Shift selects
 * the range from the last clicked item, the same rules as the host tree
 * (HostGroupTree.handleMultiSelect). As in a file explorer, the item picked
 * with a plain click counts too: plain click A, then Ctrl/Cmd-click B
 * selects both. A plain click on an item outside the selection ends it;
 * one inside keeps it, so a right-click right after still acts on all of
 * them.
 *
 * @param {string[]} order - item keys in the order the tree shows them
 * @returns {(event, key) => boolean} true when the click was a
 *   multi-selection click, which should neither select nor toggle the node.
 *   Its `setAnchor(key)` makes `key` the item later Ctrl/Cmd and Shift
 *   clicks start from, as a plain click does; a right-click that selects an
 *   item calls it.
 */
export function useTreeMultiSelect(order, selected, onSelectedChange) {
  const lastClickedRef = useRef(null);
  // The item picked with the last plain click, until a Ctrl/Cmd or Shift
  // click: only it joins a multi-selection that starts empty.
  const plainClickedRef = useRef(null);
  const handleClick = (e, key) => {
    if (!onSelectedChange) return false;
    if (e?.shiftKey && lastClickedRef.current) {
      const startIdx = order.indexOf(lastClickedRef.current);
      const endIdx = order.indexOf(key);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        onSelectedChange(new Set(order.slice(from, to + 1)));
        plainClickedRef.current = null;
        return true;
      }
    }
    if (e?.metaKey || e?.ctrlKey) {
      const anchor = plainClickedRef.current;
      plainClickedRef.current = null;
      onSelectedChange((prev) => {
        // Nothing multi-selected yet: start from the plain-clicked item.
        const next = new Set(prev.size === 0 && anchor !== null && anchor !== key && order.includes(anchor) ? [anchor] : prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      lastClickedRef.current = key;
      return true;
    }
    lastClickedRef.current = key;
    plainClickedRef.current = key;
    if (selected?.size > 0 && !selected.has(key)) onSelectedChange(new Set());
    return false;
  };
  handleClick.setAnchor = (key) => {
    lastClickedRef.current = key;
    plainClickedRef.current = key;
  };
  return handleClick;
}
