# Create Database General Volume Limit Plan

## Goal

Prevent database creation requests whose general volume exceeds the CUBRID engine limit. The supported maximum is 20 GB (20,480 MB or 21,474,836,480 bytes); exactly 20 GB remains valid.

## Implementation

1. Add input-stage validation to the Create Database wizard.
   - Validate that the general volume is a positive finite number no greater than 20,480 MB.
   - Display an inline message for an invalid value.
   - Disable Next and Finish while the value is invalid.
   - Revalidate in the final submission handler.
   - Do not silently clamp an oversized value.
2. Keep user-facing text in the localization catalogs.
   - Add English keys for positive-size and maximum-size validation.
   - Add English failure guidance describing the 20 GB maximum.
   - Keep the same keys in the Korean catalog, using English fallback copy until translated by the Korean team.
3. Make the request unambiguous.
   - Keep `numpage` and `pagesize` as the authoritative CMS values.
   - Remove the redundant `db_volume_size` property that is currently discarded by the API validation whitelist.
   - Centralize the UI conversion from MB to pages.
4. Add API protection before CMS execution.
   - Validate `numpage` and `pagesize` as positive finite values.
   - Reject an effective general volume greater than 20 GB.
   - Run the same validation before job creation and again immediately before the CMS request.
5. Add focused automated tests.
   - Cover 20,479 MB, 20,480 MB, and 20,481 MB.
   - Cover zero, negative, empty/non-numeric, and invalid page values.
   - Verify oversized requests do not reach CMS.
   - Verify the localization keys and failure guidance are wired into the form.

## Expected behavior

The UI reports an invalid general volume immediately and prevents progression. A request that bypasses the UI is rejected by the API before CUBRID begins database creation. Existing valid database creation behavior remains unchanged.
