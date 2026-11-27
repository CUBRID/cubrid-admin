/** Shortest account id a new account may have, as the sign-up page asks. */
export const MIN_ACCOUNT_ID_LENGTH = 3;

/**
 * A new account's id: at least 3 characters, with no spaces at either end
 * (they'd be invisible in the user list and easy to mistype at login).
 * Checked only when an account is created, so existing accounts with other
 * ids keep logging in.
 */
export function isValidAccountId(id: unknown): id is string {
  return typeof id === 'string' && id === id.trim() && id.length >= MIN_ACCOUNT_ID_LENGTH;
}
