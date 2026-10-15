# Top Tab Overflow Navigation Plan

## Feedback

When many top-level tabs are open, reduce the tab size or provide an overflow control (`...`) that lets users move through tabs page by page.

## Current Behavior

- Each tab originally had a minimum width of `120px` and a maximum width of `220px`.
- Long tab labels are visually truncated.
- The tab bar currently scrolls horizontally when its content overflows.
- The scrollbar is hidden, so additional tabs are difficult to discover.
- There are no visible tab navigation controls or overflow menu.

## Proposed Behavior

Use a hybrid solution that preserves readable tab sizes and makes overflow discoverable:

1. Keep tabs between `160px` and `260px` wide so labels remain readable.
2. Truncate long labels with an ellipsis while keeping the icon and close button visible.
3. Show the complete tab name in a tooltip when the label is actually truncated.
4. When tabs overflow, show previous, next, and overflow-menu controls on the right side of the tab bar.
5. Scroll approximately one visible page when the previous or next control is selected.
6. List all open tabs in the overflow menu, including active and unsaved states.
7. Selecting a tab from the overflow menu activates it and scrolls it into view.
8. Automatically scroll a newly activated tab into view.

Example:

```text
[ Tab 1 ][ Tab 2 ][ Long tab name... ]  [<] [>] [...]
```

## Interaction Details

- Disable the previous control when the tab bar is at its left edge.
- Disable the next control when the tab bar is at its right edge.
- Allow mouse-wheel, trackpad, touch, and programmatic horizontal scrolling while keeping the scrollbar visually hidden.
- Also support page-wise movement through the previous and next controls, or direct selection from the overflow menu.
- Recalculate overflow when tabs are opened, closed, renamed, or when the window/sidebar is resized.
- Keep the navigation controls fixed; they must not scroll with the tabs.
- The overflow menu must show full, untruncated tab names.
- Unsaved tabs must retain their dirty indicator in both the tab bar and overflow menu.

## Accessibility

- Navigation controls must be keyboard accessible and have localized `aria-label` values.
- The active tab must keep `aria-selected="true"`.
- The tooltip must be available on hover and keyboard focus.
- Tooltip content must not be the only way to identify a tab; the overflow menu also exposes the full name.
- Maintain visible focus styles for tabs and navigation controls.

## Implementation Outline

### `Breadcrumb.jsx`

- Add a ref for the scrollable tab container.
- Track whether the tab list overflows and whether either scroll direction is available.
- Use `ResizeObserver` and scroll events to update navigation state.
- Add previous, next, and overflow-menu controls.
- Scroll by approximately the tab container's visible width.
- Scroll the active tab into view after activation.

### `TabItem.jsx`

- Keep the existing width limits and label truncation.
- Detect whether the label is visually truncated.
- Show a tooltip containing the full label only when truncation occurs.
- Preserve the icon, dirty indicator, and close button at all widths.

### Localization

Add English and Korean labels for:

- Previous tabs
- Next tabs
- Show all open tabs
- Open tabs menu title, if required by the selected menu component

## Test Coverage

- No navigation controls when all tabs fit.
- Navigation controls appear when tabs overflow.
- Previous and next controls scroll by a visible page and update their disabled states.
- Selecting an off-screen tab scrolls it into view.
- Selecting a tab from the overflow menu activates it.
- Long labels are truncated and expose their full value through a tooltip.
- Short labels do not show an unnecessary tooltip.
- Closing all tabs or all other tabs always requires confirmation; confirmations include an additional warning when unsaved tabs are affected.
- Controls work with mouse and keyboard in English and Korean.

## Acceptance Criteria

- Users can discover and reach every open tab without relying on a hidden scrollbar.
- Long tab names never overlap icons, close buttons, or navigation controls.
- The active tab is always visible after selection.
- Full tab names remain accessible through the tooltip and overflow menu.
- Single-tab closing, context-menu, and keyboard-shortcut behavior continues to work; bulk tab closing always asks for confirmation.
