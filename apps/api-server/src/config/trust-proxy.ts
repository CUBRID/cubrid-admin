import { isIP } from 'net';

/** What express's 'trust proxy' setting takes from TRUST_PROXY. */
export type TrustProxyValue = string | number | false;

export const DEFAULT_TRUST_PROXY = 'loopback';

const NAMED_SUBNETS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const OFF = new Set(['false', 'off', 'no', 'none']);
// Trusting every hop would take the client's own X-Forwarded-For value.
const TRUST_ALL = new Set(['true', 'on', 'yes', '*']);

function isAddressOrSubnet(token: string): boolean {
  if (NAMED_SUBNETS.has(token)) return true;
  const [address, bits, extra] = token.split('/');
  if (extra !== undefined || !isIP(address)) return false;
  if (bits === undefined) return true;
  const max = isIP(address) === 4 ? 32 : 128;
  // /0 is every address: the same as trusting everyone.
  return /^\d+$/.test(bits) && Number(bits) > 0 && Number(bits) <= max;
}

/**
 * TRUST_PROXY → express's 'trust proxy' (req.ip, which the login rate limit
 * counts by): the proxies whose X-Forwarded-For entry is believed, so req.ip
 * is the address the nearest untrusted hop reported, never a value the
 * client wrote itself.
 *
 * - unset: 'loopback' (a reverse proxy on the same machine, such as nginx)
 * - a hop count ('1'), or addresses, CIDR subnets and 'loopback',
 *   'linklocal', 'uniquelocal', comma-separated: passed as they are
 * - 'false' / 'off': X-Forwarded-For is ignored
 * - 'true', a /0 subnet or anything else: refused with a warning, 'loopback' is used
 */
export function parseTrustProxy(raw: string | undefined): { value: TrustProxyValue; warning?: string } {
  const text = (raw ?? '').trim();
  if (text === '') return { value: DEFAULT_TRUST_PROXY };
  const lower = text.toLowerCase();
  if (OFF.has(lower)) return { value: false };
  if (TRUST_ALL.has(lower)) {
    return {
      value: DEFAULT_TRUST_PROXY,
      warning: `TRUST_PROXY=${text} would trust any X-Forwarded-For a client sends; using '${DEFAULT_TRUST_PROXY}'. Name the proxy's address or a hop count instead.`,
    };
  }
  if (/^\d+$/.test(lower)) return { value: Number(lower) };
  const tokens = lower.split(',').map((token) => token.trim()).filter(Boolean);
  if (tokens.some((token) => /\/0+$/.test(token))) {
    return {
      value: DEFAULT_TRUST_PROXY,
      warning: `TRUST_PROXY=${text} names every address (/0), which would trust any X-Forwarded-For a client sends; using '${DEFAULT_TRUST_PROXY}'.`,
    };
  }
  if (tokens.length > 0 && tokens.every(isAddressOrSubnet)) return { value: tokens.join(', ') };
  return {
    value: DEFAULT_TRUST_PROXY,
    warning: `TRUST_PROXY=${text} is not a hop count or a list of addresses; using '${DEFAULT_TRUST_PROXY}'.`,
  };
}
