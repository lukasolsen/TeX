import type {
  EditorViewerState,
  HiddenFileRule,
  PdfViewerState,
  ProjectEntry,
  ProjectSearchResponse,
  ProjectSummary,
  RecoveryDraft,
  ReplaceResponse,
  SourceDocument,
  SourceRevision,
  StartupState,
  WorkspaceState,
} from "@/domain/project"
import {
  canonicalProjectPath,
  projectRelativePath,
  revisionHash,
} from "@/domain/identifiers"
import {
  MAX_HIDDEN_FILE_RULES,
  MAX_HIDDEN_FILE_RULE_LENGTH,
  normalizeHiddenFileRules,
} from "@/domain/file-visibility"
import {
  defaultAppPreferences,
  editorLineHeights,
  indentStyles,
  interfaceScales,
  isAccentColor,
  isEditorFontFamily,
  MAX_COMPLETION_LIMIT,
  MAX_EDITOR_FONT_FAMILY_LENGTH,
  MAX_HOVER_DELAY,
  MAX_INDENT_WIDTH,
  MAX_PDF_ZOOM,
  MIN_COMPLETION_LIMIT,
  MIN_HOVER_DELAY,
  MIN_INDENT_WIDTH,
  MIN_PDF_ZOOM,
  normalizeAppPreferences,
  type AppPreferences,
} from "@/domain/preferences"
import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"

import {
  IpcContractError,
  arrayValue,
  booleanValue,
  enumValue,
  finiteNumber,
  integer,
  nonEmptyString,
  nullableString,
  record,
  stringValue,
} from "@/services/ipc-contract"

const PATH_LIMIT = 32 * 1024
const CONTENT_LIMIT = 2 * 1024 * 1024
const MAX_WORKSPACE_FILES = 256

export function parseOptionalProjectPath(
  value: unknown
): CanonicalProjectPath | null {
  return value === null
    ? null
    : canonicalProjectPath(nonEmptyString(value, "project path", PATH_LIMIT))
}

export function parseProjectSummary(value: unknown): ProjectSummary {
  const input = record(value, "project summary")
  const budget = { entries: 0 }
  return {
    name: nonEmptyString(input.name, "project name", 4_096),
    path: canonicalProjectPath(
      nonEmptyString(input.path, "project path", PATH_LIMIT)
    ),
    tree: parseProjectEntry(input.tree, budget, 0),
    rootCandidates: arrayValue(
      input.rootCandidates,
      "root candidates",
      2_048,
      (candidate) => {
        const item = record(candidate, "root candidate")
        return {
          path: projectRelativePath(
            nonEmptyString(item.path, "root path", PATH_LIMIT)
          ),
          evidence: arrayValue(item.evidence, "root evidence", 3, (evidence) =>
            enumValue(evidence, "root evidence", [
              "documentClass",
              "magicComment",
              "configured",
            ])
          ),
        }
      }
    ),
    rootDetectionNote: nullableString(
      input.rootDetectionNote,
      "root note",
      8_192
    ),
    persistenceNote: nullableString(
      input.persistenceNote,
      "persistence note",
      8_192
    ),
  }
}

export function parseStartupState(value: unknown): StartupState {
  const input = record(value, "startup state")
  return {
    recentProjects: arrayValue(
      input.recentProjects,
      "recent projects",
      12,
      (project) => {
        const item = record(project, "recent project")
        return {
          name: nonEmptyString(item.name, "recent project name", 4_096),
          path: canonicalProjectPath(
            nonEmptyString(item.path, "recent project path", PATH_LIMIT)
          ),
          lastOpenedAt: integer(
            item.lastOpenedAt,
            "recent project time",
            0,
            Number.MAX_SAFE_INTEGER
          ),
          availability: enumValue(item.availability, "project availability", [
            "available",
            "missing",
          ]),
        }
      }
    ),
    lastWorkspace:
      input.lastWorkspace === null
        ? null
        : parseWorkspaceState(input.lastWorkspace),
    restorationNotice: nullableString(
      input.restorationNotice,
      "restoration notice",
      16_384
    ),
  }
}

/**
 * Reads a preference, falling back to its default when the stored value is
 * missing or outside its contract. Preferences are comfort settings spread over
 * six groups: one unreadable field must not cost the user every other choice,
 * and an out-of-range value is still never accepted.
 */
function preference<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

export function parseAppPreferences(value: unknown): AppPreferences {
  const input = record(value, "application preferences")
  const group = (name: keyof AppPreferences): Record<string, unknown> =>
    preference(() => record(input[name], `${name} preferences`), {})
  const appearance = group("appearance")
  const editor = group("editor")
  const assistance = group("assistance")
  const build = group("build")
  const pdf = group("pdf")
  const files = group("files")
  const defaults = defaultAppPreferences
  return normalizeAppPreferences({
    appearance: {
      colorTheme: preference(
        () =>
          // A pre-3.0 "custom" theme falls back to the default here; the
          // accent it carried is now applied whatever the scheme.
          enumValue(appearance.colorTheme, "color theme", [
            "system",
            "light",
            "dark",
          ]),
        defaults.appearance.colorTheme
      ),
      accentColor: preference(() => {
        const accentColor = stringValue(appearance.accentColor, "accent", 7)
        if (!isAccentColor(accentColor)) throw new IpcContractError("accent")
        return accentColor
      }, defaults.appearance.accentColor),
      interfaceScale: preference(
        () =>
          enumValue(appearance.interfaceScale, "interface scale", [
            ...interfaceScales,
          ]),
        defaults.appearance.interfaceScale
      ),
    },
    editor: {
      fontFamily: preference(() => {
        const family = stringValue(
          editor.fontFamily,
          "editor font family",
          MAX_EDITOR_FONT_FAMILY_LENGTH
        )
        if (!isEditorFontFamily(family))
          throw new IpcContractError("editor font family")
        return family
      }, defaults.editor.fontFamily),
      lineHeight: preference(
        () =>
          enumValue(editor.lineHeight, "editor line height", [
            ...editorLineHeights,
          ]),
        defaults.editor.lineHeight
      ),
      showLineNumbers: flag(
        editor.showLineNumbers,
        defaults.editor.showLineNumbers
      ),
      highlightActiveLine: flag(
        editor.highlightActiveLine,
        defaults.editor.highlightActiveLine
      ),
      highlightSelectionMatches: flag(
        editor.highlightSelectionMatches,
        defaults.editor.highlightSelectionMatches
      ),
      wrapLines: flag(editor.wrapLines, defaults.editor.wrapLines),
      indentStyle: preference(
        () => enumValue(editor.indentStyle, "indent style", [...indentStyles]),
        defaults.editor.indentStyle
      ),
      indentWidth: preference(
        () =>
          integer(
            editor.indentWidth,
            "indent width",
            MIN_INDENT_WIDTH,
            MAX_INDENT_WIDTH
          ),
        defaults.editor.indentWidth
      ),
      autoCloseBrackets: flag(
        editor.autoCloseBrackets,
        defaults.editor.autoCloseBrackets
      ),
      autoCloseEnvironments: flag(
        editor.autoCloseEnvironments,
        defaults.editor.autoCloseEnvironments
      ),
      spellCheck: flag(editor.spellCheck, defaults.editor.spellCheck),
    },
    assistance: {
      completionEnabled: flag(
        assistance.completionEnabled,
        defaults.assistance.completionEnabled
      ),
      completionOnTyping: flag(
        assistance.completionOnTyping,
        defaults.assistance.completionOnTyping
      ),
      completionLimit: preference(
        () =>
          integer(
            assistance.completionLimit,
            "completion limit",
            MIN_COMPLETION_LIMIT,
            MAX_COMPLETION_LIMIT
          ),
        defaults.assistance.completionLimit
      ),
      hoverDocumentation: flag(
        assistance.hoverDocumentation,
        defaults.assistance.hoverDocumentation
      ),
      hoverDelay: preference(
        () =>
          integer(
            assistance.hoverDelay,
            "hover delay",
            MIN_HOVER_DELAY,
            MAX_HOVER_DELAY
          ),
        defaults.assistance.hoverDelay
      ),
      diagnosticsEnabled: flag(
        assistance.diagnosticsEnabled,
        defaults.assistance.diagnosticsEnabled
      ),
    },
    build: {
      saveBeforeBuild: flag(
        build.saveBeforeBuild,
        defaults.build.saveBeforeBuild
      ),
      openPanelOnFailure: flag(
        build.openPanelOnFailure,
        defaults.build.openPanelOnFailure
      ),
      revealProblemsOnFailure: flag(
        build.revealProblemsOnFailure,
        defaults.build.revealProblemsOnFailure
      ),
    },
    pdf: {
      defaultZoom: preference(
        () =>
          finiteNumber(pdf.defaultZoom, "pdf zoom", MIN_PDF_ZOOM, MAX_PDF_ZOOM),
        defaults.pdf.defaultZoom
      ),
      defaultLayout: preference(
        () =>
          enumValue(pdf.defaultLayout, "pdf layout", ["continuous", "single"]),
        defaults.pdf.defaultLayout
      ),
      defaultSidebar: preference(
        () => enumValue(pdf.defaultSidebar, "pdf sidebar", ["none", "outline"]),
        defaults.pdf.defaultSidebar
      ),
    },
    files: {
      hideFilteredFiles: flag(
        files.hideFilteredFiles,
        defaults.files.hideFilteredFiles
      ),
      hiddenFileRules: preference(
        () =>
          normalizeHiddenFileRules(
            arrayValue(
              files.hiddenFileRules,
              "hidden file rules",
              MAX_HIDDEN_FILE_RULES,
              parseHiddenFileRule
            )
          ),
        defaults.files.hiddenFileRules
      ),
    },
  })
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function parseHiddenFileRule(value: unknown): HiddenFileRule {
  const input = record(value, "hidden file rule")
  return {
    kind: enumValue(input.kind, "hidden file rule kind", ["extension", "name"]),
    value: nonEmptyString(
      input.value,
      "hidden file rule value",
      MAX_HIDDEN_FILE_RULE_LENGTH
    ),
  }
}

export function parseSourceDocument(value: unknown): SourceDocument {
  const input = record(value, "source document")
  const content = stringValue(input.content, "source content", CONTENT_LIMIT)
  const byteLength = integer(
    input.byteLength,
    "source byte length",
    0,
    CONTENT_LIMIT
  )
  const revision = parseSourceRevision(input.revision)
  if (revision.byteLength !== byteLength)
    throw new IpcContractError("source revision")
  return {
    path: projectRelativePath(
      nonEmptyString(input.path, "source path", PATH_LIMIT)
    ),
    content,
    byteLength,
    revision,
  }
}

function parseSourceRevision(value: unknown): SourceRevision {
  const input = record(value, "source revision")
  const contentHash = stringValue(input.contentHash, "source hash", 64)
  if (!/^[\dA-Fa-f]{64}$/.test(contentHash))
    throw new IpcContractError("source hash")
  return {
    byteLength: integer(
      input.byteLength,
      "source byte length",
      0,
      CONTENT_LIMIT
    ),
    contentHash: revisionHash(contentHash),
  }
}

export function parseRecoveryDraft(value: unknown): RecoveryDraft | null {
  if (value === null) return null
  const input = record(value, "recovery draft")
  return {
    projectPath: canonicalProjectPath(
      nonEmptyString(input.projectPath, "recovery project path", PATH_LIMIT)
    ),
    relativePath: projectRelativePath(
      nonEmptyString(input.relativePath, "recovery source path", PATH_LIMIT)
    ),
    content: stringValue(input.content, "recovery content", CONTENT_LIMIT),
    baseRevision: parseSourceRevision(input.baseRevision),
    savedAt: integer(
      input.savedAt,
      "recovery timestamp",
      0,
      Number.MAX_SAFE_INTEGER
    ),
  }
}

export function parseProjectSearchResponse(
  value: unknown
): ProjectSearchResponse {
  const input = record(value, "project search")
  return {
    results: arrayValue(input.results, "search results", 500, (result) => {
      const item = record(result, "search result")
      return {
        path: projectRelativePath(
          nonEmptyString(item.path, "search path", PATH_LIMIT)
        ),
        line: integer(item.line, "search line", 1, Number.MAX_SAFE_INTEGER),
        column: integer(
          item.column,
          "search column",
          1,
          Number.MAX_SAFE_INTEGER
        ),
        context: stringValue(item.context, "search context", 361),
        revision: parseSourceRevision(item.revision),
      }
    }),
    totalMatches: integer(
      input.totalMatches,
      "search match count",
      0,
      Number.MAX_SAFE_INTEGER
    ),
    searchedFiles: integer(
      input.searchedFiles,
      "searched file count",
      0,
      2_048
    ),
    truncated: booleanValue(input.truncated, "search truncation"),
  }
}

export function parseReplaceResponse(value: unknown): ReplaceResponse {
  const input = record(value, "replace response")
  const transactionId = stringValue(
    input.transactionId,
    "replace transaction",
    64
  )
  if (!/^[\dA-Fa-f]{64}$/.test(transactionId))
    throw new IpcContractError("replace transaction")
  return {
    transactionId,
    changedFiles: integer(input.changedFiles, "changed file count", 0, 128),
    replacedMatches: integer(
      input.replacedMatches,
      "replaced match count",
      0,
      Number.MAX_SAFE_INTEGER
    ),
  }
}

export function parsePdfRevision(value: unknown): string {
  return nonEmptyString(value, "PDF revision", 128)
}

export function parseForwardSearchResult(value: unknown): {
  page: number
  x: number
  y: number
} {
  const input = record(value, "forward search")
  return {
    page: integer(input.page, "SyncTeX page", 1, 1_000_000),
    x: finiteNumber(input.x, "SyncTeX x coordinate", 0, 1_000_000_000),
    y: finiteNumber(input.y, "SyncTeX y coordinate", 0, 1_000_000_000),
  }
}

export function parseInverseSearchResult(value: unknown): {
  path: ProjectRelativePath
  line: number
  column: number
} {
  const input = record(value, "inverse search")
  return {
    path: projectRelativePath(
      nonEmptyString(input.path, "SyncTeX source path", PATH_LIMIT)
    ),
    line: integer(input.line, "SyncTeX line", 1, Number.MAX_SAFE_INTEGER),
    column: integer(input.column, "SyncTeX column", 1, Number.MAX_SAFE_INTEGER),
  }
}

export function parseBinaryResponse(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  // A view supplied by a test double may sit on a buffer the DOM cannot take;
  // copying it hands callers a plain `ArrayBuffer` view either way.
  if (value instanceof Uint8Array) return new Uint8Array(value)
  throw new IpcContractError("binary file data")
}

function parseProjectEntry(
  value: unknown,
  budget: { entries: number },
  depth: number
): ProjectEntry {
  budget.entries += 1
  if (budget.entries > 2_049 || depth > 13)
    throw new IpcContractError("project tree")
  const input = record(value, "project tree entry")
  return {
    name: nonEmptyString(input.name, "project entry name", 4_096),
    kind: enumValue(input.kind, "project entry kind", ["directory", "file"]),
    children: arrayValue(
      input.children,
      "project entry children",
      2_048,
      (child) => parseProjectEntry(child, budget, depth + 1)
    ),
  }
}

function parseWorkspaceState(value: unknown): WorkspaceState {
  const input = record(value, "workspace state")
  return {
    projectPath: canonicalProjectPath(
      nonEmptyString(input.projectPath, "workspace project path", PATH_LIMIT)
    ),
    pinnedFiles: arrayValue(
      input.pinnedFiles,
      "pinned files",
      MAX_WORKSPACE_FILES,
      (path) =>
        projectRelativePath(nonEmptyString(path, "pinned file", PATH_LIMIT))
    ),
    selectedRoot: parseNullableRelativePath(
      input.selectedRoot,
      "selected root"
    ),
    selectedFile: parseNullableRelativePath(
      input.selectedFile,
      "selected file"
    ),
    sidebarWidth: integer(input.sidebarWidth, "sidebar width", 220, 4_096),
    editorFontSize: integer(input.editorFontSize, "editor font size", 11, 24),
    pdfPaneOpen: booleanValue(input.pdfPaneOpen, "PDF pane state"),
    pdfPaneWidth: integer(input.pdfPaneWidth, "PDF pane width", 160, 4_096),
    buildPanelOpen: booleanValue(input.buildPanelOpen, "build panel state"),
    buildPanelHeight: integer(
      input.buildPanelHeight,
      "build panel height",
      160,
      4_096
    ),
    sidebarTab: enumValue(input.sidebarTab, "sidebar tab", [
      "files",
      "outline",
      "references",
    ]),
    buildPanelTab: enumValue(input.buildPanelTab, "build panel tab", [
      "output",
      "problems",
    ]),
    bottomPanelTab:
      input.bottomPanelTab === "terminal"
        ? "terminal"
        : input.bottomPanelTab === "problems"
          ? "problems"
          : "build",
    buildProfile: enumValue(input.buildProfile, "build profile", [
      "latexmkPdf",
      "pdfLatex",
      "xeLatex",
      "luaLatex",
    ]),
    selectedPdf: parseNullableRelativePath(input.selectedPdf, "selected PDF"),
    pdfViewerStates: parseStateMap(input.pdfViewerStates, parsePdfViewerState),
    editorViewerStates: parseStateMap(
      input.editorViewerStates,
      parseEditorViewerState
    ),
  }
}

function parseNullableRelativePath(value: unknown, contract: string) {
  const parsed = nullableString(value, contract, PATH_LIMIT)
  return parsed === null ? null : projectRelativePath(parsed)
}

function parseStateMap<T>(
  value: unknown,
  parse: (item: unknown) => T
): Record<string, T> {
  const input = record(value, "viewer state map")
  const entries = Object.entries(input)
  if (entries.length > MAX_WORKSPACE_FILES)
    throw new IpcContractError("viewer state map")
  return Object.fromEntries(
    entries.map(([path, state]) => [
      nonEmptyString(path, "viewer state path", PATH_LIMIT),
      parse(state),
    ])
  )
}

function parsePdfViewerState(value: unknown): PdfViewerState {
  const input = record(value, "PDF viewer state")
  const rotation = integer(input.rotation, "PDF rotation", 0, 270)
  if (![0, 90, 180, 270].includes(rotation))
    throw new IpcContractError("PDF rotation")
  return {
    page: integer(input.page, "PDF page", 1, 1_000_000),
    position: finiteNumber(input.position, "PDF position", 0, 1),
    zoom: finiteNumber(input.zoom, "PDF zoom", 0.1, 8),
    rotation: parseRotation(rotation),
    layout: enumValue(input.layout, "PDF layout", ["continuous", "single"]),
    sidebar: enumValue(input.sidebar, "PDF sidebar", ["none", "outline"]),
  }
}

function parseRotation(value: number): 0 | 90 | 180 | 270 {
  if (value === 0 || value === 90 || value === 180 || value === 270)
    return value
  throw new IpcContractError("PDF rotation")
}

function parseEditorViewerState(value: unknown): EditorViewerState {
  const input = record(value, "editor viewer state")
  return {
    line: integer(input.line, "editor line", 1, Number.MAX_SAFE_INTEGER),
    column: integer(input.column, "editor column", 1, Number.MAX_SAFE_INTEGER),
    scrollTop: finiteNumber(
      input.scrollTop,
      "editor vertical scroll",
      0,
      Number.MAX_SAFE_INTEGER
    ),
    scrollLeft: finiteNumber(
      input.scrollLeft,
      "editor horizontal scroll",
      0,
      Number.MAX_SAFE_INTEGER
    ),
  }
}
