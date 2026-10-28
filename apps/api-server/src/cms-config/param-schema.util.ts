import { resolveParamSchema } from '@api-interfaces/param-schema/resolve-param-schema';
import { DATABASE_PARAM_SCHEMA } from '@api-interfaces/param-schema/database-param-schema';
import { BROKER_PARAM_SCHEMA } from '@api-interfaces/param-schema/broker-param-schema';
import { CM_PARAM_SCHEMA } from '@api-interfaces/param-schema/cm-param-schema';
import { resolveEngineKnownKeys } from '@api-interfaces/param-schema/engine-catalog/resolve-engine-known-keys';
import { applyCatalogDefaults } from '@api-interfaces/param-schema/engine-catalog/catalog-defaults';
import { ResolvedParamSchemas } from '@api-interfaces';

/**
 * Resolves the master database/broker/cm.conf param schemas against one
 * host's actual engine version. The master tables are only ever imported
 * here (backend-only subpaths, not re-exported through `@api-interfaces`'s
 * main barrel) — the frontend receives just this function's output,
 * attached to `getEnv`'s response, and never holds its own copy of the
 * rule set.
 */
export function resolveHostParamSchemas(engineVersion: string): ResolvedParamSchemas {
  return {
    // Defaults/scope come from the engine catalog where it can show them.
    database: applyCatalogDefaults(resolveParamSchema(DATABASE_PARAM_SCHEMA, engineVersion), engineVersion),
    broker: resolveParamSchema(BROKER_PARAM_SCHEMA, engineVersion),
    cm: resolveParamSchema(CM_PARAM_SCHEMA, engineVersion),
    knownKeys: resolveEngineKnownKeys(engineVersion),
  };
}
