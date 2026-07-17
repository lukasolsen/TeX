import { describe, expect, it } from "vitest"

import { shortcutLabel, shortcutPlatform } from "@/lib/shortcuts"

describe("shortcut labels", () => {
  it("detects Apple platforms", () => {
    expect(shortcutPlatform("MacIntel", "Mozilla/5.0")).toBe("macos")
    expect(shortcutPlatform("Linux x86_64", "Mozilla/5.0")).toBe("other")
  })

  it("uses platform-native modifier labels", () => {
    expect(shortcutLabel(["primary", "shift", "p"], "macos")).toBe("⌘ ⇧ P")
    expect(shortcutLabel(["primary", "shift", "p"], "other")).toBe(
      "Ctrl + Shift + P"
    )
    expect(shortcutLabel(["primary", "shift", "n"], "macos")).toBe("⌘ ⇧ N")
  })
})
