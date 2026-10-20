import { BaseCmsResponse } from './base-cms-response';

/**
 * Response type for getting all system parameters.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type GetAllSysParamCmsResponse = BaseCmsResponse & {
  /**
   * Configuration file name
   */
  confname: string;

  /**
   * Configuration list containing configuration data
   */
  conflist: Array<{
    /**
     * Configuration data as array of lines
     *
     * Contains raw configuration file content including:
     * - Comments (lines starting with #)
     * - Section headers (lines like [section])
     * - Parameter lines (key=value format)
     * - Empty lines
     */
    confdata: string[];
  }>;
};

/**
 * Parsed system parameter structure
 */
export type ParsedSystemParameter = {
  /**
   * Parameter key
   */
  key: string;

  /**
   * Parameter value
   */
  value: string;

  /**
   * Section name (e.g., "common", "service", "monitoring")
   */
  section: string;

  /**
   * Original line number in confdata array
   */
  lineNumber: number;
};

/**
 * System parameters grouped by section
 */
export type SystemParametersBySection = {
  /**
   * Section name
   */
  [section: string]: {
    /**
     * Parameters in this section
     */
    [key: string]: string;
  };
};
