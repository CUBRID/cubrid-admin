/**
 * Client request for the broker-config-params endpoint. Sets a subset of
 * broker.conf parameters for one broker — only the keys that actually
 * changed need be present. The server fetches the current conf, merges
 * these fields into the broker's `[%name]` section, and writes the
 * result back; the client never constructs raw conf-file text itself.
 *
 * `params` is a plain dictionary rather than a fixed field list — see
 * `set-database-config-params-client-request.ts`'s header comment for why
 * (the schema, including which keys exist for this host, comes from
 * `getEnv`'s resolved `paramSchemas.broker`, not a hardcoded field list).
 *
 * @category Requests
 * @since 1.0.0
 */
export type SetBrokerConfigParamsClientRequest = {
  brokerName: string;
  params: Record<string, string | number>;
};
