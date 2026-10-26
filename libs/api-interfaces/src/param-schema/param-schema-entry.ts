import { ParamGuard } from './param-guard';

/**
 * One parameter's full UI + validation metadata: which conf key it is,
 * which editor section it belongs to, what values it accepts, and — for
 * the four cubrid.conf buffer keys that are really one pages/size choice
 * each — how it pairs with its counterpart. `category` is a pure UI
 * grouping label (matches each modal's existing tab/section names); it
 * carries no version semantics of its own.
 */
export interface ParamSchemaEntry {
  key: string;
  category: 'general' | 'advanced' | 'buffer' | 'common' | 'advance';
  guard: ParamGuard;
  /** Shown as the input's placeholder when the key is absent from conf. */
  default?: string;
  /** Database `advanced` entries only — which process(es) this PRM affects (system_parameter.c's PRM_FOR_SERVER/PRM_FOR_CLIENT flags). Purely informational (CA's own "Parameter Type" column); no bearing on validation. */
  scope?: 'SERVER' | 'CLIENT' | 'BOTH';
  /**
   * Only present for the pages/size buffer pairs (data/sort/log/
   * indexScanOid): `pairKey` links the two entries that represent the
   * same underlying value, `role` says which side of the pair this entry
   * is. Rendering reconciles them into one radio-choice group instead of
   * two independent rows (see DatabasePropertyModal's BufferChoiceGroup).
   */
  bufferGroup?: { pairKey: string; role: 'pages' | 'size' };
  /**
   * Non-blocking: this param's value is still saved, but has no real
   * engine effect while `dependsOnKey`'s current value is one of
   * `inactiveWhen`. Unlike `guard`, this never fails validation or blocks
   * Apply — it's purely an inline hint. Only added per-entry after
   * confirming the relationship against actual engine source (e.g.
   * ha_port_id is read exclusively by master_heartbeat.c, which only runs
   * once HA is actually configured) — not a general "maybe related"
   * guess.
   */
  advisory?: { dependsOnKey: string; inactiveWhen: string[] };
  /**
   * `true` means this key must only ever be written to the shared section
   * — [common] for database entries, [broker] for broker entries — never
   * a per-instance [@dbname]/[%brokerName] section. Enforced server-side
   * (a write attempt against the wrong section is rejected, not just
   * hinted at in the UI). For database entries this is source-confirmed
   * against actual engine behavior (e.g. ha_node_list/ha_port_id/
   * cubrid_port_id/auto_restart_server are each read by a host-wide
   * singleton process — master_heartbeat.c or cub_master itself — before
   * or outside any per-database context; see each entry's own comment in
   * database-param-schema.ts). For broker entries, it's the 5 keys
   * broker_config.c reads via the literal `SECTION_NAME` ("broker"),
   * never a per-broker `[%name]` section at all (ACCESS_CONTROL*,
   * MASTER_SHM_ID, ADMIN_LOG_FILE).
   */
  commonOnly?: boolean;
  /**
   * `true` means this key must only ever be written to a per-instance
   * section ([@dbname] / [%brokerName]) — never the shared [common]/
   * [broker] section. Enforced server-side like `commonOnly`, just the
   * opposite direction. Reserved for keys the engine itself enforces must
   * be unique per instance (e.g. broker.conf's BROKER_PORT/
   * APPL_SERVER_SHM_ID — broker_config.c rejects two brokers, or a broker
   * and MASTER_SHM_ID, sharing the same value) — writing such a key to
   * the shared section would be meaningless (every instance would then
   * collide on the same value) or simply never read there at all, since
   * broker.conf's `[broker]` section has no inheritance into `[%name]`
   * sections at the engine level (ini_parser.c does exact
   * "section:key" lookups only, no fallback).
   */
  instanceOnly?: boolean;
  /**
   * `true` means this key has NO safe engine fallback — leaving it absent
   * from the conf file doesn't just mean "use a sane default," it makes
   * config load (or database boot) actively fail. Different axis from
   * `commonOnly`/`instanceOnly` (which section it belongs in) and from
   * `default` (a UI placeholder, which for most keys IS the real value
   * the engine substitutes when absent — but for a `required` key there
   * is no such literal, `default` is just whatever placeholder text makes
   * sense to show, not a value that would actually work if used as-is).
   * Source-confirmed per entry, not inferred from an empty-looking
   * `default: ''` (blank is itself a legitimate, safe value for plenty of
   * keys, e.g. "no access list configured"). For broker entries: the
   * three keys (`MASTER_SHM_ID`, `BROKER_PORT`, `APPL_SERVER_SHM_ID`) read
   * via `ini_gethex`/`ini_getint` with a literal fallback of `0`,
   * immediately followed by an `if (value == 0) { ...; goto conf_error; }`
   * that fails the ENTIRE broker.conf load (broker_config.c) — not merely
   * leaving that one key unsafe.
   */
  required?: boolean;
  /**
   * A hard constraint between this key's value and another key's, enforced
   * everywhere `validateCrossFieldParams` is called (table UI inline
   * errors, raw-editor section checks, and the typed save endpoints after
   * merge) — unlike `advisory`, violating this is a real engine failure,
   * not just an inert setting. Source-confirmed per entry (e.g.
   * broker.conf's MAX_NUM_APPL_SERVER < MIN_NUM_APPL_SERVER hard-fails the
   * whole config load with `PARAM_BAD_MAX_APPL_SERVER`,
   * broker_config.c:716-719) — not a general "these look related" guess.
   * The error is attached to THIS key (the one with the constraint), not
   * `comparedToKey`.
   */
  crossField?: { comparedToKey: string; rule: 'gte' | 'lte' };
}

/**
 * Master schema entry: adds the version range this rule applies to.
 * `minVersion`/`maxVersion` are inclusive major.minor engine versions
 * (e.g. "11.1"); omitted means "since the oldest tracked branch" /
 * "still current on develop" respectively. Most entries omit both —
 * they were only kept in the master list after confirming the rule is
 * identical across all 6 currently-supported branches.
 */
export interface VersionedParamSchemaEntry extends ParamSchemaEntry {
  minVersion?: string;
  maxVersion?: string;
}

/** What a connected host actually receives: already resolved for its engine version, so no version fields leak to the client. */
export type ResolvedParamSchemaEntry = ParamSchemaEntry;
