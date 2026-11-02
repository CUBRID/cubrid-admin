import { AppError } from '@error/app-error';
import { ValidationErrorCode } from './validation-error-code';

/**
 * Error class for validation-related operations.
 * Used for request body validation, form validation, etc.
 */
export class ValidationError extends AppError {
  constructor(
    kind: 'VALIDATION',
    code: ValidationErrorCode,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    super(kind, code, additionalData, originalError);
  }

  /**
   * Creates a validation error for invalid request body.
   *
   * @param missingFields - Array of missing required field names
   * @param additionalData - Additional error context
   * @returns ValidationError instance
   */
  static InvalidRequestBody(missingFields?: string[], additionalData?: Record<string, any>) {
    return new ValidationError('VALIDATION', ValidationErrorCode.INVALID_REQUEST_BODY, {
      missingFields,
      ...additionalData,
    });
  }

  /**
   * Creates a validation error for missing required field(s).
   *
   * @param fieldNames - Array of missing field names
   * @param additionalData - Additional error context
   * @returns ValidationError instance
   */
  static MissingRequiredField(fieldNames: string | string[], additionalData?: Record<string, any>) {
    const fields = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    const endpoint = additionalData?.endpoint || 'unknown';
    const fieldsList = fields.join(', ');
    return new ValidationError('VALIDATION', ValidationErrorCode.MISSING_REQUIRED_FIELD, {
      missingFields: fields,
      message: `Missing required field(s): ${fieldsList}. Endpoint: ${endpoint}`,
      ...additionalData,
    });
  }

  /**
   * Creates a validation error for missing database credentials.
   * Used when database profile doesn't exist and client must provide credentials.
   *
   * @param dbname - Database name
   * @param missingFields - Array of missing credential field names (e.g., ['id', 'password'])
   * @param additionalData - Additional error context
   * @returns ValidationError instance
   */
  static MissingDBCredentials(
    dbname: string,
    missingFields: string[],
    additionalData?: Record<string, any>
  ) {
    return new ValidationError('VALIDATION', ValidationErrorCode.MISSING_DB_CREDENTIALS, {
      dbname,
      missingFields,
      message: `No saved login for database ${dbname}. Provide an id and password.`,
      ...additionalData,
    });
  }

  /**
   * Creates a validation error for invalid field format.
   *
   * @param fieldName - Field name with invalid format
   * @param expectedFormat - Expected format description
   * @param additionalData - Additional error context
   * @returns ValidationError instance
   */
  static InvalidFieldFormat(
    fieldName: string,
    expectedFormat?: string,
    additionalData?: Record<string, any>
  ) {
    return new ValidationError('VALIDATION', ValidationErrorCode.INVALID_FIELD_FORMAT, {
      fieldName,
      expectedFormat,
      ...additionalData,
    });
  }
}
