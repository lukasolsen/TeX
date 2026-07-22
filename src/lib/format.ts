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

/** Renders a UNIX timestamp (seconds) as a localized wall-clock time of day. */
export function formatClockTime(timestamp: number): string {
  return new Date(timestamp * 1_000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
