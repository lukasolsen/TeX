/**
 * Clamps `value` into the inclusive range `[minimum, maximum]`. A non-finite
 * value (`NaN`, `±Infinity`) yields `minimum`, so callers validating untrusted
 * persisted state or possibly-empty numbers always get a defined result inside
 * the range.
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

/** Clamps like {@link clamp} and rounds the result to the nearest integer. */
export function clampInt(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.round(clamp(value, minimum, maximum))
}
