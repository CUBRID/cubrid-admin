# Live CMS Maintenance Test Results

Test date: October 15, 2026 (Asia/Phnom_Penh).

## Target and scope

- Docker container: `cubrid-nca`.
- CMS endpoint: `https://localhost:8001/cm_api`.
- CUBRID engine: 11.4.5.
- Database: `demodb`, containing the bundled Olympic demo dataset.
- The database was stopped before testing and remained stopped afterward.
- Used the existing saved CMS connection. Credentials and tokens are excluded from this report.
- Executed optimization and check-only inspection; no repair or additional data insertion was performed.

## Direct CMS tests

All three operations completed successfully. The responses were immediate terminal responses, so these new tests required no asynchronous polling.

| Operation | Request options | CMS execution time | Result |
| --- | --- | --- | --- |
| Optimize one class | `classname: "public.athlete"` | 379 ms | Success |
| Optimize all classes | `classname` omitted | 428 ms | Success |
| Inspect entire database | `repairdb: "n"` | 438 ms | Success |

### Selected-class optimization

Request, excluding authentication:

```json
{
  "task": "optimizedb",
  "dbname": "demodb",
  "classname": "public.athlete"
}
```

Final CMS response:

```json
{
  "__EXEC_TIME": "379 ms",
  "note": "none",
  "status": "success",
  "task": "optimizedb"
}
```

### All-class optimization

Request, excluding authentication:

```json
{
  "task": "optimizedb",
  "dbname": "demodb"
}
```

Final CMS response:

```json
{
  "__EXEC_TIME": "428 ms",
  "note": "none",
  "status": "success",
  "task": "optimizedb"
}
```

### Database inspection

Request, excluding authentication:

```json
{
  "task": "checkdb",
  "dbname": "demodb",
  "repairdb": "n"
}
```

Final CMS response:

```json
{
  "__EXEC_TIME": "438 ms",
  "note": "none",
  "status": "success",
  "task": "checkdb"
}
```

None of these responses provides the scan method, a checklist of checks performed, findings, checked-object counts, utility text, or an echoed class scope. `note: "none"` does not provide any detailed findings.

## Comparison with the screenshot's API job before rebuilding

The persisted job matching the screenshot is `9b137e7f-d465-48d6-b586-dd06ca197b58`. Its request payload is `{}`, which identifies all-class optimization. Its stored result is `{ "success": true }`.

The existing API log captures its final CMS response after `gettaskstatus` polling:

```json
{
  "__EXEC_TIME": "503 ms",
  "job-status": "success",
  "note": "none",
  "status": "success",
  "task": "optimizedb",
  "uuid": "4312"
}
```

This confirms that the screenshot's actual CMS operation also returned no scan method or utility output. Its three-second Web Manager execution duration includes orchestration and polling; it is not the same measurement as CMS's execution-time field.

Before rebuilding, the running local API on port 8085 executed an older `dist/apps/api-server/main.js` job-result mapper and status serializer, without `maintenanceSummary`. The branch source includes that field and derives all-class/selected-class scope from the persisted request.

This initial API comparison used the existing job record, its CMS trace, and the deployed serializer. It preceded the backend rebuild and the user's restart.

## Live API verification after rebuild and restart

Verdict: **PASS within the agreed scope**.

Submitted real jobs through the restarted Web Manager API at `https://localhost:8085/api`, backed by Docker's local CMS. Used the configured existing test account and a temporary Docker host connection. The temporary connection was removed afterward; completed job records were retained. The database remained stopped.

| Test | Job ID | Verified summary | Result |
| --- | --- | --- | --- |
| Optimize selected class | `4dd7952c-2eec-4462-a28a-1116484ba04f` | `scope: "selected-class"`, `className: "public.athlete"`, `scanMethod: "unknown"` | PASS |
| Optimize all classes | `44fa1a35-4a22-4f65-8309-61b6355567b5` | `scope: "all-classes"`, `scanMethod: "unknown"` | PASS |
| Inspect database, check only | `ce4be006-8984-469a-875e-5bda6e884c14` | `scope: "entire-database"`, `repairRequested: false` | PASS |

For each operation, verified HTTP 202 submission, a terminal `succeeded` job, the expected database/type/summary, `result.success: true`, valid execution timestamps, and absence of fabricated utility output. Then fetched `/jobs/recent` and verified the same summary was present for the completed job. All three history checks passed.

These are live HTTP API tests. A human browser was not operated for this verification. Rendering and foreground/background propagation have separate automated component coverage.

The diagnostic CMS sign-in refreshed the admin session token. A final read-only probe using the original saved connection token returned “invalid token; please reconnect.” Reconnecting the original CMS host in Web Manager is required after this test. The saved host and database data were preserved.

The test harness initially encountered an error while formatting an absent error field; the harness was corrected and all three cases were rerun successfully. That harness error was not an API or CMS failure.

## Attribution and acceptance

| Missing information | Attribution | Acceptance |
| --- | --- | --- |
| Full scan versus sampling reported by CMS | CMS responses omit it | An explicit unknown state is acceptable under the agreed CMS-out-of-scope boundary |
| Utility output or detailed findings | CMS responses omit them | An explicit missing-output state is acceptable |
| Requested all-class or selected-class scope | Known from Web Manager's request | Must be displayed; absence is not a CMS limitation |
| Requested repair mode | Known from Web Manager's request | Must be displayed; absence is not a CMS limitation |

The missing scope in the screenshot came from the older deployed API build. After rebuilding and restarting, the live API tests confirm `maintenanceSummary` is present in job-status responses and recent-job history. The previously missing requested scope is resolved at the backend API layer.

Actual CMS findings and scan-method reporting remain outside this change when CMS does not supply them. These tests do not establish full-scan execution, exact internal check coverage, or repaired-object counts.
