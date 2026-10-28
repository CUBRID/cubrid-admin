import {
  GetAllSysParamCmsResponse,
  ParsedSystemParameter,
  SystemParametersBySection,
} from '@type/cms-response/get-all-sys-param-cms-response';
import { parseConfText } from '@api-interfaces';

// Both parsers read conf text with the engine's own INI rules
// (parseConfText): section names lowercased except a case-sensitive
// [@dbname], keys lowercased (the engine matches them case-insensitively),
// quotes and inline ;/# comments stripped, repeated sections merged.


/**
 * Parses configuration file content and extracts system parameters.
 *
 * @param response - CMS response containing configuration data
 * @returns Array of parsed system parameters
 *
 * @example
 * ```typescript
 * const response: GetAllSysParamCmsResponse = { ... };
 * const params = parseConfigParams(response);
 * // Returns: [
 * //   { key: "data_buffer_size", value: "512M", section: "common", lineNumber: 45 },
 * //   { key: "max_clients", value: "100", section: "common", lineNumber: 52 },
 * //   ...
 * // ]
 * ```
 */
export function parseConfigParams(response: GetAllSysParamCmsResponse): ParsedSystemParameter[] {
  const confdata = response.conflist?.[0]?.confdata ?? [];
  const params: ParsedSystemParameter[] = [];
  for (const section of parseConfText(confdata).sections) {
    for (const { key, value, lineNo } of section.entries) {
      params.push({ key: key.toLowerCase(), value, section: section.name ?? '', lineNumber: lineNo });
    }
  }
  return params;
}

/**
 * Parses configuration file content and groups parameters by section.
 *
 * @param response - CMS response containing configuration data
 * @returns System parameters grouped by section
 *
 * @example
 * ```typescript
 * const response: GetAllSysParamCmsResponse = { ... };
 * const grouped = parseConfigParamsBySection(response);
 * // Returns: {
 * //   "common": {
 * //     "data_buffer_size": "512M",
 * //     "max_clients": "100",
 * //     ...
 * //   },
 * //   "service": {
 * //     "service": "server,broker,manager",
 * //     ...
 * //   },
 * //   ...
 * // }
 * ```
 */
export function parseConfigParamsBySection(
  response: GetAllSysParamCmsResponse
): SystemParametersBySection {
  const grouped: SystemParametersBySection = {};
  const confdata = response.conflist?.[0]?.confdata ?? [];
  for (const section of parseConfText(confdata).sections) {
    if (section.name === null) continue;
    const params = (grouped[section.name] ??= {});
    for (const { key, value } of section.entries) params[key.toLowerCase()] = value;
  }
  return grouped;
}

/**
 * Gets a specific parameter value from parsed configuration.
 *
 * @param grouped - System parameters grouped by section
 * @param section - Section name (optional, searches all sections if not provided)
 * @param key - Parameter key
 * @returns Parameter value or undefined if not found
 *
 * @example
 * ```typescript
 * const grouped = parseConfigParamsBySection(response);
 * const bufferSize = getConfigParam(grouped, "common", "data_buffer_size");
 * // Returns: "512M"
 * ```
 */
export function getConfigParam(
  grouped: SystemParametersBySection,
  section: string,
  key: string
): string | undefined {
  return grouped[section]?.[key];
}

/**
 * Gets all parameters from a specific section.
 *
 * @param grouped - System parameters grouped by section
 * @param section - Section name
 * @returns Object containing all parameters in the section, or undefined if section not found
 *
 * @example
 * ```typescript
 * const grouped = parseConfigParamsBySection(response);
 * const commonParams = getSectionParams(grouped, "common");
 * // Returns: { data_buffer_size: "512M", max_clients: "100", ... }
 * ```
 */
export function getSectionParams(
  grouped: SystemParametersBySection,
  section: string
): Record<string, string> | undefined {
  return grouped[section];
}
