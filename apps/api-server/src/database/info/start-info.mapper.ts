import type { StartInfoClientResponse } from '@api-interfaces';
import type { DBInfo } from '@type/db-info';
import type { StartInfoCmsResponse } from '@type/cms-response';

type DbProfilesLike = Record<string, Partial<DBInfo> | null | undefined> | null | undefined;

/**
 * Maps raw CMS start-info to client start-info shape. The login fields are
 * set on every dblist and activelist entry (an active database can be
 * missing from dblist, e.g. on an HA replica — the client merges those in
 * from the active list), so the client can mirror the server's real
 * DB-login state.
 */
export function mapStartInfoToClientResponse(
  cmsStart: StartInfoCmsResponse,
  dbProfiles: DbProfilesLike,
  haDbNames: Iterable<string> = [],
  isLoggedIn: (dbname: string) => boolean = () => false,
  unlistedDbs: { dbname: string; dbdir: string }[] = []
): StartInfoClientResponse {
  const profileMap = dbProfiles ?? {};
  const dbs = cmsStart.dblist?.[0]?.dbs ?? [];
  const active = cmsStart.activelist?.[0]?.active ?? [];
  const loginFields = (dbname: string) => ({
    isProfileExists: !!profileMap[dbname],
    isLoggedIn: isLoggedIn(dbname),
    isLoggedOut: !!profileMap[dbname]?.loggedOut,
  });

  return {
    activelist: { active: active.map((a) => ({ ...a, ...loginFields(a.dbname) })) },
    dblist: {
      dbs: [
        ...dbs.map((db) => ({ ...db, ...loginFields(db.dbname) })),
        ...unlistedDbs.map((db) => ({ ...db, ...loginFields(db.dbname), cmsListed: false as const })),
      ],
    },
    haDbNames: [...haDbNames],
  };
}
