import { ParamSchemaEntry } from './param-schema-entry';
import { parseConfText } from './parse-conf-text';
import { validateEffectiveParams } from './validate-effective-params';
import { EngineKnownKeys } from './engine-known-keys';
import { DEPRECATED_PARAM_REPLACEMENTS } from './deprecated-param-replacements';
import { validateCmConfText } from './validate-cm-conf-text';
import { CM_PENDING_PARAM_SCHEMA, CM_TEMPLATE_ONLY_KEYS } from './cm-unreleased-keys';

export type ConfFileKind = 'cubridconf' | 'brokerconf' | 'cmconf';

export interface ConfTextProblem {
  lineNo?: number;
  key?: string;
  message: string;
  /** `warning` never blocks a save; everything else does. */
  severity?: 'error' | 'warning';
}

const COMMON_SECTION: Record<Exclude<ConfFileKind, 'cmconf'>, string> = { cubridconf: 'common', brokerconf: 'broker' };

/**
 * Validates a whole hand-edited cubrid.conf / cubrid_broker.conf / cm.conf text —
 * the raw text editors' save check (client) and its server-side re-check
 * both run this, so the two can't drift. Parses with the engine's own
 * INI rules (`parseConfText`), then checks every key against the
 * engine's own key list (`knownKeys`, when given) and every section
 * independently through `validateEffectiveParams`.
 */
export function validateConfText(
  schema: ParamSchemaEntry[],
  input: string | string[],
  kind: ConfFileKind,
  knownKeys?: EngineKnownKeys
): ConfTextProblem[] {
  // cm.conf is read by CMS with its own line reader, not the engine's INI
  // parser, and has no sections (see validate-cm-conf-text.ts).
  if (kind === 'cmconf') {
    return validateCmConfText(input, { schema, pending: CM_PENDING_PARAM_SCHEMA, templateOnly: CM_TEMPLATE_ONLY_KEYS });
  }
  const { sections, syntaxErrors } = parseConfText(input);
  const problems: ConfTextProblem[] = syntaxErrors.map(({ lineNo, message }) => ({ lineNo, message }));
  const commonSection = COMMON_SECTION[kind];
  const schemaByKey = new Map(schema.map((entry) => [entry.key.toLowerCase(), entry]));

  const known = knownKeys && new Set(kind === 'cubridconf' ? knownKeys.database : knownKeys.broker);
  const deprecated = new Set(kind === 'cubridconf' ? knownKeys?.databaseDeprecated ?? [] : []);
  for (const section of sections) {
    if (known) {
      for (const { key, lineNo } of section.entries) {
        // cubrid.conf's [service] keys are looked up as "service::<key>"
        // (prm_load_by_section with ignore_section=false), so a normal
        // parameter there is unknown, and `server=`/`service=` anywhere
        // else is too.
        const lookup = kind === 'cubridconf' && section.name === 'service' ? `service::${key}` : key;
        if (known.has(lookup.toLowerCase())) {
          // The engine loads a deprecated key but reports it (PRM_ERR_DEPRICATED).
          if (deprecated.has(lookup.toLowerCase())) {
            const replacedBy = DEPRECATED_PARAM_REPLACEMENTS[lookup.toLowerCase()];
            problems.push({ lineNo, key, severity: 'warning', message: `[${section.name ?? commonSection}] ${key} — deprecated${replacedBy ? `; use ${replacedBy} instead` : ''}.` });
          }
          continue;
        }
        problems.push(knownKeys.strict
          ? { lineNo, key, message: `[${section.name ?? commonSection}] ${key} — not a parameter of CUBRID ${knownKeys.catalogVersion}; the engine refuses to load a file with an unknown key.` }
          : { lineNo, key, severity: 'warning', message: `[${section.name ?? commonSection}] ${key} — not found in any catalogued engine version close to this host's; the engine refuses to load a file with an unknown key, so check the spelling.` });
      }
    }
    const isCommonSection = section.name === null || section.name === commonSection;
    const sectionValues: Record<string, string> = {};
    const sectionLineNos: Record<string, number> = {};
    // Keys the schema doesn't cover still get the engine's own type rules
    // (from the catalog) so an empty or unparsable value isn't saved.
    const generated: ParamSchemaEntry[] = [];
    for (const { key, value, lineNo } of section.entries) {
      let entry = schemaByKey.get(key.toLowerCase());
      if (!entry && kind === 'cubridconf' && section.name !== 'service') {
        const guard = knownKeys?.databaseGuards?.[key.toLowerCase()];
        if (guard) {
          entry = { key: key.toLowerCase(), category: 'advanced', guard };
          generated.push(entry);
        }
      }
      if (!entry) continue;
      sectionValues[entry.key] = value;
      sectionLineNos[entry.key] = lineNo;
    }
    const generatedKeys = new Set(generated.map((e) => e.key));
    const sectionErrors = validateEffectiveParams([...schema, ...generated], sectionValues, {
      isCommonSection,
      commonSectionLabel: commonSection,
      emptyValueIsError: true,
      emptyIntIsZero: kind === 'brokerconf',
      sysprmKeywords: kind === 'cubridconf',
      skipSectionPlacement: kind === 'cubridconf' && section.name !== null && (section.name === 'standalone' || section.name.startsWith('%')),
    });
    for (const [key, reason] of Object.entries(sectionErrors)) {
      const lineNo = sectionLineNos[key] ?? section.lineNo;
      const lenient = generatedKeys.has(key) && !knownKeys?.strict;
      problems.push({ lineNo, key, message: `[${section.name ?? commonSection}] ${key} — ${reason}`, ...(lenient ? { severity: 'warning' as const } : {}) });
    }
  }

  // broker_config.c reads MASTER_SHM_ID from [broker] and fails the whole
  // load when it's 0 — which is also what a missing [broker] section
  // yields. The per-section checks above never see a section that isn't there.
  if (kind === 'brokerconf' && !sections.some((s) => s.name === commonSection)) {
    problems.push({ message: `Missing [${commonSection}] section — the broker cannot start without it (MASTER_SHM_ID).` });
  }

  return problems.sort((a, b) => (a.lineNo ?? 0) - (b.lineNo ?? 0));
}

export function formatConfTextProblem({ lineNo, message }: ConfTextProblem): string {
  return lineNo ? `Line ${lineNo}: ${message}` : message;
}

export const isBlockingConfTextProblem = (problem: ConfTextProblem) => problem.severity !== 'warning';
