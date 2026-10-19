/**
 * Client request for the database-config-params endpoint. Sets a subset of
 * cubrid.conf parameters for a database (or the [common] section, when no
 * database is given) — only the keys that actually changed need be
 * present. The server fetches the current conf, merges these fields into
 * the right section, and writes the result back; the client never
 * constructs raw conf-file text itself.
 *
 * `params` is a plain dictionary rather than a fixed field list: which
 * keys exist, their type and guard come from the version-resolved schema
 * `getEnv` attaches to its response (`GetEnvClientResponse.paramSchemas`),
 * not from anything declared here. The server re-validates every key
 * against that same schema (re-resolved for this host, never the
 * client's copy) before writing anything — see `validateParams` in
 * `@api-interfaces/param-schema`.
 *
 * @category Requests
 * @since 1.0.0
 */
export type SetDatabaseConfigParamsClientRequest = {
  /** Target database name; omitted (or undefined) writes to the [common] section instead. */
  dbname?: string;
  params: Record<string, string | number>;
};
