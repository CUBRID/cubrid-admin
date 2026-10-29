import { LockSummary, LockSummaryRow } from '@api-interfaces';

type Holder = { tran_index?: unknown; granted_mode?: unknown };
type Entry = { ob_type?: unknown; oid?: unknown; lock_holders?: Holder | Holder[] };
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
