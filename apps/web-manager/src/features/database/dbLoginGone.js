// Actions after which a database's dbmt login is gone: explicit logout,
// forgetting its saved credentials, a MISSING_DB_CREDENTIALS reply
// (clearDatabaseLogin), or the db leaving loggedInDatabases any other way,
// e.g. a start-info sync (databaseLoginLost). Slices holding per-db data
// fetched under that login drop it on these. Matched by type string, so
// those slices need not import databaseCoreSlice.
const LOGIN_GONE_TYPES = new Set([
  'database/logoutDatabase/fulfilled',
  'database/deleteDatabaseProfile/fulfilled',
  'databaseCore/clearDatabaseLogin',
  'database/loginLost',
]);

export const isDbLoginGone = (action) => LOGIN_GONE_TYPES.has(action.type);

// { hostUid, dbname } — a thunk's own argument, or a plain action's payload.
export const dbOfLoginGone = (action) => action.meta?.arg ?? action.payload ?? {};
