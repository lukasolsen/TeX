import { describe, expect, it } from "vitest"

import {
  createHiddenEntryPredicate,
  defaultHiddenFileRules,
  hiddenFileRuleLabel,
  MAX_HIDDEN_FILE_RULE_LENGTH,
  normalizeHiddenFileRule,
  normalizeHiddenFileRules,
} from "@/domain/file-visibility"

describe("normalizeHiddenFileRule", () => {
  it("reduces the shapes people type for an extension to one form", () => {
    for (const input of ["log", ".log", "*.log", "  .LOG  "]) {
      expect(normalizeHiddenFileRule("extension", input)).toEqual({
        kind: "extension",
        value: "log",
      })
    }
  })

  it("keeps multi-part extensions intact", () => {
    expect(normalizeHiddenFileRule("extension", "*.synctex.gz")).toEqual({
      kind: "extension",
      value: "synctex.gz",
    })
  })

  it("preserves the casing of an exact name but trims it", () => {
    expect(normalizeHiddenFileRule("name", "  Makefile  ")).toEqual({
      kind: "name",
      value: "Makefile",
    })
  })

  it("rejects values that could not name a single entry", () => {
    expect(normalizeHiddenFileRule("name", "")).toBeNull()
    expect(normalizeHiddenFileRule("name", "   ")).toBeNull()
    expect(normalizeHiddenFileRule("name", ".")).toBeNull()
    expect(normalizeHiddenFileRule("name", "..")).toBeNull()
    expect(normalizeHiddenFileRule("name", "build/out.log")).toBeNull()
    expect(normalizeHiddenFileRule("name", "build\\out.log")).toBeNull()
    expect(normalizeHiddenFileRule("extension", ".")).toBeNull()
    expect(
      normalizeHiddenFileRule(
        "name",
        "x".repeat(MAX_HIDDEN_FILE_RULE_LENGTH + 1)
      )
    ).toBeNull()
  })
})

describe("normalizeHiddenFileRules", () => {
  it("drops duplicates that differ only by shape or case", () => {
    expect(
      normalizeHiddenFileRules([
        { kind: "extension", value: "*.log" },
        { kind: "extension", value: "LOG" },
        { kind: "name", value: "log" },
      ])
    ).toEqual([
      { kind: "extension", value: "log" },
      { kind: "name", value: "log" },
    ])
  })

  it("discards entries that cannot be normalized rather than failing", () => {
    expect(
      normalizeHiddenFileRules([
        { kind: "name", value: "a/b" },
        { kind: "extension", value: "aux" },
      ])
    ).toEqual([{ kind: "extension", value: "aux" }])
  })
})

describe("createHiddenEntryPredicate", () => {
  const isHidden = createHiddenEntryPredicate(
    [
      { kind: "extension", value: "log" },
      { kind: "extension", value: "synctex.gz" },
      { kind: "name", value: "Makefile" },
    ],
    true
  )

  it("hides files by extension, including multi-part ones", () => {
    expect(isHidden("main.log")).toBe(true)
    expect(isHidden("main.synctex.gz")).toBe(true)
  })

  it("hides an exact name regardless of case", () => {
    expect(isHidden("Makefile")).toBe(true)
    expect(isHidden("makefile")).toBe(true)
  })

  it("leaves sources alone", () => {
    expect(isHidden("main.tex")).toBe(false)
    expect(isHidden("references.bib")).toBe(false)
  })

  it("does not treat a bare extension as a filename", () => {
    // A file literally called "log" is not a ".log" file.
    expect(isHidden("log")).toBe(false)
  })

  it("shows everything when filtering is switched off", () => {
    const showAll = createHiddenEntryPredicate(defaultHiddenFileRules, false)
    expect(showAll("main.log")).toBe(false)
  })

  it("shows everything when no rules are configured", () => {
    expect(createHiddenEntryPredicate([], true)("main.log")).toBe(false)
  })
})

describe("defaultHiddenFileRules", () => {
  it("covers the latexmk artifacts that used to be filtered in the backend", () => {
    const isHidden = createHiddenEntryPredicate(defaultHiddenFileRules, true)
    for (const name of [
      "main.aux",
      "main.fdb_latexmk",
      "main.fls",
      "main.log",
      "main.run.xml",
      "main.synctex.gz",
      "main.toc",
    ]) {
      expect(isHidden(name)).toBe(true)
    }
    expect(isHidden("main.tex")).toBe(false)
    expect(isHidden("main.pdf")).toBe(false)
    expect(isHidden("references.bib")).toBe(false)
  })

  it("normalizes cleanly, so the shipped defaults contain no duplicates", () => {
    expect(normalizeHiddenFileRules(defaultHiddenFileRules)).toEqual(
      defaultHiddenFileRules
    )
  })
})

describe("hiddenFileRuleLabel", () => {
  it("shows an extension the way it appears in a file name", () => {
    expect(hiddenFileRuleLabel({ kind: "extension", value: "log" })).toBe(
      ".log"
    )
    expect(hiddenFileRuleLabel({ kind: "name", value: "main.aux" })).toBe(
      "main.aux"
    )
  })
})
