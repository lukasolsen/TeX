import { describe, expect, it } from "vitest"

import { windowChromeMode } from "./window-chrome-model"

describe("window chrome mode", () => {
  it("keeps the native macOS traffic lights", () => {
    expect(windowChromeMode("MacIntel", "Mozilla/5.0")).toBe("macos-native")
  })

  it("uses custom window controls on Windows and Linux", () => {
    expect(windowChromeMode("Win32", "Mozilla/5.0")).toBe("custom-controls")
    expect(windowChromeMode("Linux x86_64", "Mozilla/5.0")).toBe(
      "custom-controls"
    )
  })
})
