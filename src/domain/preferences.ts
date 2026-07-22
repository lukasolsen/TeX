import type { ColorTheme, HiddenFileRule } from "@/domain/project"
import type { PdfLayoutMode, PdfSidebarMode } from "@/domain/project"
import {
  defaultHiddenFileRules,
  normalizeHiddenFileRules,
} from "@/domain/file-visibility"
import { clamp, clampInt } from "@/lib/math"

/**
 * Application preferences. These are device-local and apply to every project;
 * anything that belongs to one project (pane sizes, the selected root, the open
 * file) lives in `WorkspaceState` instead.
 *
 * The groups are the same ones the settings surface presents, so a section can
 * be reset, compared against its defaults, and persisted without a translation
 * step in between.
 */
export type AppPreferences = Readonly<{
  appearance: AppearancePreferences
  editor: EditorPreferences
  assistance: AssistancePreferences
  build: BuildPreferences
  pdf: PdfPreferences
  files: FilePreferences
}>

export type AppearancePreferences = Readonly<{
  colorTheme: ColorTheme
  accentColor: string
  interfaceScale: InterfaceScale
}>

export type EditorPreferences = Readonly<{
  fontFamily: string
  lineHeight: EditorLineHeight
  showLineNumbers: boolean
  highlightActiveLine: boolean
  highlightSelectionMatches: boolean
  wrapLines: boolean
  indentStyle: IndentStyle
  indentWidth: number
  autoCloseBrackets: boolean
  autoCloseEnvironments: boolean
  spellCheck: boolean
}>

export type AssistancePreferences = Readonly<{
  completionEnabled: boolean
  completionOnTyping: boolean
  completionLimit: number
  hoverDocumentation: boolean
  hoverDelay: number
  diagnosticsEnabled: boolean
}>

export type BuildPreferences = Readonly<{
  saveBeforeBuild: boolean
  openPanelOnFailure: boolean
  revealProblemsOnFailure: boolean
}>

export type PdfPreferences = Readonly<{
  defaultZoom: number
  defaultLayout: PdfLayoutMode
  defaultSidebar: PdfSidebarMode
}>

export type FilePreferences = Readonly<{
  hideFilteredFiles: boolean
  hiddenFileRules: ReadonlyArray<HiddenFileRule>
}>

export type PreferenceSection = keyof AppPreferences

export type InterfaceScale = "compact" | "default" | "comfortable"
export type EditorLineHeight = "compact" | "normal" | "relaxed"
export type IndentStyle = "spaces" | "tabs"

export const interfaceScales: ReadonlyArray<InterfaceScale> = [
  "compact",
  "default",
  "comfortable",
]
export const editorLineHeights: ReadonlyArray<EditorLineHeight> = [
  "compact",
  "normal",
  "relaxed",
]
export const indentStyles: ReadonlyArray<IndentStyle> = ["spaces", "tabs"]

/** Root font size multipliers. Every control height is relative, so this scales
 * the whole interface rather than one surface. */
export const interfaceScaleFactor: Readonly<Record<InterfaceScale, number>> = {
  compact: 0.9,
  default: 1,
  comfortable: 1.1,
}

export const editorLineHeightRatio: Readonly<Record<EditorLineHeight, number>> =
  {
    compact: 1.35,
    normal: 1.55,
    relaxed: 1.85,
  }

export const MIN_INDENT_WIDTH = 2
export const MAX_INDENT_WIDTH = 8
export const MIN_COMPLETION_LIMIT = 5
export const MAX_COMPLETION_LIMIT = 100
export const MIN_HOVER_DELAY = 100
export const MAX_HOVER_DELAY = 2_000
export const MIN_PDF_ZOOM = 0.25
export const MAX_PDF_ZOOM = 5
export const MAX_EDITOR_FONT_FAMILY_LENGTH = 120

/**
 * A font family is written straight into a CSS declaration, so it is restricted
 * to the characters a family name actually needs. An empty value means "use the
 * platform monospace stack".
 */
const EDITOR_FONT_FAMILY_PATTERN = /^[A-Za-z0-9 ,._-]*$/

export const defaultAppPreferences: AppPreferences = {
  appearance: {
    colorTheme: "system",
    accentColor: "#2563eb",
    interfaceScale: "default",
  },
  editor: {
    fontFamily: "",
    lineHeight: "normal",
    showLineNumbers: true,
    highlightActiveLine: true,
    highlightSelectionMatches: true,
    wrapLines: false,
    indentStyle: "spaces",
    indentWidth: 2,
    autoCloseBrackets: true,
    autoCloseEnvironments: true,
    spellCheck: false,
  },
  assistance: {
    completionEnabled: true,
    completionOnTyping: true,
    completionLimit: 50,
    hoverDocumentation: true,
    hoverDelay: 350,
    diagnosticsEnabled: true,
  },
  build: {
    saveBeforeBuild: true,
    openPanelOnFailure: true,
    revealProblemsOnFailure: false,
  },
  pdf: {
    defaultZoom: 1,
    defaultLayout: "continuous",
    defaultSidebar: "none",
  },
  files: {
    hideFilteredFiles: true,
    hiddenFileRules: defaultHiddenFileRules,
  },
}

export function isAccentColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

export function isEditorFontFamily(value: string): boolean {
  return (
    value.length <= MAX_EDITOR_FONT_FAMILY_LENGTH &&
    EDITOR_FONT_FAMILY_PATTERN.test(value)
  )
}

/**
 * Brings any preference set inside its supported range. Persisted state and IPC
 * payloads are untrusted, and a user can also drive a value to an edge with the
 * keyboard, so both paths go through this rather than trusting the control.
 */
export function normalizeAppPreferences(
  preferences: AppPreferences
): AppPreferences {
  return {
    appearance: {
      colorTheme: preferences.appearance.colorTheme,
      accentColor: isAccentColor(preferences.appearance.accentColor)
        ? preferences.appearance.accentColor.toLowerCase()
        : defaultAppPreferences.appearance.accentColor,
      interfaceScale: preferences.appearance.interfaceScale,
    },
    editor: {
      ...preferences.editor,
      fontFamily: isEditorFontFamily(preferences.editor.fontFamily)
        ? preferences.editor.fontFamily.trim()
        : "",
      indentWidth: clampInt(
        preferences.editor.indentWidth,
        MIN_INDENT_WIDTH,
        MAX_INDENT_WIDTH
      ),
    },
    assistance: {
      ...preferences.assistance,
      completionLimit: clampInt(
        preferences.assistance.completionLimit,
        MIN_COMPLETION_LIMIT,
        MAX_COMPLETION_LIMIT
      ),
      hoverDelay: clampInt(
        preferences.assistance.hoverDelay,
        MIN_HOVER_DELAY,
        MAX_HOVER_DELAY
      ),
    },
    build: { ...preferences.build },
    pdf: {
      ...preferences.pdf,
      defaultZoom: clamp(
        preferences.pdf.defaultZoom,
        MIN_PDF_ZOOM,
        MAX_PDF_ZOOM
      ),
    },
    files: {
      hideFilteredFiles: preferences.files.hideFilteredFiles,
      hiddenFileRules: normalizeHiddenFileRules(
        preferences.files.hiddenFileRules
      ),
    },
  }
}

/** Restores one section without disturbing the others. */
export function resetPreferenceSection(
  preferences: AppPreferences,
  section: PreferenceSection
): AppPreferences {
  return { ...preferences, [section]: defaultAppPreferences[section] }
}

/** The platform monospace stack every editor font falls back to. */
export const fallbackEditorFontStack =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"

/**
 * Builds the CSS font stack for the editor. A configured family is always
 * followed by the platform stack so an uninstalled font degrades to a readable
 * monospace face rather than to a proportional one.
 */
export function editorFontStack(fontFamily: string): string {
  const family = fontFamily.trim()
  if (family === "" || !isEditorFontFamily(family)) {
    return fallbackEditorFontStack
  }
  return `${family}, ${fallbackEditorFontStack}`
}

/** The literal string one indent level inserts. */
export function indentUnitText(
  indentStyle: IndentStyle,
  indentWidth: number
): string {
  return indentStyle === "tabs"
    ? "\t"
    : " ".repeat(clampInt(indentWidth, MIN_INDENT_WIDTH, MAX_INDENT_WIDTH))
}

/** The suggested font families offered as one-click presets in settings. */
export const editorFontPresets: ReadonlyArray<{
  label: string
  value: string
}> = [
  { label: "System monospace", value: "" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Fira Code", value: "Fira Code" },
  { label: "Source Code Pro", value: "Source Code Pro" },
  { label: "IBM Plex Mono", value: "IBM Plex Mono" },
  { label: "Cascadia Code", value: "Cascadia Code" },
]
