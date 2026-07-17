export type WindowChromeMode = "macos-native" | "custom-controls"

/** Selects the control treatment while leaving visual styling shared. */
export function windowChromeMode(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): WindowChromeMode {
  return /Mac|iPhone|iPad|iPod/i.test(`${platform} ${userAgent}`)
    ? "macos-native"
    : "custom-controls"
}
