// The server's Web Manager account password policy (api-server
// passwordValidityChecker): at least 8 characters after trimming, with a
// letter and a digit. Checked here only so the button can wait for it; the
// server's check is the one that counts.
export const isValidAccountPassword = (password) =>
  typeof password === 'string' &&
  password.trim().length >= 8 &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password);

export const GENERATED_PASSWORD_LENGTH = 14;

// No look-alikes (0/O/o, 1/l/I) so it can be read out or typed from a note.
const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*-_+=?';
const ALL = LETTERS + DIGITS + SYMBOLS;

// A uniform index below `n` from the browser's cryptographic generator
// (rejection sampling, so no character is likelier than another).
function randomIndex(n, random) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    random(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/**
 * A random temporary password that always passes the policy: at least one
 * letter, one digit and one symbol, the rest from the whole set, shuffled.
 * `random` fills a Uint32Array (crypto.getRandomValues; replaceable in tests).
 */
export function generateAccountPassword(
  length = GENERATED_PASSWORD_LENGTH,
  random = (buf) => crypto.getRandomValues(buf)
) {
  const pick = (set) => set[randomIndex(set.length, random)];
  const chars = [pick(LETTERS), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
