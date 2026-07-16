export type ShortcutPlatform = "macos" | "other"

export type ShortcutKey =
  | "primary"
  | "shift"
  | "alt"
  | "enter"
  | "backspace"
  | "b"
  | "f"
  | "p"
  | "s"
  | "/"

export function shortcutPlatform(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): ShortcutPlatform {
  return /Mac|iPhone|iPad|iPod/i.test(`${platform} ${userAgent}`)
    ? "macos"
    : "other"
}

export function shortcutLabel(
  keys: readonly ShortcutKey[],
  platform = shortcutPlatform()
): string {
  const labels = keys.map((key) => {
    if (key === "primary") return platform === "macos" ? "⌘" : "Ctrl"
    if (key === "shift") return platform === "macos" ? "⇧" : "Shift"
    if (key === "alt") return platform === "macos" ? "⌥" : "Alt"
    if (key === "enter") return platform === "macos" ? "↩" : "Enter"
    if (key === "backspace") return platform === "macos" ? "⌫" : "Backspace"
    return key.toUpperCase()
  })
  return platform === "macos" ? labels.join(" ") : labels.join(" + ")
}
