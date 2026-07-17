export type WindowChromeMode = "macos-native" | "custom-controls"

const menuLabels = [
  "File",
  "Edit",
  "View",
  "Search",
  "Build",
  "Window",
  "Help",
] as const

/** Returns the stable top-level menu order shared by all desktop platforms. */
export function windowMenuLabels(): readonly string[] {
  return menuLabels
}

/** Secondary windows intentionally begin at project home instead of restoring another window's workspace. */
export function shouldRestoreStartupWorkspace(windowLabel: string): boolean {
  return !windowLabel.startsWith("tex-window-")
}

/** Selects the control treatment while leaving visual styling shared. */
export function windowChromeMode(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): WindowChromeMode {
  return /Mac|iPhone|iPad|iPod/i.test(`${platform} ${userAgent}`)
    ? "macos-native"
    : "custom-controls"
}
