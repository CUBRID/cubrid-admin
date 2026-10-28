import { ParamSchemaEntry } from './param-schema-entry';
import { validateParamValue } from './validate-param-value';
import type { ConfTextProblem } from './validate-conf-text';

export interface CmConfEntry {
  key: string;
  value: string;
  lineNo: number;
}

// CMS copies key and value into char[128] buffers (strcpy_limit).
const CMS_MAX_TOKEN = 127;

/**
 * Reads cm.conf the way CMS's uReadSystemConfig does: trim; skip empty
 * and '#' lines; key = first token split on space/tab/'='; value = the
 * rest with one leading '=' dropped, trimmed. A line with no value
 * (including `[cm]`) is skipped by CMS — returned in `skipped`.
 */
export function parseCmConfText(input: string | string[]): { entries: CmConfEntry[]; skipped: CmConfEntry[] } {
  const lines = Array.isArray(input) ? input : input.split('\n');
  const entries: CmConfEntry[] = [];
  const skipped: CmConfEntry[] = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
    if (line === '' || line.startsWith('#')) return;
    const keyMatch = /^[^ \t=]+/.exec(line.replace(/^[ \t=]+/, ''));
    if (!keyMatch) return;
    const key = keyMatch[0];
    const afterKey = line.replace(/^[ \t=]+/, '').slice(key.length);
    // strtok consumed exactly one separator after the key.
    let value = afterKey.slice(1).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
    if (value.startsWith('=')) value = value.slice(1).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
    (value === '' ? skipped : entries).push({ key, value, lineNo: i + 1 });
  });
  return { entries, skipped };
}

export interface CmConfSchemas {
  schema: ParamSchemaEntry[];
  /** Keys only some CMS builds read (CM_PENDING_PARAM_SCHEMA) — checked as warnings. */
  pending?: ParamSchemaEntry[];
  /** Template-only keys no CMS code reads (CM_TEMPLATE_ONLY_KEYS). */
  templateOnly?: string[];
}

/**
 * Validates cm.conf text against the resolved cm schema. Values outside a
 * key's rules and keys CMS does not know are errors (CMS would silently
 * ignore or replace them, so the edit would not do what it says); keys
 * from the pending (develop-only) list and template-only keys are warnings.
 */
export function validateCmConfText(input: string | string[], { schema, pending = [], templateOnly = [] }: CmConfSchemas): ConfTextProblem[] {
  const { entries, skipped } = parseCmConfText(input);
  const lookup = (list: ParamSchemaEntry[], key: string) => {
    const lower = key.toLowerCase();
    return list.find((e) => e.key.toLowerCase() === lower || (e.aliases ?? []).some((a) => a.toLowerCase() === lower));
  };
  const problems: ConfTextProblem[] = [];

  for (const { key, lineNo } of skipped) {
    if (key.startsWith('[')) continue;
    if (lookup(schema, key) || lookup(pending, key)) {
      problems.push({ lineNo, key, message: `${key} — has no value; CMS skips this line.` });
    }
  }

  for (const { key, value, lineNo } of entries) {
    if (key.startsWith('[')) continue;
    const entry = lookup(schema, key);
    const pendingEntry = entry ? undefined : lookup(pending, key);
    if (!entry && !pendingEntry) {
      if (templateOnly.some((k) => k.toLowerCase() === key.toLowerCase())) {
        problems.push({ lineNo, key, severity: 'warning', message: `${key} — not read by CMS; this line has no effect.` });
      } else {
        problems.push({ lineNo, key, message: `${key} — not a cm.conf parameter; CMS ignores unknown keys, so this setting would have no effect. Check the spelling.` });
      }
      continue;
    }
    if (key.length > CMS_MAX_TOKEN || value.length > CMS_MAX_TOKEN) {
      problems.push({ lineNo, key, message: `${key} — longer than ${CMS_MAX_TOKEN} characters; CMS truncates it.` });
      continue;
    }
    const target = (entry ?? pendingEntry) as ParamSchemaEntry;
    const reason = validateParamValue(target.guard, value);
    if (!reason) continue;
    problems.push(pendingEntry
      ? { lineNo, key, severity: 'warning', message: `${key} — ${reason} (read only by CMS builds from develop/feature-webmanager, which then fall back to the default).` }
      : { lineNo, key, message: `${key} — ${reason}` });
  }
  return problems.sort((a, b) => (a.lineNo ?? 0) - (b.lineNo ?? 0));
}
