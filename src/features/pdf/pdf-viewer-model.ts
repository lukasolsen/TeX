/** Normalizes PDF.js's nullable outline response at the library boundary. */
export function normalizePdfOutline<T>(outline: readonly T[] | null): T[] {
  return outline === null ? [] : [...outline]
}
