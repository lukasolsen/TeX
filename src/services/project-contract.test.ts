import { describe, expect, it } from "vitest"

import { defaultAppPreferences } from "@/domain/preferences"
import {
  parseAppPreferences,
  parseForwardSearchResult,
  parseProjectSummary,
  parseReplaceResponse,
  parseSourceDocument,
} from "@/services/project-contract"

describe("project IPC contracts", () => {
  it("accepts a bounded source document with a coherent revision", () => {
    expect(
      parseSourceDocument({
        path: "main.tex",
        content: "content",
        byteLength: 7,
        revision: {
          byteLength: 7,
          contentHash: "a".repeat(64),
        },
      })
    ).toMatchObject({ path: "main.tex", byteLength: 7 })
  })

  it("rejects malformed hashes and incoherent revision lengths", () => {
    expect(() =>
      parseSourceDocument({
        path: "main.tex",
        content: "content",
        byteLength: 7,
        revision: { byteLength: 6, contentHash: "not-a-hash" },
      })
    ).toThrow("invalid source hash")
  })

  it("rejects project trees beyond the Rust depth contract", () => {
    let tree: unknown = { name: "leaf", kind: "file", children: [] }
    for (let depth = 0; depth < 15; depth += 1) {
      tree = { name: `level-${depth}`, kind: "directory", children: [tree] }
    }
    expect(() =>
      parseProjectSummary({
        name: "Project",
        path: "/project",
        tree,
        rootCandidates: [],
        rootDetectionNote: null,
        persistenceNote: null,
      })
    ).toThrow("invalid project tree")
  })

  it("rejects non-finite SyncTeX coordinates and malformed transactions", () => {
    expect(() =>
      parseForwardSearchResult({ page: 1, x: Number.NaN, y: 2 })
    ).toThrow("invalid SyncTeX x coordinate")
    expect(() =>
      parseReplaceResponse({
        transactionId: "abc",
        changedFiles: 1,
        replacedMatches: 1,
      })
    ).toThrow("invalid replace transaction")
  })

  it("round-trips a full preference set", () => {
    const parsed = parseAppPreferences({
      appearance: {
        colorTheme: "dark",
        accentColor: "#2563EB",
        interfaceScale: "compact",
      },
      editor: { fontFamily: "Fira Code", indentStyle: "tabs", indentWidth: 4 },
      assistance: { completionOnTyping: false, hoverDelay: 500 },
      build: { saveBeforeBuild: false },
      pdf: { defaultZoom: 1.5, defaultLayout: "single" },
      files: {
        hideFilteredFiles: true,
        hiddenFileRules: [
          { kind: "extension", value: "log" },
          { kind: "name", value: "Makefile" },
        ],
      },
    })
    expect(parsed.appearance).toEqual({
      colorTheme: "dark",
      accentColor: "#2563eb",
      interfaceScale: "compact",
    })
    expect(parsed.editor.fontFamily).toBe("Fira Code")
    expect(parsed.editor.indentStyle).toBe("tabs")
    expect(parsed.editor.indentWidth).toBe(4)
    expect(parsed.assistance.completionOnTyping).toBe(false)
    expect(parsed.assistance.hoverDelay).toBe(500)
    expect(parsed.build.saveBeforeBuild).toBe(false)
    expect(parsed.pdf).toEqual({
      defaultZoom: 1.5,
      defaultLayout: "single",
      defaultSidebar: "none",
    })
    expect(parsed.files.hiddenFileRules).toEqual([
      { kind: "extension", value: "log" },
      { kind: "name", value: "Makefile" },
    ])
  })

  it("drops the retired custom theme in favour of the default scheme", () => {
    // The accent it used to carry now applies whatever the scheme is.
    const parsed = parseAppPreferences({
      appearance: { colorTheme: "custom", accentColor: "#7c3aed" },
    })
    expect(parsed.appearance.colorTheme).toBe("system")
    expect(parsed.appearance.accentColor).toBe("#7c3aed")
  })

  it("falls back to the default for a single unreadable preference", () => {
    const parsed = parseAppPreferences({
      appearance: { colorTheme: "dark", accentColor: "#zzzzzz" },
      editor: { indentWidth: 999, fontFamily: "Menlo; url(x)" },
      assistance: { completionLimit: "many" },
    })
    expect(parsed.appearance.colorTheme).toBe("dark")
    expect(parsed.appearance.accentColor).toBe(
      defaultAppPreferences.appearance.accentColor
    )
    expect(parsed.editor.indentWidth).toBe(
      defaultAppPreferences.editor.indentWidth
    )
    expect(parsed.editor.fontFamily).toBe("")
    expect(parsed.assistance.completionLimit).toBe(
      defaultAppPreferences.assistance.completionLimit
    )
  })

  it("reads a state file written before preferences were grouped", () => {
    const parsed = parseAppPreferences({})
    expect(parsed).toEqual(defaultAppPreferences)
  })

  it("drops hidden file rules that could escape a single entry name", () => {
    expect(
      parseAppPreferences({
        files: {
          hiddenFileRules: [
            { kind: "name", value: "../secrets" },
            { kind: "extension", value: "*.LOG" },
          ],
        },
      }).files.hiddenFileRules
    ).toEqual([{ kind: "extension", value: "log" }])
  })
})
