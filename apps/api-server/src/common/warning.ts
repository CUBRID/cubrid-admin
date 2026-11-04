import type { WarningDetail } from '@api-interfaces';

/** A warning as it is made: its code and values, and its English text. */
export type Warning = WarningDetail & { message: string };

/**
 * The response fields for `list`: the texts as `warnings` (what clients have
 * shown so far) and their codes and values as `warningDetails`, in the same
 * order. Nothing when the list is empty.
 */
export function warningFields(list: Warning[]): { warnings?: string[]; warningDetails?: WarningDetail[] } {
  if (list.length === 0) return {};
  return {
    warnings: list.map((w) => w.message),
    warningDetails: list.map(({ message: _message, ...detail }) => detail as WarningDetail),
  };
}
