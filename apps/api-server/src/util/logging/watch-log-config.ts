import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@config/config.service';
import { resolveCwmConfPath, readCwmConfSafe } from '@config/load-runtime-env';
import { reloadLogSettings } from './winston-logger';
import { LoggerService } from '@nestjs/common';
import { CMS_MAX_CONCURRENT_REQUESTS_PER_HOST } from '@config/cms-concurrency';
import { TOPSQL_MAX_LOG_LINES, TOPSQL_MAX_LOG_MB } from '@config/topsql-limits';

const LOG_KEYS = [
  'LOG_TO_FILE',
  'LOG_DIR',
  'LOG_LEVEL',
  'LOG_MAX_SIZE',
  'LOG_MAX_FILES',
  'LOG_APPEND_ON_RESTART',
] as const;

// Read from process.env on every use, so updating the env is all a change
// needs. Removing the key from cwm.conf goes back to the default.
const LIVE_KEYS = [CMS_MAX_CONCURRENT_REQUESTS_PER_HOST, TOPSQL_MAX_LOG_LINES, TOPSQL_MAX_LOG_MB] as const;

// Editors commonly save via a temp-file-then-rename sequence, which can fire
// several rapid 'change'/'rename' events for one actual edit — debounce so a
// single save only triggers one reload.
const DEBOUNCE_MS = 250;

// fs.watch's underlying OS notification (FSEvents on macOS, inotify on
// Linux) is not 100% reliable for rapid successive writes to the same file —
// closely-spaced edits can be coalesced into a single event, silently
// dropping intermediate changes (confirmed empirically: edits spaced a few
// seconds apart landed reliably, but a burst of edits within ~1-2s of each
// other sometimes only registered the first and last). This poll is a
// backstop, not the primary mechanism — it guarantees eventual consistency
// even if an fs.watch event gets dropped.
const POLL_INTERVAL_MS = 5000;

/**
 * Watches cwm.conf for edits and hot-reloads LOG_* settings into the
 * already-running logger — no process restart needed. Every other cwm.conf
 * key (PORT, LISTEN_HOST, etc.) is intentionally ignored here; those still
 * require a restart since they affect things constructed once at boot
 * (listening sockets, CORS setup, ...).
 *
 * Watches the *directory* rather than the file directly — some editors
 * replace the file on save (delete+recreate), which can silently drop a
 * watch registered on the file itself on certain platforms.
 */
export function startLogConfigWatcher(configService: ConfigService, logger: LoggerService): () => void {
  const confPath = resolveCwmConfPath();
  const confDir = path.dirname(confPath);
  const confFilename = path.basename(confPath);

  if (!fs.existsSync(confDir)) {
    return () => undefined; // Nothing to watch — e.g. no conf/ directory was ever created.
  }

  let debounceTimer: NodeJS.Timeout | null = null;
  let lastRaw: string | null = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf8') : null;
  // What cwm.conf had for each live key when last seen; a key set only in
  // the environment (not in cwm.conf) is left alone until cwm.conf sets it.
  const bootConf = fs.existsSync(confPath) ? readCwmConfSafe(confPath) : null;
  const liveValues: Record<string, string | undefined> = Object.fromEntries(
    LIVE_KEYS.map((key) => [key, bootConf && key in bootConf ? String(bootConf[key]) : undefined])
  );

  const applyChange = () => {
    if (!fs.existsSync(confPath)) {
      // No cwm.conf at all (e.g. local dev running off .env instead) is not
      // an error — the POLL_INTERVAL_MS backstop below calls this every 5s
      // regardless, so without this check it would warn forever.
      lastRaw = null;
      return;
    }

    const conf = readCwmConfSafe(confPath);
    if (conf === null) {
      logger.warn(`cwm.conf changed but could not be read/parsed — keeping current log settings (${confPath})`, 'LogConfigWatcher');
      return;
    }

    const raw = JSON.stringify(conf);
    if (raw === lastRaw) {
      return; // No actual content change (e.g. a touch with no edit).
    }
    lastRaw = raw;

    for (const key of LIVE_KEYS) {
      const next = key in conf ? String(conf[key]) : undefined;
      if (next === liveValues[key]) continue;
      liveValues[key] = next;
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
      logger.log(`cwm.conf changed — ${key} is now ${next ?? 'unset (default)'}`, 'LogConfigWatcher');
    }

    const relevantKeys = LOG_KEYS.filter((key) => key in conf);
    if (relevantKeys.length === 0) {
      return; // Edit didn't touch any LOG_* key — nothing for us to do.
    }

    for (const key of relevantKeys) {
      process.env[key] = conf[key];
    }

    configService.reloadLogSettingsFromEnv();
    const summary = reloadLogSettings();
    logger.log(`cwm.conf changed — log settings reloaded (${summary})`, 'LogConfigWatcher');
  };

  const watcher = fs.watch(confDir, (_eventType, filename) => {
    if (filename !== confFilename) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(applyChange, DEBOUNCE_MS);
  });

  // Backstop poll — see POLL_INTERVAL_MS comment above. applyChange() is
  // already idempotent (no-ops when content matches lastRaw), so calling it
  // redundantly alongside the event-driven path is harmless.
  const pollTimer = setInterval(applyChange, POLL_INTERVAL_MS);
  pollTimer.unref(); // Don't hold the process open just for this.

  logger.log(`Watching ${confPath} for setting changes (${[...LOG_KEYS, ...LIVE_KEYS].join('/')})`, 'LogConfigWatcher');

  return () => {
    watcher.close();
    clearInterval(pollTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
