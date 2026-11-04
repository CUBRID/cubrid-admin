import { ValidationPipe } from '@nestjs/common';
import type { ValidationError as ClassValidatorError } from 'class-validator';
import { ValidationError } from './validation-error';

function flattenFieldNames(errors: ClassValidatorError[], prefix = ''): string[] {
  return errors.flatMap((err) => {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.children?.length) {
      return flattenFieldNames(err.children, path);
    }
    return [path];
  });
}

/**
 * Each invalid field with the names of the checks it failed (class-validator
 * constraint names such as isInt, max, isNotEmpty), for a client that shows
 * its own text instead of the English messages.
 */
function flattenInvalidFields(
  errors: ClassValidatorError[],
  prefix = ''
): Array<{ field: string; constraints: string[] }> {
  return errors.flatMap((err) => {
    const path = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.children?.length) {
      return flattenInvalidFields(err.children, path);
    }
    return [{ field: path, constraints: Object.keys(err.constraints ?? {}) }];
  });
}

function flattenMessages(errors: ClassValidatorError[]): string[] {
  return errors.flatMap((err) => {
    if (err.children?.length) {
      return flattenMessages(err.children);
    }
    return Object.values(err.constraints ?? {});
  });
}

/**
 * Global request-body validator. Only `@Body()`/`@Param()`/`@Query()`
 * parameters typed as an actual class (not a plain TS `interface`/`type`,
 * which is erased at runtime) are checked — for everything else NestJS
 * skips validation entirely and passes the value through unchanged, so
 * enabling this does not affect endpoints that haven't been migrated to a
 * validated DTO class yet.
 *
 * On failure, throws our own `ValidationError` (an `AppError`) instead of
 * Nest's default `BadRequestException`, so the response shape matches every
 * other validation error in the app (same `code`/`type`/`title` fields via
 * GlobalExceptionFilter) rather than introducing a second, differently
 * shaped "invalid request" response.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) => {
      const fieldNames = flattenFieldNames(errors);
      const messages = flattenMessages(errors);
      return ValidationError.InvalidRequestBody(fieldNames, {
        message: messages.join('; ') || `Invalid request body: ${fieldNames.join(', ')}`,
        invalidFields: flattenInvalidFields(errors),
      });
    },
  });
}
