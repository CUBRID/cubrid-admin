/**
 * gettransactioninfo / killtransaction helpers (CUBRID Manager TransactionInfoDialog 기준).
 */

/**
 * @param {string|number|undefined} tranindex - e.g. "6(ACTIVE)" or "6"
 * @returns {string} numeric index for CMS kill type "i"
 */
export function parseTranIndex(tranindex) {
  if (tranindex == null || tranindex === '') return '';
  const match = String(tranindex).match(/\d+/);
  return match ? match[0] : String(tranindex).trim();
}

/**
 * @param {'i'|'p'|'h'|'d'} killType
 * @param {object} transaction - gettransactioninfo row
 * @returns {string}
 */
export function buildKillParameter(killType, transaction) {
  if (!transaction) return '';

  switch (killType) {
    case 'i':
      return parseTranIndex(transaction.tranindex);
    case 'h':
      return (transaction.host || '').trim();
    case 'p':
      return (transaction.program || transaction.pname || '').trim();
    default:
      return '';
  }
}

// copylogdb/applylogdb are the HA replication daemons themselves (copy the
// log from master to replica, then apply it) — they show up in
// gettransactioninfo as ordinary-looking transaction rows, but killing one
// disrupts live HA replication rather than just ending a user's query.
const HA_REPLICATION_PROCESSES = ['copylogdb', 'applylogdb'];

/**
 * @param {string|undefined} program - transaction row's program/pname field
 * @returns {boolean}
 */
export function isHaReplicationProcess(program) {
  if (!program) return false;
  const base = program.trim().toLowerCase();
  return HA_REPLICATION_PROCESSES.some((p) => base === p || base.startsWith(`${p}_`));
}

/**
 * @param {object} response - gettransactioninfo API body (unwrapped)
 * @returns {object[]}
 */
export function extractTransactionList(response) {
  const containers = response?.transactioninfo;
  if (containers == null) return [];

  const list = Array.isArray(containers) ? containers : [containers];
  const first = list[0];
  const txs = first?.transaction;
  if (txs == null) return [];
  return Array.isArray(txs) ? txs : [txs];
}
