import type { StartInfoClientResponse } from '@api-interfaces';
import type { StartInfoCmsResponse } from '@type/cms-response';

type DbProfilesLike = Record<string, unknown> | null | undefined;

/**
 * Maps raw CMS start-info to client start-info shape.
 */
export function mapStartInfoToClientResponse(
  cmsStart: StartInfoCmsResponse,
  dbProfiles: DbProfilesLike,
  haDbNames: Iterable<string> = []
): StartInfoClientResponse {
  const profileMap = dbProfiles ?? {};
  const dbs = cmsStart.dblist?.[0]?.dbs ?? [];
  const active = cmsStart.activelist?.[0]?.active ?? [];

  return {
    activelist: { active },
    dblist: {
      dbs: dbs.map((db) => ({
        ...db,
        isProfileExists: !!profileMap[db.dbname],
      })),
    },
    haDbNames: [...haDbNames],
  };
}
