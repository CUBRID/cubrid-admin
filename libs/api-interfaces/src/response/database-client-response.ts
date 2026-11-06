/**
 * Client-facing response for start info.
 * Strips CMS envelope fields from StartInfoCmsResponse.
 */
export type StartInfoClientResponse = {
  activelist: {
    active: {
      dbname: string;
      /** See dblist's fields of the same names. */
      isProfileExists: boolean;
      isLoggedIn: boolean;
      isLoggedOut: boolean;
    }[];
  };
  dblist: {
    dbs: {
      dbdir: string;
      dbname: string;
      isProfileExists: boolean;
      /**
       * Whether the server currently holds a live DB login (dbmtuserlogin)
       * for this database — same test as ensureDbLogin's cache hit.
       */
      isLoggedIn: boolean;
      /** The user logged out of it (its saved login is kept but not used). */
      isLoggedOut: boolean;
      /**
       * false for a database of this HA node that CMS's own list leaves out
       * (an HA replica: databases.txt names the master/slave hosts, see
       * DatabaseInfoService.startInfo); absent otherwise.
       */
      cmsListed?: false;
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
