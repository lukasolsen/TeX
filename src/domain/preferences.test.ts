import { describe, expect, it } from "vitest"

import {
  defaultAppPreferences,
  editorFontStack,
  fallbackEditorFontStack,
  indentUnitText,
  isEditorFontFamily,
  MAX_COMPLETION_LIMIT,
  MAX_INDENT_WIDTH,
  MIN_HOVER_DELAY,
  normalizeAppPreferences,
  resetPreferenceSection,
  type AppPreferences,
} from "@/domain/preferences"

function withOverrides(overrides: {
  [Section in keyof AppPreferences]?: Partial<AppPreferences[Section]>
}): AppPreferences {
  return {
    ...defaultAppPreferences,
    appearance: {
      ...defaultAppPreferences.appearance,
      ...overrides.appearance,
    },
    editor: { ...defaultAppPreferences.editor, ...overrides.editor },
    assistance: {
      ...defaultAppPreferences.assistance,
      ...overrides.assistance,
    },
    build: { ...defaultAppPreferences.build, ...overrides.build },
    pdf: { ...defaultAppPreferences.pdf, ...overrides.pdf },
    files: { ...defaultAppPreferences.files, ...overrides.files },
  }
}

describe("normalizeAppPreferences", () => {
  it("clamps every numeric preference into its supported range", () => {
    const normalized = normalizeAppPreferences(
      withOverrides({
        editor: { indentWidth: 40 },
        assistance: { completionLimit: 5_000, hoverDelay: 0 },
        pdf: { defaultZoom: 99 },
      })
    )
    expect(normalized.editor.indentWidth).toBe(MAX_INDENT_WIDTH)
    expect(normalized.assistance.completionLimit).toBe(MAX_COMPLETION_LIMIT)
    expect(normalized.assistance.hoverDelay).toBe(MIN_HOVER_DELAY)
    expect(normalized.pdf.defaultZoom).toBe(5)
  })

  it("replaces a malformed accent colour with the default", () => {
    const normalized = normalizeAppPreferences(
      withOverrides({ appearance: { accentColor: "rebeccapurple" } })
    )
    expect(normalized.appearance.accentColor).toBe(
      defaultAppPreferences.appearance.accentColor
    )
  })

  it("drops an editor font family that could escape the CSS declaration", () => {
    const normalized = normalizeAppPreferences(
      withOverrides({ editor: { fontFamily: "Menlo; background: url(x)" } })
    )
    expect(normalized.editor.fontFamily).toBe("")
  })

  it("de-duplicates hidden file rules", () => {
    const normalized = normalizeAppPreferences(
      withOverrides({
        files: {
          hiddenFileRules: [
            { kind: "extension", value: ".LOG" },
            { kind: "extension", value: "log" },
          ],
        },
      })
    )
    expect(normalized.files.hiddenFileRules).toEqual([
      { kind: "extension", value: "log" },
    ])
  })
})

describe("resetPreferenceSection", () => {
  it("restores one section and leaves the rest alone", () => {
    const changed = withOverrides({
      editor: { wrapLines: true },
      build: { saveBeforeBuild: false },
    })
    const reset = resetPreferenceSection(changed, "editor")
    expect(reset.editor).toEqual(defaultAppPreferences.editor)
    expect(reset.build.saveBeforeBuild).toBe(false)
  })
})

describe("editorFontStack", () => {
  it("falls back to the platform stack when no family is configured", () => {
    expect(editorFontStack("")).toBe(fallbackEditorFontStack)
  })

  it("keeps the platform stack as a fallback behind a configured family", () => {
    expect(editorFontStack("Fira Code")).toBe(
      `Fira Code, ${fallbackEditorFontStack}`
    )
  })

  it("ignores a family that is not a plain font name", () => {
    expect(editorFontStack("Menlo</style>")).toBe(fallbackEditorFontStack)
    expect(isEditorFontFamily("Menlo</style>")).toBe(false)
  })
})

describe("indentUnitText", () => {
  it("uses a tab character for tab indentation regardless of width", () => {
    expect(indentUnitText("tabs", 4)).toBe("\t")
  })

  it("uses the configured number of spaces otherwise", () => {
    expect(indentUnitText("spaces", 4)).toBe("    ")
    expect(indentUnitText("spaces", 99)).toBe(" ".repeat(MAX_INDENT_WIDTH))
  })
})
