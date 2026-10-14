
/**
 * Utility for exporting and importing CUBRID Host connections.
 * Compatible with legacy CUBRID Admin XML and desktop .prefs / .properties.
 */

export const MIN_IMPORT_PORT = 1;
export const MAX_IMPORT_PORT = 65535;
export const DEFAULT_IMPORT_PORT = 8001;

/**
 * Exports a list of hosts to an XML file.
 * Passwords are NOT included.
 */
export const exportHostsToXml = (hosts, fileName = 'export_hosts.xml') => {
  if (!hosts || hosts.length === 0) return;

  const doc = document.implementation.createDocument(null, 'hosts', null);
  const root = doc.documentElement;

  hosts.forEach(host => {
    const hostNode = doc.createElement('host');
    hostNode.setAttribute('id', host.uid || '');
    hostNode.setAttribute('name', host.alias || host.address || '');
    hostNode.setAttribute('address', host.address || '');
    hostNode.setAttribute('port', String(host.port || DEFAULT_IMPORT_PORT));
    hostNode.setAttribute('user', host.id || '');
    hostNode.setAttribute('password', '');
    hostNode.setAttribute('savePassword', 'false');
    hostNode.setAttribute('jdbcDriver', 'default');
    root.appendChild(hostNode);
  });

  const serializer = new XMLSerializer();
  const xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(doc);

  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Native (web-manager-to-web-manager) export format marker, distinct from CA's XML/prefs. */
export const NATIVE_FORMAT_ID = 'cubrid-webmanager-hosts';
export const NATIVE_FORMAT_VERSION = 1;

/** @returns {{ name: string, hosts: object[] }[]} groups (in hostGroups map order) filtered to selected host uids */
function buildGroupedExportPayload(hostGroups, selectedUids) {
  const selected = selectedUids ? new Set(selectedUids) : null;
  const groups = [];

  for (const group of Object.values(hostGroups || {})) {
    const hostsInGroup = Object.values(group.hosts || {}).filter(
      (host) => !selected || selected.has(host.uid)
    );
    if (hostsInGroup.length === 0) continue;

    groups.push({
      name: group.name || 'Imported',
      hosts: hostsInGroup.map((host) => ({
        alias: host.alias || '',
        address: host.address || '',
        port: host.port || DEFAULT_IMPORT_PORT,
        id: host.id || '',
      })),
    });
  }

  return groups;
}

function triggerDownload(content, mimeType, fileName) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports hosts (with their group structure) to the native web-manager XML format.
 * Round-trips cleanly with another Web Manager instance's import. Passwords are NOT included.
 */
export const exportHostGroupsToNativeXml = (hostGroups, selectedUids, fileName = 'export_hosts.xml') => {
  const groups = buildGroupedExportPayload(hostGroups, selectedUids);
  if (groups.length === 0) return;

  const doc = document.implementation.createDocument(null, 'cwm-hosts', null);
  const root = doc.documentElement;
  root.setAttribute('version', String(NATIVE_FORMAT_VERSION));

  groups.forEach((group) => {
    const groupNode = doc.createElement('group');
    groupNode.setAttribute('name', group.name);
    group.hosts.forEach((host) => {
      const hostNode = doc.createElement('host');
      hostNode.setAttribute('alias', host.alias);
      hostNode.setAttribute('address', host.address);
      hostNode.setAttribute('port', String(host.port));
      hostNode.setAttribute('user', host.id);
      groupNode.appendChild(hostNode);
    });
    root.appendChild(groupNode);
  });

  const serializer = new XMLSerializer();
  const xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(doc);
  triggerDownload(xmlString, 'application/xml', fileName);
};

/**
 * Exports hosts (with their group structure) to the native web-manager JSON format.
 * Round-trips cleanly with another Web Manager instance's import. Passwords are NOT included.
 */
export const exportHostGroupsToJson = (hostGroups, selectedUids, fileName = 'export_hosts.json') => {
  const groups = buildGroupedExportPayload(hostGroups, selectedUids);
  if (groups.length === 0) return;

  const payload = {
    format: NATIVE_FORMAT_ID,
    version: NATIVE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    groups,
  };

  triggerDownload(JSON.stringify(payload, null, 2), 'application/json', fileName);
};

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

/**
 * Java Properties-style unescape (\n \r \t \f \" \\ \: \= \uXXXX, etc.).
 */
export function unescapeJavaProperties(value) {
  let result = '';
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    if (str[i] !== '\\' || i + 1 >= str.length) {
      result += str[i];
      continue;
    }
    const next = str[i + 1];
    if (next === 'n') {
      result += '\n';
      i += 1;
    } else if (next === 'r') {
      result += '\r';
      i += 1;
    } else if (next === 't') {
      result += '\t';
      i += 1;
    } else if (next === 'f') {
      result += '\f';
      i += 1;
    } else if (next === 'u' && i + 5 < str.length) {
      const hex = str.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        result += String.fromCharCode(parseInt(hex, 16));
        i += 5;
      } else {
        result += next;
        i += 1;
      }
    } else {
      result += next;
      i += 1;
    }
  }
  return result;
}

/** Join physical lines using Java properties continuation (trailing `\`). */
function joinPropertyContinuations(text) {
  const physical = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const logical = [];
  let current = null;

  for (const raw of physical) {
    if (current === null) {
      current = raw;
    } else {
      current += raw.replace(/^\s+/, '');
    }

    if (current.endsWith('\\')) {
      current = current.slice(0, -1);
    } else {
      logical.push(current);
      current = null;
    }
  }

  if (current !== null) {
    logical.push(current);
  }

  return logical;
}

export const PREFS_KEY_SERVERS = 'CUBRID_SERVERS';
export const PREFS_KEY_HOSTGROUP = 'com.cubrid.manager.hostgroup';

function isPropertyKeyTerminator(char) {
  return char === ' ' || char === '\t' || char === '\f' || char === '=' || char === ':';
}

function isPropertyWhitespace(char) {
  return char === ' ' || char === '\t' || char === '\f';
}

/**
 * Splits a logical Java .properties line (value still escaped in file).
 * Separator is the first unescaped whitespace, '=', or ':' (JDK Properties.load rules).
 */
export function parsePropertyLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
    return null;
  }

  let keyEnd = -1;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
      i += 1;
      continue;
    }
    if (isPropertyKeyTerminator(trimmed[i])) {
      keyEnd = i;
      break;
    }
  }

  if (keyEnd < 0) {
    return {
      key: unescapeJavaProperties(trimmed),
      rawValue: '',
    };
  }

  let valueStart = keyEnd;
  while (valueStart < trimmed.length) {
    const char = trimmed[valueStart];
    if (!isPropertyWhitespace(char)) {
      if (char === '=' || char === ':') {
        valueStart += 1;
      }
      break;
    }
    valueStart += 1;
  }

  while (valueStart < trimmed.length && isPropertyWhitespace(trimmed[valueStart])) {
    valueStart += 1;
  }

  return {
    key: unescapeJavaProperties(trimmed.slice(0, keyEnd)),
    rawValue: trimmed.slice(valueStart),
  };
}

function extractPropertyValueForKey(line, propertyKey) {
  const parsed = parsePropertyLine(line);
  if (!parsed || parsed.key !== propertyKey) {
    return null;
  }

  return parsed.rawValue;
}

/** @returns {string|null} unescaped XML from a Java .properties / .prefs entry */
export function extractXmlPropertyFromPrefs(rawText, propertyKey) {
  const text = stripBom(rawText);
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return null;
  }

  const logicalLines = joinPropertyContinuations(text);
  for (const line of logicalLines) {
    const rawValue = extractPropertyValueForKey(line, propertyKey);
    if (rawValue == null) continue;
    const xml = unescapeJavaProperties(rawValue).trim();
    if (xml) return xml;
  }

  return null;
}

function extractHostsXmlFromPrefs(rawText) {
  const text = stripBom(rawText);
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return trimmed;
  }

  return extractXmlPropertyFromPrefs(text, PREFS_KEY_SERVERS);
}

/**
 * @returns {{ valid: true, port: number } | { valid: false, error: string }}
 */
export function parseImportPort(value, defaultPort = DEFAULT_IMPORT_PORT) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { valid: true, port: defaultPort };
  }

  if (!/^\d+$/.test(raw)) {
    return { valid: false, error: 'Port must be an integer' };
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < MIN_IMPORT_PORT || port > MAX_IMPORT_PORT) {
    return { valid: false, error: `Port must be ${MIN_IMPORT_PORT}-${MAX_IMPORT_PORT}` };
  }

  return { valid: true, port };
}

function sameConnection(a, b) {
  return (
    String(a.address).trim() === String(b.address).trim() &&
    String(a.port) === String(b.port)
  );
}

function sameAlias(a, b) {
  const left = String(a.alias ?? '').trim();
  const right = String(b.alias ?? '').trim();
  return left !== '' && right !== '' && left === right;
}

/**
 * @returns {string|null} validation error message
 */
export function validateImportHostEntry(entry, { existingHosts = [], batchPeers = [] } = {}) {
  const alias = String(entry.alias ?? '').trim();
  const address = String(entry.address ?? '').trim();
  const id = String(entry.id ?? '').trim();
  const portResult = entry.portNumber != null
    ? { valid: true, port: entry.portNumber }
    : parseImportPort(entry.port);

  if (!alias) return 'Name (alias) is required';
  if (!address) return 'Address is required';
  if (!id) return 'Username is required';
  if (!portResult.valid) return portResult.error;

  const normalized = { alias, address, id, port: portResult.port };

  for (const existing of existingHosts) {
    if (sameConnection(normalized, existing)) {
      return 'Already registered (address + port)';
    }
    if (sameAlias(normalized, existing)) {
      return 'Alias already in use';
    }
  }

  for (const peer of batchPeers) {
    if (peer.rowId != null && peer.rowId === entry.rowId) continue;
    if (sameConnection(normalized, peer)) {
      return 'Duplicate address + port in import file';
    }
    if (sameAlias(normalized, peer)) {
      return 'Duplicate alias in import file';
    }
  }

  return null;
}

export function buildImportPreviewList(parsed, existingHosts) {
  const hosts = Array.isArray(parsed) ? parsed : (parsed?.hosts ?? []);
  const groups = Array.isArray(parsed) ? [] : (parsed?.groups ?? []);
  const hasPrefsGroups = groups.length > 0;

  const legacyIdToGroup = new Map();
  for (const group of groups) {
    const groupName = String(group.name ?? '').trim();
    if (!groupName) continue;
    for (const legacyId of group.legacyHostIds ?? []) {
      const id = String(legacyId ?? '').trim();
      if (id) legacyIdToGroup.set(id, groupName);
    }
  }

  const baseRows = hosts.map((host, index) => {
    const portResult = parseImportPort(host.port);
    return {
      ...host,
      rowId: `import-row-${index}`,
      portNumber: portResult.valid ? portResult.port : null,
      port: portResult.valid ? String(portResult.port) : String(host.port ?? ''),
      password: '',
      importGroupName: legacyIdToGroup.get(String(host.legacyId ?? '').trim()) || '',
      hasPrefsGroups,
    };
  });

  return baseRows.map((row) => {
    const batchPeers = baseRows
      .filter((other) => other.rowId !== row.rowId)
      .map((other) => {
        const peerPort = parseImportPort(other.port);
        return {
          rowId: other.rowId,
          alias: String(other.alias ?? '').trim(),
          address: String(other.address ?? '').trim(),
          port: peerPort.valid ? peerPort.port : other.port,
        };
      });

    const validationError = validateImportHostEntry(row, { existingHosts, batchPeers });

    return {
      ...row,
      validationError,
      isDuplicate: validationError === 'Already registered (address + port)',
      isSelectable: !validationError,
    };
  });
}

/**
 * @returns {{ ok: true } | { ok: false, messages: string[] }}
 */
export function validateSelectedImportRows(rows) {
  const invalid = rows.filter((row) => row.validationError && !row.isDuplicate);
  if (invalid.length === 0) {
    return { ok: true };
  }

  const messages = invalid.map((row) =>
    `${row.alias || row.address || row.rowId}: ${row.validationError}`
  );
  return { ok: false, messages };
}

function parseXmlDocument(xmlString, contextLabel) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error(`Invalid XML in ${contextLabel}. Please select a valid CUBRID Manager file.`);
  }

  return doc;
}

function parseHostsFromXmlString(xmlString) {
  const doc = parseXmlDocument(xmlString, 'host list');

  if (doc.documentElement.nodeName !== 'hosts') {
    throw new Error('Incorrect file format. Expected <hosts> root element.');
  }

  const hostNodes = doc.getElementsByTagName('host');
  if (hostNodes.length === 0) {
    throw new Error('No host connection information found in the selected file.');
  }

  const parsedHosts = [];
  for (let i = 0; i < hostNodes.length; i++) {
    const node = hostNodes[i];
    const address = (node.getAttribute('address') || '').trim();
    if (!address) continue;

    parsedHosts.push({
      legacyId: (node.getAttribute('id') || '').trim(),
      alias: (node.getAttribute('name') || node.getAttribute('id') || address).trim(),
      address,
      port: node.getAttribute('port') || String(DEFAULT_IMPORT_PORT),
      id: (node.getAttribute('user') || 'admin').trim(),
      password: '',
    });
  }

  if (parsedHosts.length === 0) {
    throw new Error('The selected file contains no valid host connections.');
  }

  return parsedHosts;
}

function parseHostGroupsFromXmlString(xmlString) {
  const doc = parseXmlDocument(xmlString, 'host groups');

  const groupNodes = doc.getElementsByTagName('group');
  const groups = [];

  for (let i = 0; i < groupNodes.length; i++) {
    const node = groupNodes[i];
    const name = (node.getAttribute('name') || node.getAttribute('id') || '').trim();
    if (!name) continue;

    const itemNodes = node.getElementsByTagName('item');
    const legacyHostIds = [];
    for (let j = 0; j < itemNodes.length; j++) {
      const legacyId = (itemNodes[j].getAttribute('id') || '').trim();
      if (legacyId) legacyHostIds.push(legacyId);
    }

    groups.push({ name, legacyHostIds });
  }

  return groups;
}

/**
 * Converts the native `{ groups: [{ name, hosts }] }` shape into the
 * `{ hosts, groups }` shape `buildImportPreviewList` already understands —
 * synthesizes a `legacyId` per host so the same name-to-hosts bridging
 * logic used for CA .prefs host groups works unchanged here too.
 */
function groupedPayloadToHostsAndGroups(groupList) {
  const hosts = [];
  const groups = [];
  let counter = 0;

  for (const group of groupList || []) {
    const groupName = String(group.name ?? '').trim();
    const legacyHostIds = [];

    for (const host of group.hosts || []) {
      const address = String(host.address ?? '').trim();
      if (!address) continue;

      const legacyId = `native-${counter++}`;
      hosts.push({
        legacyId,
        alias: String(host.alias ?? '').trim() || address,
        address,
        port: host.port != null ? String(host.port) : String(DEFAULT_IMPORT_PORT),
        id: String(host.id ?? '').trim() || 'admin',
        password: '',
      });
      if (groupName) legacyHostIds.push(legacyId);
    }

    if (groupName && legacyHostIds.length > 0) {
      groups.push({ name: groupName, legacyHostIds });
    }
  }

  return { hosts, groups };
}

/** @returns {{ hosts, groups }|null} parsed native JSON payload, or null if not our native format */
function tryParseNativeJson(input) {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return null;
  }

  if (!data || data.format !== NATIVE_FORMAT_ID || !Array.isArray(data.groups)) {
    return null;
  }

  const parsed = groupedPayloadToHostsAndGroups(data.groups);
  if (parsed.hosts.length === 0) {
    throw new Error('The selected file contains no valid host connections.');
  }
  return parsed;
}

/** @returns {{ hosts, groups }|null} parsed native XML payload, or null if not our native format */
function tryParseNativeXml(input) {
  const doc = parseXmlDocument(input, 'host list');
  if (doc.documentElement.nodeName !== 'cwm-hosts') {
    return null;
  }

  const groupNodes = doc.getElementsByTagName('group');
  const groupList = [];
  for (let i = 0; i < groupNodes.length; i++) {
    const groupNode = groupNodes[i];
    const name = (groupNode.getAttribute('name') || '').trim();
    const hostNodes = groupNode.getElementsByTagName('host');
    const hosts = [];
    for (let j = 0; j < hostNodes.length; j++) {
      const hostNode = hostNodes[j];
      hosts.push({
        alias: hostNode.getAttribute('alias') || '',
        address: hostNode.getAttribute('address') || '',
        port: hostNode.getAttribute('port') || String(DEFAULT_IMPORT_PORT),
        id: hostNode.getAttribute('user') || 'admin',
      });
    }
    groupList.push({ name, hosts });
  }

  const parsed = groupedPayloadToHostsAndGroups(groupList);
  if (parsed.hosts.length === 0) {
    throw new Error('The selected file contains no valid host connections.');
  }
  return parsed;
}

/**
 * Parses host XML or legacy CUBRID desktop .prefs / .properties (servers + host groups).
 * @returns {{ hosts: object[], groups: { name: string, legacyHostIds: string[] }[] }}
 */
export function parseHostsImportFile(rawInput) {
  const input = stripBom(String(rawInput || '')).trim();

  if (input.startsWith('{')) {
    const native = tryParseNativeJson(input);
    if (native) return native;
  }

  if (input.startsWith('<')) {
    const native = tryParseNativeXml(input);
    if (native) return native;
    return { hosts: parseHostsFromXmlString(input), groups: [] };
  }

  const hostsXml = extractHostsXmlFromPrefs(input);
  const groupsXml = extractXmlPropertyFromPrefs(input, PREFS_KEY_HOSTGROUP);

  if (!hostsXml) {
    throw new Error(
      'No CUBRID host XML found. Provide a <hosts> XML or .prefs/.properties with CUBRID_SERVERS.'
    );
  }

  const hosts = parseHostsFromXmlString(hostsXml);
  const groups = groupsXml ? parseHostGroupsFromXmlString(groupsXml) : [];

  return { hosts, groups };
}

/** @returns {object[]} host rows only (legacy callers) */
export const parseHostsXml = (rawInput) => parseHostsImportFile(rawInput).hosts;
