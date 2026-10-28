import type { StartInfoClientResponse } from '@api-interfaces';
import type { StartInfoCmsResponse } from '@type/cms-response';

type DbProfilesLike = Record<string, unknown> | null | undefined;

/**
 * Maps raw CMS start-info to client start-info shape. `isLoggedIn` is set on
 * every dblist and activelist entry (an active database can be missing from
 * dblist, e.g. on an HA replica — the client merges those in from the
 * active list), so the client can mirror the server's real DB-login state.
 */
export function mapStartInfoToClientResponse(
  cmsStart: StartInfoCmsResponse,
  dbProfiles: DbProfilesLike,
  haDbNames: Iterable<string> = [],
  isLoggedIn: (dbname: string) => boolean = () => false
): StartInfoClientResponse {
  const profileMap = dbProfiles ?? {};
  const dbs = cmsStart.dblist?.[0]?.dbs ?? [];
  const active = cmsStart.activelist?.[0]?.active ?? [];

  return {
    activelist: { active: active.map((a) => ({ ...a, isLoggedIn: isLoggedIn(a.dbname) })) },
    dblist: {
      dbs: dbs.map((db) => ({
        ...db,
        isProfileExists: !!profileMap[db.dbname],
        isLoggedIn: isLoggedIn(db.dbname),
      })),
    },
    haDbNames: [...haDbNames],
  };
}
