/** Renders a byte count the way a file listing does: one decimal, binary units. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/** Renders an elapsed duration in whole seconds as `m:ss`. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

/** Renders a UNIX timestamp in milliseconds as a localized wall-clock time. */
export function formatClockTime(millis: number): string {
  return new Date(millis).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * Renders how long a build took. Sub-second precision below a minute, because
 * that is the range most builds land in and "0:02" hides the difference
 * between a fast build and a slow one.
 */
export function formatElapsed(millis: number): string {
  if (millis < 1_000) return `${Math.max(millis, 0)} ms`
  const seconds = millis / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return formatDuration(Math.round(seconds))
}
