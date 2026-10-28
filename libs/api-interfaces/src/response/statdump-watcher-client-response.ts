/**
 * Client-facing response for starting/stopping the CMS statdump watcher
 * (`start_statdump` / `stop_statdump`).
 *
 * The engine only accumulates statdump counters while a watcher is attached,
 * so the dashboard keeps one running while it is open.
 */
export type StatdumpWatcherClientResponse = {
  /** Whether a watcher is running for the database after this call. */
  running: boolean;
  /** start: CMS already had one running for this database ("already running"). */
  alreadyRunning?: boolean;
  /** stop: CMS had none running ("no statdump running"). */
  wasRunning?: boolean;
};
