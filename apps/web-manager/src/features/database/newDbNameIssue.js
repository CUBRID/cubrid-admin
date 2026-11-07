import { checkDbNameFree, checkNewDbName } from '@api-interfaces';

/**
 * The names in a host's database list (CMS's dblist plus the replica and
 * active-only databases the list adds), without `except`: the database being
 * copied or renamed, which its own dialog handles.
 */
export const takenDbNames = (dbs, except) => (dbs || []).map((db) => db?.dbname).filter((name) => name && name !== except);

/** A new database name's rule (checkNewDbName), then whether the host already has it. */
export const newDbNameIssue = (name, taken) => checkNewDbName(name) ?? checkDbNameFree(name, taken);
