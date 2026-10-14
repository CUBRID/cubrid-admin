# UI and Flow Consistency

## 1. Password Recovery

Remove the password recovery feature because no supported recovery service is available. Remove the “Forgot password” link, recovery screen, route, and related user-facing text so users are not directed into a non-functional flow.

## 2. Saved Database Credentials

Database credentials may currently be remembered before authentication succeeds. Authentication must complete first, and credentials should only be saved afterward when “Remember password” is enabled. A failed login must never replace a valid saved profile.

## 3. Tab Reload

The Reload command currently closes the context menu without refreshing anything. It must refresh only the selected tab and display the standard refreshing state.

## 4. Close All and Close Others

Clean tabs may close before the user confirms closing tabs with unsaved changes. The application must confirm all affected unsaved work before closing any tab. Cancelling must leave every tab unchanged.

## 5. CMS User Deletion

CMS user deletion currently uses browser-native alert and confirmation dialogs and does not provide consistent progress or completion feedback. It should use the standard application confirmation, prevent duplicate submission, wait for completion, and show a clear success or failure result.

## 6. Success-State Behavior

Some success dialogs show an OK button but disappear automatically after approximately one second. Equivalent operations must follow one consistent policy: remain open for acknowledgement, use a timed notification, or transition automatically without presenting an unusable confirmation button.

## 7. Dialog Consistency

Dialogs currently differ in header design, title size, width, footer layout, close behavior, animation, and overlay layering. All active dialogs should use one standard structure with predictable focus, Escape behavior, accessible naming, loading restrictions, and consistent confirmation, success, and error states.

## 8. Button Consistency

Similar actions use different heights, padding, font sizes, widths, and visual styles. Standard sizes and variants should be defined for primary, secondary, cancel, danger, loading, disabled, and icon-only buttons. Equivalent actions should have equal visual weight.

## 9. Typography

The interface uses many closely spaced font sizes, including extremely small functional text. A semantic typography scale should define page titles, section titles, dialog titles, body text, table text, form labels, helper text, captions, and technical data. Dialog titles must remain visually stronger than their content.

## 10. Form Controls

Inputs, selects, text areas, search fields, multi-selects, date/time controls, and upload controls do not consistently align. They should share standard heights, text sizes, padding, borders, focus styles, disabled states, validation states, labels, descriptions, and compact-density behavior.

## 11. Tables

Several screens implement tables independently, producing different headers, spacing, sorting, selection, empty states, and loading behavior. A shared table standard should support explicit sortable columns, keyboard selection, editable cells, sticky headers, compact density, technical-data formatting, and responsive overflow.

## 12. Authentication Experience

Login and registration should use a related visual structure and interaction pattern. Registration should clearly confirm successful account creation, and terms or policy links must lead to valid destinations.

## 13. Operation Feedback

The application uses several competing approaches for loading, success, errors, retries, confirmations, and background jobs. Equivalent workflows should follow a common sequence: form, confirmation when required, loading, success or error, then retry, close, or background transition.

## 14. Keyboard Accessibility

Default focus outlines are removed, and some custom controls do not provide a replacement. Focus must always remain visible, and primary workflows must work through the keyboard, including dialogs, tabs, menus, trees, tables, and custom selects.

## 15. Screen-Reader Accessibility

Some visual labels are not associated with their controls, dialogs do not always expose their titles, and custom selection controls lack standard roles and states. Controls must expose names, descriptions, errors, required states, selections, loading states, and asynchronous results correctly.
