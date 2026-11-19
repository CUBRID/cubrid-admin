/**
 * The parameters one conf file takes, from the host's resolved schemas
 * (getEnv paramSchemas): the hand-kept schema entries (default, value rule,
 * which section) and the engine catalog's full key list and value rules.
 * Files never share a list: cubrid.conf from `database` and the database
 * keys, cubrid_broker.conf from `broker` and the broker keys, cm.conf from
 * `cm` only.
 *
 * Names are case-insensitive in all three readers (system_parameter.c
 * intl_mbs_casecmp, broker_config.c strcasecmp, CMS's cm.conf reader), so
 * a name is looked up lowercased and offered in the case its file uses:
 * cubrid.conf lowercase, broker keys upper case, cm.conf as listed.
 *
 * @param {'cubridconf'|'brokerconf'|'cmconf'} kind
 * @returns {{ get: (name: string, section?: string|null) => object|undefined,
 *   forSection: (section: string|null) => object[] }}
 *   each param: { name, guard, default, scope, deprecated, place }
 *   `place`: 'service' ([service] only), 'common' ([broker] only),
 *   'instance' ([%name] only) or 'any'.
 */
export function confParams(kind, paramSchemas) {
  const params = new Map();
  const add = (name, info) => params.set(`${info.place === 'service' ? 'service::' : ''}${name.toLowerCase()}`, { name, ...info });
  const known = paramSchemas?.knownKeys;

  if (kind === 'cubridconf') {
    const entries = new Map((paramSchemas?.database ?? []).map((entry) => [entry.key.toLowerCase(), entry]));
    const deprecated = new Set(known?.databaseDeprecated ?? []);
    const keys = known?.database ?? [...entries.keys()];
    for (const raw of keys) {
      const key = raw.toLowerCase();
      const service = key.startsWith('service::');
      const name = service ? key.slice('service::'.length) : key;
      const entry = entries.get(key);
      add(name, {
        place: service ? 'service' : 'any',
        guard: entry?.guard ?? known?.databaseGuards?.[key],
        default: entry?.default,
        scope: known?.databaseScopes?.[key] ?? entry?.scope,
        deprecated: deprecated.has(key),
      });
    }
  } else if (kind === 'brokerconf') {
    const entries = new Map((paramSchemas?.broker ?? []).map((entry) => [entry.key.toLowerCase(), entry]));
    const keys = new Set([...(known?.broker ?? []).map((k) => k.toLowerCase()), ...entries.keys()]);
    for (const key of keys) {
      const entry = entries.get(key);
      add(key.toUpperCase(), {
        place: entry?.commonOnly ? 'common' : entry?.instanceOnly ? 'instance' : 'any',
        guard: entry?.guard ?? known?.brokerGuards?.[key.toUpperCase()],
        default: entry?.default,
      });
    }
  } else {
    for (const entry of paramSchemas?.cm ?? []) {
      add(entry.key, { place: 'any', guard: entry.guard, default: entry.default });
    }
  }

  const fits = (param, section) => {
    if (kind === 'cubridconf') return (section === 'service') === (param.place === 'service');
    if (kind === 'brokerconf') {
      if (section === 'broker') return param.place === 'common' || param.place === 'any';
      return param.place !== 'common';
    }
    return true;
  };
  return {
    get: (name, section = null) => params.get(`${kind === 'cubridconf' && section === 'service' ? 'service::' : ''}${name.toLowerCase()}`),
    forSection: (section) => [...params.values()].filter((param) => fits(param, section)),
  };
}

/** Section names to offer after `[`: the fixed ones of the file, then `@`/`%` for a database or broker. */
export function confSectionNames(kind) {
  if (kind === 'cubridconf') return ['common', 'service', 'standalone', '@'];
  if (kind === 'brokerconf') return ['broker', '%'];
  return [];
}

// A byte count in the unit that reads best: the largest unit it reaches
// ("512M"). When that unit does not divide it, the rounded value comes
// first and the exact one after it, in the largest unit that divides it
// (bytes if none), e.g. "about 1.98M (2,080,769)", "about 32T (34,359,738,352K)".
const fmtBytes = (L, value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const units = [['T', 1024 ** 4], ['G', 1024 ** 3], ['M', 1024 ** 2], ['K', 1024]];
  const near = units.find(([, size]) => n >= size);
  if (!near) return String(n);
  if (n % near[1] === 0) return `${n / near[1]}${near[0]}`;
  const exact = units.find(([, size]) => n % size === 0);
  const exactText = exact ? `${(n / exact[1]).toLocaleString('en-US')}${exact[0]}` : n.toLocaleString('en-US');
  return L.approx(`${Number((n / near[1]).toFixed(2))}${near[0]}`, exactText);
};

/**
 * What a value rule allows, in the UI language: the kind of value and its
 * range, e.g. "Integer, 1 to 100". undefined for a rule with nothing to say.
 */
export function describeGuard(CM, guard) {
  if (!guard) return undefined;
  const L = CM.confHint;
  const range = (min, max, fmt = String) => {
    if (min != null && max != null) return L.between(fmt(min), fmt(max));
    if (min != null) return L.atLeast(fmt(min));
    if (max != null) return L.atMost(fmt(max));
    return null;
  };
  const withRange = (kindText, r) => (r ? `${kindText}, ${r}` : kindText);
  switch (guard.kind) {
    case 'boolean': return L.boolean;
    case 'enum': {
      const words = guard.options.join(' / ');
      return guard.numericRange ? `${words} (${L.orInteger(range(guard.numericRange.min, guard.numericRange.max))})` : words;
    }
    case 'int': return withRange(guard.base === 16 ? L.hexInteger : L.integer, range(guard.min, guard.max));
    case 'float': return withRange(L.decimal, range(guard.min, guard.max));
    case 'bigint': return withRange(L.integer, range(guard.min, guard.max));
    case 'intList': return L.intList;
    case 'size': return withRange(L.size, range(guard.min, guard.max, (v) => fmtBytes(L, v)));
    case 'brokerSize': {
      if (guard.exactKb) return withRange(L.brokerSize(guard.defaultUnit), L.oneOf(guard.exactKb.map((kb) => `${kb}K`).join(', ')));
      return withRange(L.brokerSize(guard.defaultUnit), range(guard.minKb, guard.maxKb, (kb) => fmtBytes(L, Number(kb) * 1024)));
    }
    case 'brokerTime': return withRange(L.brokerTime, range(guard.minSec, guard.maxSec, (s) => `${s}s`));
    case 'time': return withRange(L.time, range(guard.min, guard.max, (ms) => `${ms}ms`));
    case 'cmsMegabytes': return withRange(L.cmsMegabytes, range(guard.min, guard.max));
    case 'string': return guard.nonEmpty ? L.nonEmptyString : L.string;
    case 'opaque': return L.opaque;
    default: return undefined;
  }
}

/** The lines of a parameter's hint: value rule, default, scope, where it goes. */
export function paramHintLines(CM, param) {
  const L = CM.confHint;
  return [
    describeGuard(CM, param.guard),
    param.default != null && param.default !== '' ? `${L.defaultLabel}: ${param.default}` : null,
    param.scope ? `${L.scopeLabel}: ${param.scope}` : null,
    param.place === 'common' ? L.brokerSectionOnly : null,
    param.place === 'instance' ? L.instanceSectionOnly : null,
    param.deprecated ? L.deprecated : null,
  ].filter(Boolean);
}

/**
 * The hint as DOM, for the hover tooltip (with the name) and the completion
 * side panel (without it; null when there is nothing to say). CodeMirror
 * takes a DOM node from these, not a string.
 */
export function paramHintDom(CM, param, withName) {
  const lines = paramHintLines(CM, param);
  if (!withName && lines.length === 0) return null;
  const dom = document.createElement('div');
  dom.className = 'cm-conf-hint';
  if (withName) {
    const name = document.createElement('b');
    name.textContent = param.name;
    dom.append(name);
  }
  for (const line of lines) {
    const row = document.createElement('div');
    row.textContent = line;
    dom.append(row);
  }
  return dom;
}
