import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchDatabaseStartInfo } from './databaseSlice';

/**
 * Reads the host's database list when a dialog opens and tells whether that
 * read succeeded. A new-name check (create, copy, rename) refuses a name only
 * on a list read this way: after a failed read the list kept is the last
 * one, and a database since deleted outside this app would still block its
 * name. A background read, so a failure keeps the tree as it is.
 */
export function useFreshDbList(hostUid, isOpen) {
  const dispatch = useDispatch();
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    setFresh(false);
    if (!isOpen || !hostUid) return undefined;
    let cancelled = false;
    dispatch(fetchDatabaseStartInfo({ hostUid, isBackground: true }))
      .unwrap()
      .then(() => { if (!cancelled) setFresh(true); }, () => {});
    return () => { cancelled = true; };
  }, [dispatch, hostUid, isOpen]);
  return fresh;
}
