# Database Maintenance Result Details Proposal

## Feedback

> 최적화나 데이터베이스 검사나 무엇을 처리하였는지에 대한 정보가 출력되지 않음. (무엇을 검사하였는지, 통계정보는 full scan인지에 관하여)

Translation: Optimization and database inspection do not display what was processed, including what was checked and whether statistics were collected using a full scan.

## Current behavior

- `OptimizeDatabaseModal.jsx` waits for the job but does not retain its result. Its success dialog shows only the selected table or database name.
- `CheckDatabaseModal.jsx` also discards the returned job and shows a generic completion message.
- `CmsJobService.mapJobResult()` maps optimization and inspection results to `{ success: true }`.
- The background result dialog shows a generic status and database name. `CmsJobContext.notifyTerminal()` does not forward the job result or timestamps to that dialog.
- Optimization accepts an optional `classname`; inspection accepts `repairdb`. The optimization request has no scan-method parameter.

## Proposed behavior

Show an operation summary before execution and processing details after completion. Use the same details for foreground and background jobs, including jobs restored after a browser reload.

| Detail | Optimization | Database inspection |
| --- | --- | --- |
| Database | Target database | Target database |
| Operation | Query optimizer statistics update | Database consistency check |
| Scope | All classes or selected class name | Entire database, based on the current request |
| Options | Statistics collection method, when verified | Check only or check with repair enabled |
| Inspection details | Not applicable | Verified check categories, if available |
| Timing | Start, finish, and execution duration | Start, finish, and execution duration |
| Result | Command completion status | Command completion status and reported findings |
| Output | Utility output, when available | Utility output, when available |

Keep requested scope and options distinct from confirmed findings. Do not turn a requested repair into a claim that repairs occurred, or a successful command into an unreported count of checked objects or inconsistencies.

### Optimization example

```text
Statistics update completed

Database: demodb
Operation: Query optimizer statistics update
Scope: All classes
Statistics collection: Not reported by server
Duration: 6 seconds
Result: Command completed successfully
```

When a single class is selected, display its qualified name instead of “All classes”. Make the description clear that optimization updates statistics; it does not imply index rebuilding or storage compaction.

### Database inspection example

```text
Database inspection completed

Database: demodb
Operation: Database consistency check
Scope: Entire database
Repair mode: Check only
Duration: 18 seconds
Result: Command completed successfully
Detailed findings: Not returned by server
```

When repair is enabled, display “Check with repair enabled”. Show actual repair counts or “No inconsistencies found” only when supported by utility output. Any list of checks performed must be verified against the deployed CMS/engine behavior or returned output.

## Full scan versus sampling

The current request and response do not establish whether statistics collection uses a full scan or sampling. “All classes” describes target scope; it does not establish the scan method.

CUBRID documents `optimizedb` as updating optimizer statistics for a selected class or all classes. The documented utility options do not establish an explicit full-scan selection. The separate SQL `UPDATE STATISTICS` command supports `WITH FULLSCAN`; without that clause, the documented SQL behavior uses sampling.

For the initial change, display “Not reported by server” unless the deployed CMS/engine implementation provides a verified method. “CUBRID optimizedb default” can identify the execution mechanism, but by itself does not answer the full-scan question.

If explicit sampling/full-scan selection is required, investigate supported CMS capabilities and an SQL execution path before adding the control. Confirm engine-version support, database state requirements, permissions, and how the executed method can be recorded. This is a separate feature from reporting the existing operation.

References:

- [CUBRID utility documentation: optimizedb and checkdb](https://www.cubrid.org/manual/en/latest/admin/admin_utils.html)
- [CUBRID UPDATE STATISTICS documentation](https://www.cubrid.org/manual/en/10.1/sql/tuning.html)

Documentation is guidance; validate behavior against the deployed CUBRID version before assigning a scan method or a detailed checklist.

## Implementation approach

1. Define typed maintenance summaries in the shared API interfaces. Include operation, scope, selected class when applicable, repair option, and scan method with an explicit unknown state.
2. Build summaries from the persisted job request and verified execution behavior. Expose only allowlisted options; never return the complete request payload, credentials, or CMS tokens.
3. Preserve supported utility output and findings in `mapJobResult()` instead of reducing everything to `{ success: true }`. Capture representative CMS responses first to establish what output is actually available. If CMS returns no detail, keep that limitation visible.
4. Retain the completed job in the foreground optimization and inspection dialogs. Use its recorded database, options, and timestamps to render the summary.
5. Forward the summary, result, and timestamps through `CmsJobContext` to `JobResultModal`. Reuse a maintenance-details component for consistent foreground and background rendering.
6. Calculate execution duration from `startedAt` and `finishedAt`, excluding queue time. Handle absent timestamps and older jobs without summaries gracefully.
7. Add English labels through the existing localization keys, including clear unknown-output and unknown-scan-method wording. Missing Korean translations fall back to English; Korean staff will add translations later in `cmLabels.ko.js`. Allow users to copy available utility output.

Suggested summary shapes:

```ts
type MaintenanceSummary =
  | {
      operation: 'statistics-update';
      scope: 'all-classes' | 'selected-class';
      className?: string;
      scanMethod: 'unknown' | 'sampling' | 'fullscan';
    }
  | {
      operation: 'consistency-check';
      scope: 'entire-database';
      repairRequested: boolean;
    };
```

The existing job response already carries database, host, status, and timestamps. Keep those fields authoritative rather than duplicating them in the summary. Add structured findings only after the response format and semantics are verified.

## Acceptance criteria

- Before running, users can see the target scope and requested options.
- Completed optimization identifies the database, selected class or all-class scope, and the known statistics method or explicit unknown state.
- Completed inspection identifies the database, scope, repair option, and available findings.
- Foreground and background completion show equivalent details, including after reload when the persisted job is available.
- Failed jobs retain useful operation context and available diagnostics.
- No unverified full-scan label, checked-object count, repair count, or clean-database claim is displayed.
- Credentials and CMS tokens never appear in summaries or output exposed by this change.
- Older jobs and empty CMS responses produce understandable results without errors.

## Validation

Use representative CMS responses to verify preservation of available output and the empty-output fallback. Check selected-class and all-class optimization, inspection with repair off/on, failed operations, foreground completion, background completion, and restored jobs. Verify English wording, English fallback for untranslated Korean keys, and execution duration against recorded timestamps.

## Implementation status

Implemented on branch `RND-2874_5/optimizedb`:

- The API derives an allowlisted `maintenanceSummary` from the persisted job request, including older job records. Optimization scan method remains explicitly unknown.
- Maintenance results retain text from `log`, `line`, and meaningful `note` fields when present. Arbitrary CMS objects and envelope fields are excluded, and known request secrets and credential assignments are redacted from the retained text.
- Optimization and inspection dialogs show a preview and preserve completed-job details for success and failure.
- Background notifications and jobs-panel details share the same localized component. Restored jobs can be opened from the panel.
- New maintenance labels are authored only in English. The Korean locale uses English fallback for missing keys, allowing Korean staff to add translations later without changing components.
- Details include execution timing, scope, repair option when applicable, explicit missing-output wording, and copyable utility output.
- No new maintenance operation or full-scan selection was added.

CMS API reference samples for [optimizedb](https://github.com/CUBRID/cubrid-manager-server/blob/develop/docs/api/optimizedb.md) and [checkdb](https://github.com/CUBRID/cubrid-manager-server/blob/develop/docs/api/checkdb.md) return status and a note rather than a structured checklist or statistics method. There is no verified detailed checklist or scan method to report from those samples. Optional utility text is supported when available, but a live deployment was not used for validation.

Validation: all 88 web unit tests and 7 maintenance API unit tests pass. Coverage includes all-class/selected-class optimization, repair off/on, foreground failure diagnostics, background notifications, restored-job details, missing metadata, duration calculation, locale fallback, output copying, and output filtering/redaction. Browser layout checks covered English optimization, inspection, and a narrow failure dialog with long output before Korean maintenance translations were removed. The API TypeScript check and web production build pass. Lint encounters existing Fast Refresh export errors in `CmsJobContext.jsx`, existing literal-string warnings, and the existing circular dependency between `api-server` and `api-interfaces`; the new UI details component and utilities pass lint.
