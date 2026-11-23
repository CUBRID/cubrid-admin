import { confContextAt } from './confContext';
import { confParams, confSectionNames, describeGuard, paramHintDom } from './confParams';

// Parameter lists are built once per file kind and schema payload.
const paramCache = new WeakMap();
export function paramsFor(kind, paramSchemas) {
  if (!paramSchemas) return confParams(kind, null);
  let byKind = paramCache.get(paramSchemas);
  if (!byKind) paramCache.set(paramSchemas, (byKind = {}));
  return (byKind[kind] ??= confParams(kind, paramSchemas));
}

const VALUE_CHARS = /^[\w@%.:-]*/;

/**
 * Completion for a conf file: section names in `[...]`, parameter names for
 * the section, and enum/boolean values. The chosen word replaces the whole
 * word at the cursor, also the part after it (`ye|s` -> `yes`, not `yess`;
 * `max_cli|nt=100` -> `max_clients=100`), and a key that already has an `=`
 * gets only its name (`cubrid_po|=1523` -> `cubrid_port_id=1523`).
 *
 * @param ctx () => ({ CM, kind, paramSchemas }), read on every completion
 */
export function confCompletionSource(ctx) {
  return (context) => {
    const { CM: L, kind, paramSchemas } = ctx();
    const where = confContextAt(context.state.doc, context.pos);
    if (where.place === 'comment') return null;
    if (!context.explicit && !where.text && where.place !== 'heading') return null;
    const line = context.state.doc.lineAt(context.pos);
    const after = line.text.slice(context.pos - line.from);
    const params = paramsFor(kind, paramSchemas);
    let options;
    let rest;
    if (where.place === 'heading') {
      rest = /^[^\]\s]*/.exec(after)[0];
      options = confSectionNames(kind).map((label) => ({ label, type: 'namespace' }));
    } else if (where.place === 'key') {
      rest = /^[^\s=]*/.exec(after)[0];
      const hasEquals = /^\s*=/.test(after.slice(rest.length));
      options = params.forSection(where.section).map((param) => ({
        label: param.name,
        type: 'property',
        detail: describeGuard(L, param.guard),
        // A function here must return a DOM node, not a string.
        info: () => paramHintDom(L, param, false),
        apply: hasEquals ? param.name : `${param.name}=`,
      }));
    } else {
      rest = VALUE_CHARS.exec(after)[0];
      const guard = params.get(where.key, where.section)?.guard;
      const words = guard?.kind === 'enum' ? guard.options : guard?.kind === 'boolean' ? ['yes', 'no'] : [];
      options = words.map((label) => ({ label, type: 'enum' }));
    }
    return options.length ? { from: where.from, to: context.pos + rest.length, options, validFor: /^[\w@%.:-]*$/ } : null;
  };
}
