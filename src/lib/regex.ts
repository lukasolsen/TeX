/**
 * Escapes every regular-expression metacharacter in `value` so it can be
 * embedded in a `RegExp` and matched literally. Callers building a pattern from
 * user input use this to keep the input from being interpreted as syntax.
 */
export function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
