import {
  FilePenLine,
  FileText,
  FolderTree,
  Hammer,
  type LucideIcon,
  Palette,
  PanelLeft,
  Sparkles,
} from "lucide-react"

import {
  defaultAppPreferences,
  type AppPreferences,
  type PreferenceSection,
} from "@/domain/preferences"

/**
 * Every setting the interface exposes, in the order it is presented.
 *
 * The catalog is the single source of truth for navigation, search, and
 * per-section reset. A control that is not listed here cannot be found by
 * search, so the two can never drift apart.
 */
export type SettingId =
  | "color-theme"
  | "accent-color"
  | "interface-scale"
  | "editor-font"
  | "editor-line-height"
  | "editor-font-size"
  | "editor-gutter"
  | "editor-wrapping"
  | "editor-indentation"
  | "editor-auto-close"
  | "editor-spell-check"
  | "assistance-completion"
  | "assistance-hover"
  | "assistance-diagnostics"
  | "build-save-first"
  | "build-failure"
  | "pdf-defaults"
  | "files-filter"
  | "workspace-sidebar"

export type SettingsSectionId =
  | "appearance"
  | "editor"
  | "assistance"
  | "build"
  | "pdf"
  | "files"
  | "workspace"

/** The heading a section sits under in the sidebar. */
export type SettingsNavGroup = "application" | "project"

export type SettingsSectionDefinition = Readonly<{
  id: SettingsSectionId
  label: string
  group: SettingsNavGroup
  icon: LucideIcon
  /** The preference group a "Restore defaults" in this section resets, if any. */
  resets: PreferenceSection | null
}>

export type SettingDefinition = Readonly<{
  id: SettingId
  section: SettingsSectionId
  title: string
  /** Extra words a user might search for that are not already in the title. */
  keywords: string
}>

export const navGroupLabels: Readonly<Record<SettingsNavGroup, string>> = {
  application: "Application",
  project: "Project",
}

export const settingsSections: ReadonlyArray<SettingsSectionDefinition> = [
  {
    id: "appearance",
    label: "Appearance",
    group: "application",
    icon: Palette,
    resets: "appearance",
  },
  {
    id: "editor",
    label: "Editor",
    group: "application",
    icon: FilePenLine,
    resets: "editor",
  },
  {
    id: "assistance",
    label: "Assistance",
    group: "application",
    icon: Sparkles,
    resets: "assistance",
  },
  {
    id: "build",
    label: "Build",
    group: "project",
    icon: Hammer,
    resets: "build",
  },
  {
    id: "pdf",
    label: "PDF viewer",
    group: "project",
    icon: FileText,
    resets: "pdf",
  },
  {
    id: "files",
    label: "Files",
    group: "project",
    icon: FolderTree,
    resets: "files",
  },
  {
    id: "workspace",
    label: "Workspace",
    group: "project",
    icon: PanelLeft,
    resets: null,
  },
]

export const settingsCatalog: ReadonlyArray<SettingDefinition> = [
  {
    id: "color-theme",
    section: "appearance",
    title: "Colour theme",
    keywords: "dark light system custom appearance mode contrast",
  },
  {
    id: "accent-color",
    section: "appearance",
    title: "Accent colour",
    keywords: "primary highlight tint brand hex swatch",
  },
  {
    id: "interface-scale",
    section: "appearance",
    title: "Interface scale",
    keywords: "density compact comfortable zoom size text bigger smaller",
  },
  {
    id: "editor-font",
    section: "editor",
    title: "Editor font",
    keywords:
      "typeface monospace family ligature jetbrains fira consolas menlo",
  },
  {
    id: "editor-line-height",
    section: "editor",
    title: "Line height",
    keywords: "leading spacing compact relaxed density",
  },
  {
    id: "editor-font-size",
    section: "editor",
    title: "Editor font size",
    keywords: "text size zoom points pixels project",
  },
  {
    id: "editor-gutter",
    section: "editor",
    title: "Line numbers",
    keywords: "gutter active line selection matches occurrences highlight",
  },
  {
    id: "editor-wrapping",
    section: "editor",
    title: "Line wrapping",
    keywords: "wrap soft long lines horizontal scroll",
  },
  {
    id: "editor-indentation",
    section: "editor",
    title: "Indentation",
    keywords: "tab spaces width size indent unit",
  },
  {
    id: "editor-auto-close",
    section: "editor",
    title: "Close brackets",
    keywords:
      "brackets braces environments begin end pairs auto insert automatic closing",
  },
  {
    id: "editor-spell-check",
    section: "editor",
    title: "Spell checking",
    keywords: "spelling dictionary squiggle system browser",
  },
  {
    id: "assistance-completion",
    section: "assistance",
    title: "Suggestions",
    keywords:
      "autocomplete completion intellisense popup typing trigger limit commands packages",
  },
  {
    id: "assistance-hover",
    section: "assistance",
    title: "Documentation on hover",
    keywords: "tooltip hover delay help reference popup",
  },
  {
    id: "assistance-diagnostics",
    section: "assistance",
    title: "Problem analysis",
    keywords: "diagnostics lint errors warnings while typing squiggles",
  },
  {
    id: "build-save-first",
    section: "build",
    title: "Save before building",
    keywords: "autosave compile latexmk pdflatex unsaved",
  },
  {
    id: "build-failure",
    section: "build",
    title: "After a failed build",
    keywords: "error panel open problems log focus compile failure",
  },
  {
    id: "pdf-defaults",
    section: "pdf",
    title: "Opening a PDF",
    keywords: "zoom layout continuous single page outline sidebar preview",
  },
  {
    id: "files-filter",
    section: "files",
    title: "Filtered files",
    keywords:
      "hidden hide show extension name generated artifacts aux log fls explorer sidebar tree ignore",
  },
  {
    id: "workspace-sidebar",
    section: "workspace",
    title: "Project files sidebar",
    keywords: "width reset layout panel project",
  },
]

export function sectionOf(id: SettingsSectionId): SettingsSectionDefinition {
  const section = settingsSections.find((candidate) => candidate.id === id)
  if (section === undefined) {
    throw new Error(`Unknown settings section: ${id}`)
  }
  return section
}

export function settingsOfSection(
  id: SettingsSectionId
): ReadonlyArray<SettingDefinition> {
  return settingsCatalog.filter((setting) => setting.section === id)
}

/**
 * Whether a setting differs from the value a fresh install would have. A
 * section offers to restore its defaults only when one of its settings does.
 */
export function isSettingModified(
  id: SettingId,
  preferences: AppPreferences
): boolean {
  const defaults = defaultAppPreferences
  const editor = preferences.editor
  const assistance = preferences.assistance
  switch (id) {
    case "color-theme":
      return (
        preferences.appearance.colorTheme !== defaults.appearance.colorTheme
      )
    case "accent-color":
      return (
        preferences.appearance.accentColor !== defaults.appearance.accentColor
      )
    case "interface-scale":
      return (
        preferences.appearance.interfaceScale !==
        defaults.appearance.interfaceScale
      )
    case "editor-font":
      return editor.fontFamily !== defaults.editor.fontFamily
    case "editor-line-height":
      return editor.lineHeight !== defaults.editor.lineHeight
    case "editor-gutter":
      return (
        editor.showLineNumbers !== defaults.editor.showLineNumbers ||
        editor.highlightActiveLine !== defaults.editor.highlightActiveLine ||
        editor.highlightSelectionMatches !==
          defaults.editor.highlightSelectionMatches
      )
    case "editor-wrapping":
      return editor.wrapLines !== defaults.editor.wrapLines
    case "editor-indentation":
      return (
        editor.indentStyle !== defaults.editor.indentStyle ||
        editor.indentWidth !== defaults.editor.indentWidth
      )
    case "editor-auto-close":
      return (
        editor.autoCloseBrackets !== defaults.editor.autoCloseBrackets ||
        editor.autoCloseEnvironments !== defaults.editor.autoCloseEnvironments
      )
    case "editor-spell-check":
      return editor.spellCheck !== defaults.editor.spellCheck
    case "assistance-completion":
      return (
        assistance.completionEnabled !==
          defaults.assistance.completionEnabled ||
        assistance.completionOnTyping !==
          defaults.assistance.completionOnTyping ||
        assistance.completionLimit !== defaults.assistance.completionLimit
      )
    case "assistance-hover":
      return (
        assistance.hoverDocumentation !==
          defaults.assistance.hoverDocumentation ||
        assistance.hoverDelay !== defaults.assistance.hoverDelay
      )
    case "assistance-diagnostics":
      return (
        assistance.diagnosticsEnabled !== defaults.assistance.diagnosticsEnabled
      )
    case "build-save-first":
      return (
        preferences.build.saveBeforeBuild !== defaults.build.saveBeforeBuild
      )
    case "build-failure":
      return (
        preferences.build.openPanelOnFailure !==
          defaults.build.openPanelOnFailure ||
        preferences.build.revealProblemsOnFailure !==
          defaults.build.revealProblemsOnFailure
      )
    case "pdf-defaults":
      return (
        preferences.pdf.defaultZoom !== defaults.pdf.defaultZoom ||
        preferences.pdf.defaultLayout !== defaults.pdf.defaultLayout ||
        preferences.pdf.defaultSidebar !== defaults.pdf.defaultSidebar
      )
    case "files-filter":
      return (
        preferences.files.hideFilteredFiles !==
          defaults.files.hideFilteredFiles ||
        preferences.files.hiddenFileRules.length !==
          defaults.files.hiddenFileRules.length
      )
    // Both are project state rather than an application preference, so they are
    // never compared against an application default.
    case "editor-font-size":
    case "workspace-sidebar":
      return false
  }
}

/** Whether any setting in a section has been changed from its default. */
export function isSectionModified(
  section: SettingsSectionId,
  preferences: AppPreferences
): boolean {
  return settingsOfSection(section).some((setting) =>
    isSettingModified(setting.id, preferences)
  )
}

export type SettingsSearchResult = Readonly<{
  section: SettingsSectionDefinition
  /** The setting that matched, or null when only the section name did. */
  setting: SettingDefinition | null
}>

/**
 * Results for the sidebar search, ranked so a section whose own name matches is
 * offered before a section that merely contains a matching setting. A section
 * appears at most once, because selecting it is the only outcome either way.
 */
export function searchSettings(
  query: string,
  limit = 8
): ReadonlyArray<SettingsSearchResult> {
  const normalized = query.trim().toLowerCase()
  if (normalized === "") return []
  const terms = normalized.split(/\s+/)
  const matches = (haystack: string): boolean =>
    terms.every((term) => haystack.toLowerCase().includes(term))

  const byName: SettingsSearchResult[] = []
  const bySetting: SettingsSearchResult[] = []
  for (const section of settingsSections) {
    if (matches(section.label)) {
      byName.push({ section, setting: null })
      continue
    }
    const setting = settingsOfSection(section.id).find((candidate) =>
      matches(`${candidate.title} ${candidate.keywords} ${section.label}`)
    )
    if (setting !== undefined) bySetting.push({ section, setting })
  }
  return [...byName, ...bySetting].slice(0, limit)
}

/**
 * Splits a label around the first occurrence of the query so the matched run
 * can be emphasised without rendering user input as markup.
 */
export function highlightMatch(
  label: string,
  query: string
): Readonly<{ before: string; match: string; after: string }> {
  const normalized = query.trim().toLowerCase()
  const index = normalized === "" ? -1 : label.toLowerCase().indexOf(normalized)
  if (index === -1) return { before: label, match: "", after: "" }
  return {
    before: label.slice(0, index),
    match: label.slice(index, index + normalized.length),
    after: label.slice(index + normalized.length),
  }
}
