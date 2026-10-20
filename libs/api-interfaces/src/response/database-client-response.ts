/**
 * Client-facing response for start info.
 * Strips CMS envelope fields from StartInfoCmsResponse.
 */
export type StartInfoClientResponse = {
  activelist: {
    active: {
      dbname: string;
    }[];
  };
  dblist: {
    dbs: {
      dbdir: string;
      dbname: string;
      isProfileExists: boolean;
    }[];
  };
  /**
   * Database names listed in cubrid_ha.conf's `[common]` ha_db_list — static
   * HA-membership config, unlike live heartbeat presence (which can read
   * "not HA" while the pair is genuinely down/mid-recovery). Used to gate
   * operations (Load/Rename/Restore/Delete Database) that would desync an
   * HA pair even though the client never sees a live heartbeat for it.
   */
  haDbNames: string[];
};
