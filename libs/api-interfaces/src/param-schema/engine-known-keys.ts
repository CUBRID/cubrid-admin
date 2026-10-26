/**
 * Every conf key a host's engine build accepts, lowercased — what the
 * raw-text validation checks a key against before anything else, since
 * the engine refuses to load a file containing any key it doesn't know.
 * Section-scoped cubrid.conf keys appear as `section::key` (e.g.
 * `service::server` for `server=` under `[service]`).
 *
 * `strict` is true only when the host's major.minor.patch exactly matches
 * a catalogued engine version: then an unknown key is an error, matching
 * the engine. For any other host the lists are the union of the closest
 * catalogued versions, so a key outside them is only a warning — the host
 * may genuinely know keys the catalog doesn't.
 */
import { ParamGuard } from './param-guard';

export interface EngineKnownKeys {
  strict: boolean;
  /** Catalogued engine version the lists came from when `strict`, else null. */
  catalogVersion: string | null;
  database: string[];
  broker: string[];
  /**
   * A guard derived from the engine's own datatype and limits for every
   * cubrid.conf key (lowercased) — used for keys the hand-written schema
   * doesn't cover, so an empty or unparsable value for them is still
   * caught. Absent for obsoleted/untyped keys, which the engine skips.
   */
  databaseGuards: Record<string, ParamGuard>;
  /**
   * cubrid.conf keys (lowercased) the engine flags PRM_DEPRECATED — it
   * still loads them but prints a "deprecated" notice. Optional so older
   * cached getEnv payloads still type-check.
   */
  databaseDeprecated?: string[];
}
