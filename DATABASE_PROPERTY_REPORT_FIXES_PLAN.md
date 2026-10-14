# Database Property Testing Report Fixes

## Goal

Make the database property dialog report only user-made changes and make its settings easier to inspect on the available screen.

## Implementation plan

1. Preserve the configuration loaded from `cubrid.conf` as an immutable baseline while keeping a separate editable draft.
2. Derive changed keys by comparing the effective draft configuration with that baseline, including added, removed, and buffer-mode/unit changes.
3. Use the derived changes for the badge, row indicators, Reset visibility, and Apply availability.
4. Make Reset restore the loaded configuration and buffer selections, and ensure reopening or switching database context clears stale state.
5. Enlarge the dialog responsively and replace its fixed content height with a viewport-aware layout so the settings area receives more usable space without clipping controls on smaller screens.
6. Add focused tests for change detection and extend the database-property end-to-end scenario with stable UI assertions.
7. Run the relevant unit tests, lint, and web-manager build.

## Acceptance criteria

- No modified count or modified-row indicators appear immediately after configuration loads.
- Changing one value displays `1 MODIFIED`; restoring the original value clears the indicator.
- Changing a buffer mode or unit is recognized as a change.
- Reset restores all values and buffer selections loaded when the dialog opened.
- Apply cannot be triggered when there are no server-parameter changes.
- The dialog grows up to the available viewport while retaining accessible header, content scrolling, and footer actions at smaller resolutions.
