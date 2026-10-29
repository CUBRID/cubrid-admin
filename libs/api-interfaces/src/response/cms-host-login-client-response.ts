/**
 * CMS host login payload (inner `data` after standard envelope).
 * When `isHA` is false, omit optional HA fields.
 */
export type HaClusterNodeClient = {
  hostname: string;
  ip: string;
  priority: string;
  /** CMS heartbeat node role, e.g. master | slave | replica */
  state: string;
};

export type CmsHostLoginClientResponse = (
  | {
      success: true;
      isHA: false;
    }
  | {
      success: true;
      isHA: true;
      /** Role of this host in the HA cluster (from heartbeatlist). */
      currentNodeType: string;
      /** Peers from heartbeatlist `hanodelist`, flattened. */
      haNodes: HaClusterNodeClient[];
    }
) & {
  /** Login only: the CMS account is still admin with the installed password admin. */
  usesDefaultPassword?: boolean;
};
