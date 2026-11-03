import { LockObjectRow, LockOverview, LockSummary, LockSummaryRow } from '@api-interfaces';

type Holder = { tran_index?: unknown; granted_mode?: unknown; count?: unknown };
type Entry = {
  ob_type?: unknown;
  oid?: unknown;
  num_holders?: unknown;
  num_b_holders?: unknown;
  num_waiters?: unknown;
  lock_holders?: Holder | Holder[];
};
type Transaction = { index?: unknown; '@uid'?: unknown; uid?: unknown; host?: unknown; pid?: unknown; pname?: unknown };

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const text = (value: unknown) => (value == null ? '' : String(value).trim());

/**
 * CMS splits one lock object into an entry with its metadata (ob_type, oid)
 * followed by an entry holding only lock_holders; put them back together.
 */
function mergeLotEntries(rawEntries: unknown): Entry[] {
  const merged: Entry[] = [];
  let pending: Entry | null = null;

  for (const item of asArray(rawEntries as Entry | Entry[])) {
    const holders = asArray(item.lock_holders);
    if (item.ob_type != null || item.oid != null) {
      if (pending) merged.push(pending);
      pending = { ...item, lock_holders: holders };
    } else if (holders.length && pending) {
      pending.lock_holders = [...asArray(pending.lock_holders), ...holders];
    } else if (holders.length) {
      if (pending) merged.push(pending);
      pending = { ob_type: '-', oid: '-', ...item, lock_holders: holders };
    }
  }

  if (pending) merged.push(pending);
  return merged;
}

/**
 * The engine's lock dump names an object "Instance of class (vol|page|slot) = t1"
 * or "Index key of class (vol|page|slot) = t1"; drop the OID so all row locks
 * on one table group together. "Class = t1", "Root class" and "None" stay as is.
 */
export function lockObjectLabel(obType: unknown): string {
  const label = text(obType) || '-';
  const match = /^(.*?)\s*\([^)]*\)\s*=\s*(.+)$/.exec(label);
  return match ? `${match[1]} = ${match[2]}` : label;
}

/**
 * Groups the lockdb lock table per transaction, lock object (without OID) and
 * granted mode, counting the lock objects in each group. One row per holder
 * otherwise means one row per locked row, which a single bulk insert can turn
 * into tens of thousands.
 */
export function summarizeLocks(lockinfo: unknown): LockSummary {
  const info = asArray(lockinfo as Record<string, unknown> | Record<string, unknown>[])[0];
  const lot = asArray(info?.lot as Record<string, unknown> | Record<string, unknown>[])[0];
  const entries = mergeLotEntries(lot?.entry);

  const transactions = new Map<string, Transaction>();
  for (const tran of asArray(info?.transaction as Transaction | Transaction[])) {
    const key = text(tran.index);
    if (key) transactions.set(key, tran);
  }

  const groups = new Map<string, LockSummaryRow>();
  let totalLocks = 0;

  for (const entry of entries) {
    const holders = asArray(entry.lock_holders);
    if (holders.length === 0) continue;
    totalLocks++;
    const obj = lockObjectLabel(entry.ob_type);

    for (const holder of holders) {
      const index = text(holder.tran_index) || '-';
      const mode = text(holder.granted_mode) || '-';
      const key = JSON.stringify([index, obj, mode]);
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        continue;
      }
      const tran = transactions.get(index);
      groups.set(key, {
        index,
        user: text(tran?.['@uid'] ?? tran?.uid) || '-',
        host: text(tran?.host) || '-',
        pid: text(tran?.pid) || '-',
        program: text(tran?.pname) || '-',
        obj,
        mode,
        count: 1,
      });
    }
  }

  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  return { rows, totalLocks };
}

const firstOf = (value: unknown) =>
  asArray(value as Record<string, unknown> | Record<string, unknown>[])[0];

/**
 * Everything lockdb reports except the per-object lock table: settings,
 * lock table counters and the transactions, small enough to send with the
 * summary.
 */
export function lockOverview(lockinfo: unknown): LockOverview {
  const info = firstOf(lockinfo);
  const lot = firstOf(info?.lot);
  return {
    esc: text(info?.esc),
    dinterval: text(info?.dinterval),
    numlocked: text(lot?.numlocked),
    numallocated: text(lot?.numallocated),
    sizelock: text(lot?.sizelock),
    // CMS sends -1 here for 11.4 and later, which report numallocated instead.
    maxnumlock: text(lot?.maxnumlock) === '-1' ? '' : text(lot?.maxnumlock),
    transactions: asArray(info?.transaction as Transaction | Transaction[]).map((tran) => ({
      index: text(tran.index),
      user: text(tran['@uid'] ?? tran.uid),
      host: text(tran.host),
      pid: text(tran.pid),
      program: text(tran.pname),
      isolation: text((tran as Record<string, unknown>).isolevel),
      timeout: text((tran as Record<string, unknown>).timeout),
    })),
  };
}

/** "0|   553|   1" as printed by the engine (%2d|%6d|%4d) → "0|553|1". */
export const compactOid = (oid: unknown) =>
  text(oid)
    .split('|')
    .map((part) => part.trim())
    .join('|') || '-';

/**
 * CMS reads the holder counts from a fixed line; when the engine prints an
 * "MVCC info: insert ID = …" line there instead, it reports "inser", "missing"
 * and "=". Such values are dropped rather than shown as counts.
 */
const lockCount = (value: unknown) => (/^\d+$/.test(text(value)) ? text(value) : '-');

/** One row per locked object, with its holders put back together. */
export function listLockObjects(lockinfo: unknown): LockObjectRow[] {
  const lot = firstOf(firstOf(lockinfo)?.lot);
  return mergeLotEntries(lot?.entry).map((entry) => {
    const holders = asArray(entry.lock_holders).map((holder) => ({
      index: text(holder.tran_index) || '-',
      mode: text(holder.granted_mode) || '-',
      count: text(holder.count),
    }));
    return {
      oid: compactOid(entry.oid),
      obj: text(entry.ob_type) || '-',
      holders,
      numHolders: lockCount(entry.num_holders),
      numBlockedHolders: lockCount(entry.num_b_holders),
      numWaiters: lockCount(entry.num_waiters),
    };
  });
}
