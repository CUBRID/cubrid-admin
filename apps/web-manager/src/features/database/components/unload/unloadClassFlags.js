/**
 * unloaddb's -ir and --input-class-only for the chosen tables. The engine
 * ignores -ir next to --input-class-only (unloaddb.c), so with referenced
 * tables included the class-only flag is left off: the referenced tables'
 * data comes along, and the schema file then holds every table.
 */
export function unloadClassFlags({ schemaScope, includeReferencedTables }) {
  if (schemaScope === 'all') return { ref: 'no', classonly: 'no' };
  if (schemaScope === 'selected' && includeReferencedTables) return { ref: 'yes', classonly: 'no' };
  return { ref: 'no', classonly: 'yes' };
}
