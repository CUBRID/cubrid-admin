import { DatabaseError } from '@error/database/database-error';

/**
 * Parsed extended volume information.
 *
 * @category Utilities
 * @since 1.0.0
 */
export interface ParsedExvol {
  /**
   * Volume type (e.g., 'data', 'index', 'temp', 'generic')
   */
  type: string;

  /**
   * Volume size in pages (volume size divided by page size)
   */
  size: string;

  /**
   * Volume path
   */
  path: string;
}

/**
 * Parses an extended volume string in the format "type;size;path".
 *
 * @param volumeString - Volume string in format "type;size;path"
 * @returns Parsed volume information
 * @throws Error if the format is invalid
 *
 * @example
 * ```typescript
 * const parsed = parseExvolString("data;32768;/path/to/dbname");
 * // Returns: { type: "data", size: "32768", path: "/path/to/dbname" }
 * ```
 */
export function parseExvolString(volumeString: string): ParsedExvol {
  if (!volumeString || typeof volumeString !== 'string') {
    throw DatabaseError.InvalidVolumeString('Volume string must be a non-empty string', {
      receivedValue: volumeString,
    });
  }

  const parts = volumeString.split(';');

  if (parts.length !== 3) {
    throw DatabaseError.InvalidVolumeFormat('"type;size;path"', volumeString, {
      partCount: parts.length,
    });
  }

  const [type, size, path] = parts.map((part) => part.trim());

  if (!type || !size || !path) {
    throw DatabaseError.InvalidVolumeFormat(
      'all parts (type, size, path) must be non-empty',
      volumeString,
      { type, size, path }
    );
  }

  return {
    type,
    size,
    path,
  };
}

/**
 * Carries the specific, fixed-text `message` of a volume validation error
 * (e.g. InvalidVolumeSize) through to the wrapping Parse/ConvertVolumeFailed
 * error, so the client sees the actual cause instead of the generic
 * "Invalid volume information." Only DatabaseError messages built in this
 * module are forwarded; unknown errors keep the generic fallback.
 */
function causeMessageFor(volumeName: string, cause: DatabaseError): { message?: string } {
  const message = cause.additionalData?.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return {};
  }
  return { message: `Volume "${volumeName}": ${message.trim()}` };
}

/**
 * Parses an array of extended volume objects.
 * Each object contains volume names as keys and "type;size;path" strings as values.
 *
 * @param exvolArray - Array of volume objects
 * @returns Array of parsed volume information with volume names
 *
 * @example
 * ```typescript
 * const exvol = [{
 *   "test_data_x001": "data;32768;/path/to/dbname",
 *   "test_index_x001": "index;32768;/path/to/dbname"
 * }];
 * const parsed = parseExvolArray(exvol);
 * // Returns: [
 * //   { volumeName: "test_data_x001", type: "data", size: "32768", path: "/path/to/dbname" },
 * //   { volumeName: "test_index_x001", type: "index", size: "32768", path: "/path/to/dbname" }
 * // ]
 * ```
 */
export function parseExvolArray(
  exvolArray: Array<Record<string, string>>
): Array<ParsedExvol & { volumeName: string }> {
  if (!Array.isArray(exvolArray)) {
    throw DatabaseError.InvalidVolumeFormat('an array', typeof exvolArray, {
      receivedType: typeof exvolArray,
    });
  }

  const parsed: Array<ParsedExvol & { volumeName: string }> = [];

  for (const volumeObj of exvolArray) {
    if (!volumeObj || typeof volumeObj !== 'object') {
      continue;
    }

    for (const [volumeName, volumeString] of Object.entries(volumeObj)) {
      try {
        const parsedVolume = parseExvolString(volumeString);
        parsed.push({
          volumeName,
          ...parsedVolume,
        });
      } catch (error) {
        if (error instanceof DatabaseError) {
          throw DatabaseError.ParseVolumeFailed(volumeName, error, {
            volumeString,
            ...causeMessageFor(volumeName, error),
          });
        }
        throw DatabaseError.ParseVolumeFailed(
          volumeName,
          error instanceof Error ? error : new Error(String(error)),
          { volumeString }
        );
      }
    }
  }

  return parsed;
}

/**
 * Converts extended volume info object to CMS format string.
 *
 * Converts from: { type, size (MB), pagesize (bytes), volpath }
 * To: "type;sizeInPages;volpath"
 *
 * @param volumeInfo - Volume info object with type, size (MB), pagesize (bytes), and volpath
 * @returns CMS format string "type;sizeInPages;volpath"
 *
 * @example
 * ```typescript
 * const volumeInfo = {
 *   type: "data",
 *   size: 512,  // MB
 *   pagesize: 16384,  // bytes
 *   volpath: "/path/to/dbname"
 * };
 * const cmsString = convertExvolInfoToCmsFormat(volumeInfo);
 * // Returns: "data;32768;/path/to/dbname"
 * // (512 MB * 1024 * 1024 / 16384 = 32768 pages)
 * ```
 */
export function convertExvolInfoToCmsFormat(volumeInfo: {
  type: string;
  size: number; // MB
  pagesize: number; // bytes
  volpath: string;
}): string {
  if (!volumeInfo.type || !volumeInfo.volpath) {
    throw DatabaseError.InvalidVolumeInfo('Volume info must have type and volpath', { volumeInfo });
  }

  if (volumeInfo.size <= 0 || volumeInfo.pagesize <= 0) {
    throw DatabaseError.InvalidVolumeSize('Volume size and pagesize must be positive numbers', {
      size: volumeInfo.size,
      pagesize: volumeInfo.pagesize,
    });
  }

  // Convert MB to bytes, then divide by pagesize to get number of pages
  const sizeInBytes = volumeInfo.size * 1024 * 1024;
  const sizeInPages = Math.floor(sizeInBytes / volumeInfo.pagesize);

  return `${volumeInfo.type};${sizeInPages};${volumeInfo.volpath}`;
}

/**
 * Converts an array of extended volume objects to CMS format.
 *
 * @param exvolArray - Array of volume objects with ExvolInfo format
 * @returns Array of volume objects in CMS format (Record<string, string>)
 *
 * @example
 * ```typescript
 * const exvol = [{
 *   "test_data_x001": {
 *     type: "data",
 *     size: 512,  // MB
 *     pagesize: 16384,  // bytes
 *     volpath: "/path/to/dbname"
 *   }
 * }];
 * const cmsExvol = convertExvolArrayToCmsFormat(exvol);
 * // Returns: [{
 * //   "test_data_x001": "data;32768;/path/to/dbname"
 * // }]
 * ```
 */
export function convertExvolArrayToCmsFormat(
  exvolArray: Array<
    Record<
      string,
      {
        type: string;
        size: number; // MB
        pagesize: number; // bytes
        volpath: string;
      }
    >
  >
): Array<Record<string, string>> {
  if (!Array.isArray(exvolArray)) {
    return [];
  }

  return exvolArray.map((volumeObj) => {
    const cmsVolumeObj: Record<string, string> = {};

    for (const [volumeName, volumeInfo] of Object.entries(volumeObj)) {
      try {
        cmsVolumeObj[volumeName] = convertExvolInfoToCmsFormat(volumeInfo);
      } catch (error) {
        if (error instanceof DatabaseError) {
          throw DatabaseError.ConvertVolumeFailed(volumeName, error, {
            volumeInfo,
            ...causeMessageFor(volumeName, error),
          });
        }
        throw DatabaseError.ConvertVolumeFailed(
          volumeName,
          error instanceof Error ? error : new Error(String(error)),
          { volumeInfo }
        );
      }
    }

    return cmsVolumeObj;
  });
}
