import { BaseCmsResponse } from '../models/cms-response/base-cms-response';
import { GetEnvCmsResponse } from '../models/cms-response/get-env-cms-response';
import { ResolvedParamSchemaEntry } from '../param-schema/param-schema-entry';
import { EngineKnownKeys } from '../param-schema/engine-known-keys';

/**
 * Database/broker conf-parameter rule tables, already resolved for this
 * host's actual engine version (CUBRIDVER on this same response) — the
 * table-form editors (DatabasePropertyModal, BrokerPropertyModal) render
 * their param list/defaults/guards from this instead of a hardcoded
 * schema, and never need the full version-aware master table the server
 * resolved it from. Delivered once per `getenv` call (cached alongside
 * the rest of this response per host) rather than a separate fetch per
 * modal open.
 */
export type ResolvedParamSchemas = {
  database: ResolvedParamSchemaEntry[];
  broker: ResolvedParamSchemaEntry[];
  /** cm.conf (CMS) keys — see cm-param-schema.ts. Optional for older cached payloads. */
  cm?: ResolvedParamSchemaEntry[];
  knownKeys: EngineKnownKeys;
};

/**
 * Client-facing response for environment information.
 * Strips CMS envelope fields from GetEnvCmsResponse.
 */
export type GetEnvClientResponse = Omit<GetEnvCmsResponse, keyof BaseCmsResponse> & {
  paramSchemas: ResolvedParamSchemas;
};
