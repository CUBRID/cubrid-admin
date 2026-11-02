import { parseConfText } from '@api-interfaces';

const listOf = (value) => (value || '').split(',').map((name) => name.trim()).filter(Boolean);

/**
 * The databases `cubrid service start` starts, read from cubrid.conf as the
 * engine reads it: only `[service]`, the last `service=` and `server=` keys
 * (a later key replaces an earlier one), with quotes, comments, spacing and
 * `\` continued lines handled by parseConfText. Empty when `service=` does
 * not include `server`.
 */
export function autoStartDatabases(confdata) {
  const service = parseConfText(confdata).sections.find((section) => section.name === 'service');
  const last = (key) => service?.entries.filter((entry) => entry.key.toLowerCase() === key).slice(-1)[0]?.value;
  if (!listOf(last('service')).map((name) => name.toLowerCase()).includes('server')) return [];
  return listOf(last('server'));
}
