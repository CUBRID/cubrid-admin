import { StartInfoClientResponse } from '@api-interfaces';
import { GetCreatedbInfoClientResponse } from '@api-interfaces/response/get-createdb-info-client-response';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleCmsErrors } from '@common';
import { FailureDetails, failureDetails } from '@error/index';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { BaseCmsRequest, BaseCmsResponse } from '@type';
import { StartInfoCmsResponse } from '@type/cms-response';
import { CMS_CONFNAME_CUBRID, CMS_CONFNAME_DATABASES, CMS_CONFNAME_HACONF } from '@database/database.constants';
import { isHostHaModeOnFromCubridConf, parseDatabasesTxt, parseHaDbListDbNamesFromHaConf, readHaDbNames, shareInFlight } from '@util';
import { mapStartInfoToClientResponse } from './start-info.mapper';
import { DatabaseUserService } from '../user/database-user.service';

/**
 * Service for database information (read-only) used across database modules.
 * Provides start-info, create-info and raw CMS startinfo to avoid circular dependencies.
 *
 * @category Business Services
 * @since 1.0.0
 */
/**
 * Whether a host is an HA node and which databases are its HA ones
 * (getHaNodeState). `haConfFailure` (failureDetails) is set, and
 * `haDbNames` empty, when the host is an HA node but cubrid_ha.conf could not
 * be read.
 */
export type HaNodeState = {
  haNode: boolean;
  haDbNames: Set<string>;
  haConfFailure: FailureDetails | null;
};

@Injectable()
export class DatabaseInfoService extends BaseService {
  constructor(
    protected readonly hostService: HostService,
    protected readonly cmsClient: CmsHttpsClientService,
    private readonly cmsConfigService: CmsConfigService,
    private readonly databaseUserService: DatabaseUserService
  ) {
    super(hostService, cmsClient);
  }

  /**
   * Get start information for databases on a host (internal/raw CMS).
   * Returns raw CMS response without transformation.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns StartInfoCmsResponse
   * @throws CmsError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async startInfoInternal(userId: string, hostUid: string): Promise<StartInfoCmsResponse> {
    const cmsRequest: BaseCmsRequest = {
      task: 'startinfo',
    };
    // Every caller reads the same thing (the client's start-info read, and
    // each volume-info request's "does the database exist" check), so
    // callers that arrive while one is pending share it. The CMS token is
    // per user and host, hence the key.
    const response = await shareInFlight(
      JSON.stringify(['startinfo', userId, hostUid]),
      () => this.executeCmsRequest<BaseCmsRequest, StartInfoCmsResponse | BaseCmsResponse>(userId, hostUid, cmsRequest)
    );

    return response as StartInfoCmsResponse;
  }

  /**
   * Get start information for databases on a host (client shape with isProfileExists).
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns StartInfoClientResponse
   * @throws CmsError If request fails or CMS status is fail
   */
  @HandleCmsErrors()
  async startInfo(userId: string, hostUid: string): Promise<StartInfoClientResponse> {
    const [host, cmsStart, haDbNames] = await Promise.all([
      this.hostService.findHostInternal(userId, hostUid),
      this.startInfoInternal(userId, hostUid),
      this.getListedHaDbNames(userId, hostUid),
    ]);
    // A login being restored after a host login counts as logged in, so the
    // client keeps its views open meanwhile; if the restore fails, the next
    // start-info says so.
    const unlisted = await this.unlistedHaDbs(userId, hostUid, cmsStart, haDbNames);
    return mapStartInfoToClientResponse(cmsStart, host.dbProfiles, haDbNames, (dbname) =>
      this.databaseUserService.isDbLoginActive(userId, hostUid, dbname, host.token)
        || this.databaseUserService.isDbLoginRestoring(userId, hostUid, dbname),
    unlisted);
  }

  /**
   * The HA databases of this node that CMS's start-info leaves out. CMS lists
   * a databases.txt entry only when its db-host column names this host
   * (cm_server_util.cpp ut_get_dblist); on an HA replica that column names
   * the master and slave, so every database, stopped ones included, was
   * missing. Here: on an HA node (cubrid.conf ha_mode not off), the
   * ha_db_list names CMS left out that databases.txt has, with their volume
   * path. A plain host, or an HA node whose list is complete, reads nothing
   * more. Per-database CMS tasks find these by name alone (cm_utils.c
   * uReadDBtxtFile), so they work on them as on any other.
   */
  private async unlistedHaDbs(
    userId: string,
    hostUid: string,
    cmsStart: StartInfoCmsResponse,
    haDbNames: Set<string>
  ): Promise<{ dbname: string; dbdir: string }[]> {
    const listed = new Set((cmsStart.dblist?.[0]?.dbs ?? []).map((db) => db.dbname));
    const missing = [...haDbNames].filter((dbname) => !listed.has(dbname));
    if (missing.length === 0) return [];
    try {
      if (!(await this.isHaNode(userId, hostUid))) return [];
      const databasesTxt = parseDatabasesTxt(
        await this.cmsConfigService.getAllSystemParam(userId, hostUid, CMS_CONFNAME_DATABASES)
      );
      return missing
        .filter((dbname) => databasesTxt.has(dbname))
        .map((dbname) => ({ dbname, dbdir: databasesTxt.get(dbname) as string }));
    } catch {
      // The list CMS gave is still right; only these extra ones are missing.
      return [];
    }
  }

  /**
   * All database names listed in `[common]` `ha_db_list` in cubrid_ha.conf
   * (`haconf`), whatever cubrid.conf `ha_mode` says. Only start-info's HA
   * marks use it: it is read on every start-info poll, and checking ha_mode
   * there would add a cubrid.conf read to each.
   */
  @HandleCmsErrors()
  async getListedHaDbNames(userId: string, hostUid: string): Promise<Set<string>> {
    const haConf = await this.cmsConfigService.getAllSystemParam(userId, hostUid, CMS_CONFNAME_HACONF);
    return parseHaDbListDbNamesFromHaConf(haConf);
  }

  /**
   * The databases a start, stop or restart handles with `ha_start`/`ha_stop`:
   * the `ha_db_list` ones when the host is an HA node — cubrid.conf
   * `[common]` `ha_mode` is not off (on, replica) — and none otherwise. The
   * engine reads cubrid_ha.conf and runs `cubrid heartbeat` only on an HA
   * node, so elsewhere the listed databases are plain databases.
   */
  @HandleCmsErrors()
  async getHaDbNames(userId: string, hostUid: string): Promise<Set<string>> {
    return readHaDbNames((confname) => this.cmsConfigService.getAllSystemParam(userId, hostUid, confname));
  }

  /**
   * What a whole-service start, stop or restart needs to know: whether the
   * host is an HA node (it then always sends the node-wide `ha_start` or
   * `ha_stop`) and its `ha_db_list` databases, to check the outcome with.
   * A cubrid_ha.conf read failure is kept in `haConfFailure` instead of
   * thrown, since the node-wide request goes out without the list; a
   * cubrid.conf read failure is thrown (ha_mode unknown).
   */
  @HandleCmsErrors()
  async getHaNodeState(userId: string, hostUid: string): Promise<HaNodeState> {
    if (!(await this.isHaNode(userId, hostUid))) {
      return { haNode: false, haDbNames: new Set<string>(), haConfFailure: null };
    }
    try {
      return { haNode: true, haDbNames: await this.getListedHaDbNames(userId, hostUid), haConfFailure: null };
    } catch (err: unknown) {
      return { haNode: true, haDbNames: new Set<string>(), haConfFailure: failureDetails(err) };
    }
  }

  /** True when `dbname` is an HA database (getHaDbNames), so start/stop/restart use `ha_*` rather than `startdb`/`stopdb`. */
  @HandleCmsErrors()
  async effectiveHaDbForDbname(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<boolean> {
    const haDbNames = await this.getHaDbNames(userId, hostUid);
    return haDbNames.has(dbname.trim());
  }

  private async isHaNode(userId: string, hostUid: string): Promise<boolean> {
    const cubridConf = await this.cmsConfigService.getAllSystemParam(userId, hostUid, CMS_CONFNAME_CUBRID);
    return isHostHaModeOnFromCubridConf(cubridConf);
  }

  /**
   * Get default information for creating a database.
   *
   * @param userId User ID from JWT
   * @param hostUid Host UID
   * @returns GetCreatedbInfoClientResponse
   * @throws CmsError If request fails
   */
  @HandleCmsErrors()
  async getCreatedbInfo(userId: string, hostUid: string): Promise<GetCreatedbInfoClientResponse> {
    const envInfo = await this.cmsConfigService.getEnv(userId, hostUid);

    return {
      defaultDbDirectory: envInfo.CUBRID_DATABASES || '',
      cubridVersion: envInfo.CUBRIDVER,
      cubridPath: envInfo.CUBRID,
    };
  }
}
