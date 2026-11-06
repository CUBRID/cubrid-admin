// CMS users as the user management table shows them, sorted as CA's user
// management dialog sorts them (UserManagementTableViewerSorter): by the
// clicked column, ascending first and flipped by a second click on it, text
// compared as is (String.compareTo); ties keep CMS's order.

/** The user's name as CMS sends it (@id, or one of the other fields seen). */
export const cmsUserName = (user) => (
  typeof user === 'string' ? user : (user?.name || user?.id || user?.['@id'] || user?.targetid || '')
);

/** One table row per user: its name, its three authorities and the user as sent. */
export const toCmsUserRow = (user) => ({
  rowKey: cmsUserName(user),
  name: cmsUserName(user),
  dbcreate: user?.dbcreate || user?.['@dbcreate'] || 'none',
  casauth: user?.casauth || user?.['@casauth'] || 'none',
  statusmonitorauth: user?.statusmonitorauth || user?.['@statusmonitorauth'] || 'none',
  user,
});

/** The order CA starts with: by user ID, ascending. */
export const DEFAULT_CMS_USER_SORT = Object.freeze({ key: 'name', direction: 'asc' });

/** The sort after a click on the `key` column. */
export const nextCmsUserSort = (sort, key) => (
  sort?.key === key
    ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' }
);

export function sortCmsUserRows(rows, sort = DEFAULT_CMS_USER_SORT) {
  const sign = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = String(a[sort.key] ?? '');
    const y = String(b[sort.key] ?? '');
    if (x === y) return 0;
    return (x < y ? -1 : 1) * sign;
  });
}
