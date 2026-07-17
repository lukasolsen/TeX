import { describe, expect, it } from "vitest"

import * as windowChromeModel from "./window-chrome-model"
import {
  shouldRestoreStartupWorkspace,
  windowChromeMode,
  windowMenuLabels,
} from "./window-chrome-model"

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

  it("uses the conventional IDE menu architecture", () => {
    expect(windowMenuLabels()).toEqual([
      "File",
      "Edit",
      "View",
      "Search",
      "Build",
      "Window",
      "Help",
    ])
  })

  it("defines the centered command palette control", () => {
    expect(windowChromeModel).toHaveProperty("windowChromeCommandCenter", {
      label: "Commands",
    })
  })

  it("keeps secondary windows on the project home screen", () => {
    expect(shouldRestoreStartupWorkspace("main")).toBe(true)
    expect(shouldRestoreStartupWorkspace("tex-window-2")).toBe(false)
  })
})
