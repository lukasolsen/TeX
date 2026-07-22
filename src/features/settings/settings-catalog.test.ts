import { describe, expect, it } from "vitest"

import { defaultAppPreferences } from "@/domain/preferences"
import {
  highlightMatch,
  isSectionModified,
  searchSettings,
  sectionOf,
  settingsCatalog,
  settingsSections,
  settingsOfSection,
} from "@/features/settings/settings-catalog"

describe("settings catalog", () => {
  it("places every setting in a section that exists", () => {
    for (const setting of settingsCatalog) {
      expect(() => sectionOf(setting.section)).not.toThrow()
    }
  })

  it("gives every setting a unique id", () => {
    const ids = new Set(settingsCatalog.map((setting) => setting.id))
    expect(ids.size).toBe(settingsCatalog.length)
  })

  it("leaves no section without a setting to show", () => {
    for (const section of settingsSections) {
      expect(settingsOfSection(section.id).length).toBeGreaterThan(0)
    }
  })

  it("reports nothing as modified for a fresh install", () => {
    for (const section of settingsSections) {
      expect(isSectionModified(section.id, defaultAppPreferences)).toBe(false)
    }
  })

  it("marks only the section a change belongs to", () => {
    const wrapped = {
      ...defaultAppPreferences,
      editor: { ...defaultAppPreferences.editor, wrapLines: true },
    }
    expect(isSectionModified("editor", wrapped)).toBe(true)
    expect(isSectionModified("appearance", wrapped)).toBe(false)
  })
})

describe("settings search", () => {
  it("offers nothing until something is typed", () => {
    expect(searchSettings("   ")).toEqual([])
  })

  it("offers a section whose own name matches, with no setting subtitle", () => {
    const [first] = searchSettings("build")
    expect(first?.section.id).toBe("build")
    expect(first?.setting).toBeNull()
  })

  it("names the setting that matched when the section name did not", () => {
    const result = searchSettings("intellisense")
    expect(result).toHaveLength(1)
    expect(result[0]?.section.id).toBe("assistance")
    expect(result[0]?.setting?.id).toBe("assistance-completion")
  })

  it("ranks a section-name match above a contained-setting match", () => {
    // "Editor" is a section name and also a word in the PDF-free editor rows.
    const ranked = searchSettings("editor")
    expect(ranked[0]?.section.id).toBe("editor")
    expect(ranked[0]?.setting).toBeNull()
  })

  it("offers each section at most once", () => {
    const sections = searchSettings("line").map((result) => result.section.id)
    expect(new Set(sections).size).toBe(sections.length)
  })

  it("requires every term to match, so a search narrows", () => {
    expect(searchSettings("indent").length).toBeGreaterThan(0)
    expect(searchSettings("indent zzz")).toEqual([])
  })
})

describe("highlightMatch", () => {
  it("splits a label around the matched run", () => {
    expect(highlightMatch("Appearance", "pea")).toEqual({
      before: "Ap",
      match: "pea",
      after: "rance",
    })
  })

  it("leaves the label whole when it does not match", () => {
    expect(highlightMatch("Build", "zzz")).toEqual({
      before: "Build",
      match: "",
      after: "",
    })
  })
})
