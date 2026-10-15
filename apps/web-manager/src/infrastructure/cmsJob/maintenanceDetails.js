export function isMaintenanceJob(job) {
  return job?.type === 'optimize' || job?.type === 'check';
}

export function getMaintenanceRows(job, CM, preview = false) {
  const summary = job.maintenanceSummary;
  const optimize = job.type === 'optimize';
  const scope = {
    'all-classes': CM.maintenanceAllClasses,
    'selected-class': CM.maintenanceSelectedClass,
    'entire-database': CM.maintenanceEntireDatabase,
  }[summary?.scope] || CM.maintenanceNotReported;
  const rows = [
    [CM.databaseName, job.dbname || '—'],
    [CM.maintenanceOperation, optimize ? CM.maintenanceStatisticsUpdate : CM.maintenanceConsistencyCheck],
    [CM.maintenanceScope, summary?.className ? `${scope}: ${summary.className}` : scope],
  ];
  if (optimize) {
    rows.push([CM.maintenanceScanMethod, {
      sampling: CM.maintenanceSampling,
      fullscan: CM.maintenanceFullscan,
    }[summary?.scanMethod] || CM.maintenanceScanUnknown]);
  } else {
    const repair = summary?.repairRequested;
    rows.push([CM.maintenanceRepairMode, typeof repair === 'boolean'
      ? (repair ? CM.maintenanceRepairEnabled : CM.maintenanceCheckOnly)
      : CM.maintenanceNotReported]);
  }
  if (!preview) {
    for (const [label, iso] of [[CM.started, job.startedAt], [CM.finished, job.finishedAt]]) {
      const date = new Date(iso);
      rows.push([label, iso && Number.isFinite(date.getTime()) ? date.toLocaleString() : '—']);
    }
    const elapsed = Date.parse(job.finishedAt) - Date.parse(job.startedAt);
    rows.push([CM.maintenanceDuration, Number.isFinite(elapsed) && elapsed >= 0
      ? CM.maintenanceDurationSeconds((elapsed / 1000).toFixed(1)) : '—']);
    const status = job.jobStatus ?? job.status;
    if (status === 'succeeded' || status === 'failed') {
      rows.push([CM.result, status === 'succeeded' ? CM.maintenanceCommandSucceeded : CM.maintenanceCommandFailed]);
      if (!job.result?.output) {
        rows.push([optimize ? CM.maintenanceOutput : CM.maintenanceFindings, CM.maintenanceNotReported]);
      }
    }
  }
  return rows;
}
