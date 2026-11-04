import { StartInfoClientResponse } from '@api-interfaces';
import { GetCreatedbInfoClientResponse } from '@api-interfaces/response/get-createdb-info-client-response';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { BaseService, HandleCmsErrors } from '@common';
import { HostService } from '@host';
import { Injectable } from '@nestjs/common';
import { BaseCmsRequest, BaseCmsResponse } from '@type';
import { StartInfoCmsResponse } from '@type/cms-response';
import { CMS_CONFNAME_CUBRID, CMS_CONFNAME_HACONF } from '@database/database.constants';
import { getConfigParam, parseConfigParamsBySection, parseHaDbListDbNamesFromHaConf, shareInFlight } from '@util';
import { GetAllSysParamCmsResponse } from '@type/cms-response';
import { mapStartInfoToClientResponse } from './start-info.mapper';
import { DatabaseUserService } from '../user/database-user.service';

/**
 * Service for database information (read-only) used across database modules.
 * Provides start-info, create-info and raw CMS startinfo to avoid circular dependencies.
 *
 * @category Business Services
 * @since 1.0.0
 */
// ha_mode values the engine reads as off; absent means off too.
const HA_MODE_OFF = new Set(['', 'off', 'no', 'n', 'false', '0']);

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
      this.getHaDbNames(userId, hostUid),
    ]);
    // A login being restored after a host login counts as logged in, so the
    // client keeps its views open meanwhile; if the restore fails, the next
    // start-info says so.
    return mapStartInfoToClientResponse(cmsStart, host.dbProfiles, haDbNames, (dbname) =>
      this.databaseUserService.isDbLoginActive(userId, hostUid, dbname, host.token)
        || this.databaseUserService.isDbLoginRestoring(userId, hostUid, dbname)
    );
  }

  /**
   * All database names listed in `[common]` `ha_db_list` in cubrid_ha.conf (`haconf`).
   * Used to partition a host's databases into HA vs non-HA for bulk start/stop.
   */
  @HandleCmsErrors()
  async getHaDbNames(userId: string, hostUid: string): Promise<Set<string>> {
    const haConf = await this.cmsConfigService.getAllSystemParam(userId, hostUid, CMS_CONFNAME_HACONF);
    return parseHaDbListDbNamesFromHaConf(haConf);
  }

  /**
   * The HA databases a whole-service start or stop acts on with the
   * node-wide `ha_start`/`ha_stop`: the `ha_db_list` ones when the host is an
   * HA node — cubrid.conf `[common]` `ha_mode` is not off (on, replica) —
   * and none otherwise. The engine refuses `cubrid heartbeat` when ha_mode
   * is off, so there the listed databases are plain databases.
   */
  @HandleCmsErrors()
  async getServiceHaDbNames(userId: string, hostUid: string): Promise<Set<string>> {
    const [haDbNames, cubridConf] = await Promise.all([
      this.getHaDbNames(userId, hostUid),
      this.cmsConfigService.getAllSystemParam(userId, hostUid, CMS_CONFNAME_CUBRID),
    ]);
    const haMode = (getConfigParam(parseConfigParamsBySection(cubridConf as GetAllSysParamCmsResponse), 'common', 'ha_mode') ?? '')
      .trim()
      .toLowerCase();
    return HA_MODE_OFF.has(haMode) ? new Set<string>() : haDbNames;
  }

  /**
   * True when `dbname` is listed in `[common]` `ha_db_list` in cubrid_ha.conf (`haconf`).
   * Used by database start/stop/restart to choose `ha_*` vs `startdb`/`stopdb`.
   */
  @HandleCmsErrors()
  async effectiveHaDbForDbname(
    userId: string,
    hostUid: string,
    dbname: string
  ): Promise<boolean> {
    const haDbNames = await this.getHaDbNames(userId, hostUid);
    return haDbNames.has(dbname.trim());
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
