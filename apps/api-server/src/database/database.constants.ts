/**
 * CMS `confname` for cubrid.conf (`getallsysparam` / `setsysparam`).
 *
 * @category Database
 * @since 1.0.0
 */
export const CMS_CONFNAME_CUBRID = 'cubridconf' as const;

/**
 * CMS `confname` for cm.conf.
 *
 * @category Database
 */
export const CMS_CONFNAME_CM = 'cmconf' as const;

/**
 * CMS `confname` for cubrid_ha.conf.
 *
 * @category Database
 * @since 1.0.0
 */
export const CMS_CONFNAME_HACONF = 'haconf' as const;

/**
 * Constants used across database module.
 *
 * @category Database
 * @since 1.0.0
 */
export const DATABASE_CONSTANTS = {
  /** Same value as {@link CMS_CONFNAME_CUBRID}. */
  CUBRID_CONF_NAME: CMS_CONFNAME_CUBRID,

  /** Same value as {@link CMS_CONFNAME_HACONF}. */
  HACONF_NAME: CMS_CONFNAME_HACONF,

  /**
   * CMS API protocol
   */
  CMS_API_PROTOCOL: 'https://',

  /**
   * CMS API path
   */
  CMS_API_PATH: '/cm_api',
} as const;
