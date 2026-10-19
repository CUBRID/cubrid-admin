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
