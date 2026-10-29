import { buildMessage, ValidateBy, ValidationOptions } from 'class-validator';
import { utf8ByteLength } from '@api-interfaces';

/**
 * Rejects a string longer than `max` UTF-8 bytes. The engine and CMS limit
 * passwords with strlen, so a character count would let multibyte input
 * past the limit.
 */
export function MaxUtf8Bytes(max: number, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxUtf8Bytes',
      constraints: [max],
      validator: {
        validate: (value: unknown) => typeof value !== 'string' || utf8ByteLength(value) <= max,
        defaultMessage: buildMessage((each) => `${each}$property must be at most $constraint1 bytes`, options),
      },
    },
    options
  );
}
