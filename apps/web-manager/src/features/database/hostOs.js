/**
 * CMS getenv `osinfo` is "LINUX", "NT", "AIX", "HPUX", "SOLARIS", ... (or
 * absent until host env has been fetched).
 */
export const isLinuxHost = (osinfo) => String(osinfo || '').toUpperCase() === 'LINUX';
