import { ValidateBy, ValidationOptions } from 'class-validator';
import type { ParamValueIssue } from '@api-interfaces';

/**
 * A field the shared libs check accepts (checkIntInRange and the like in
 * @api-interfaces), so the server refuses what the dialog refuses, in the
 * same words.
 */
export function PassesCheck(
  name: string,
  check: (value: unknown, object: Record<string, unknown>) => ParamValueIssue | null,
  options?: ValidationOptions
): PropertyDecorator {
  return ValidateBy(
    {
      name,
      validator: {
        validate: (value: unknown, args) => check(value, (args?.object ?? {}) as Record<string, unknown>) === null,
        defaultMessage: (args) =>
          `${args?.property}: ${check(args?.value, (args?.object ?? {}) as Record<string, unknown>)?.message ?? 'invalid value'}`,
      },
    },
    options
  );
}
