import type {
  AppPreferences,
  EditorViewerState,
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

export function parseOptionalProjectPath(value: unknown): CanonicalProjectPath | null {
  return value === null
    ? null
    : canonicalProjectPath(nonEmptyString(value, "project path", PATH_LIMIT))
}

export function parseProjectSummary(value: unknown): ProjectSummary {
  const input = record(value, "project summary")
  const budget = { entries: 0 }
  return {
    name: nonEmptyString(input.name, "project name", 4_096),
    path: canonicalProjectPath(nonEmptyString(input.path, "project path", PATH_LIMIT)),
    tree: parseProjectEntry(input.tree, budget, 0),
    rootCandidates: arrayValue(
      input.rootCandidates,
      "root candidates",
      2_048,
      (candidate) => {
        const item = record(candidate, "root candidate")
        return {
          path: projectRelativePath(nonEmptyString(item.path, "root path", PATH_LIMIT)),
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
    rootDetectionNote: nullableString(input.rootDetectionNote, "root note", 8_192),
    persistenceNote: nullableString(input.persistenceNote, "persistence note", 8_192),
  }
}

export function parseStartupState(value: unknown): StartupState {
  const input = record(value, "startup state")
  return {
    recentProjects: arrayValue(input.recentProjects, "recent projects", 12, (project) => {
      const item = record(project, "recent project")
      return {
        name: nonEmptyString(item.name, "recent project name", 4_096),
        path: canonicalProjectPath(
          nonEmptyString(item.path, "recent project path", PATH_LIMIT)
        ),
        lastOpenedAt: integer(item.lastOpenedAt, "recent project time", 0, Number.MAX_SAFE_INTEGER),
        availability: enumValue(item.availability, "project availability", [
          "available",
          "missing",
        ]),
      }
    }),
    lastWorkspace:
      input.lastWorkspace === null ? null : parseWorkspaceState(input.lastWorkspace),
    restorationNotice: nullableString(input.restorationNotice, "restoration notice", 16_384),
  }
}

export function parseAppPreferences(value: unknown): AppPreferences {
  const input = record(value, "application preferences")
  const accentColor = stringValue(input.accentColor, "accent color", 7)
  if (!/^#[dA-Fa-f]{6}$/.test(accentColor))
    throw new IpcContractError("accent color")
  return {
    colorTheme: enumValue(input.colorTheme, "color theme", [
      "system",
      "light",
      "dark",
      "custom",
    ]),
    accentColor,
  }
}

export function parseSourceDocument(value: unknown): SourceDocument {
  const input = record(value, "source document")
  const content = stringValue(input.content, "source content", CONTENT_LIMIT)
  const byteLength = integer(input.byteLength, "source byte length", 0, CONTENT_LIMIT)
  const revision = parseSourceRevision(input.revision)
  if (revision.byteLength !== byteLength) throw new IpcContractError("source revision")
  return {
    path: projectRelativePath(nonEmptyString(input.path, "source path", PATH_LIMIT)),
    content,
    byteLength,
    revision,
  }
}

function parseSourceRevision(value: unknown): SourceRevision {
  const input = record(value, "source revision")
  const contentHash = stringValue(input.contentHash, "source hash", 64)
  if (!/^[\dA-Fa-f]{64}$/.test(contentHash)) throw new IpcContractError("source hash")
  return {
    byteLength: integer(input.byteLength, "source byte length", 0, CONTENT_LIMIT),
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
    savedAt: integer(input.savedAt, "recovery timestamp", 0, Number.MAX_SAFE_INTEGER),
  }
}

export function parseProjectSearchResponse(value: unknown): ProjectSearchResponse {
  const input = record(value, "project search")
  return {
    results: arrayValue(input.results, "search results", 500, (result) => {
      const item = record(result, "search result")
      return {
        path: projectRelativePath(nonEmptyString(item.path, "search path", PATH_LIMIT)),
        line: integer(item.line, "search line", 1, Number.MAX_SAFE_INTEGER),
        column: integer(item.column, "search column", 1, Number.MAX_SAFE_INTEGER),
        context: stringValue(item.context, "search context", 361),
        revision: parseSourceRevision(item.revision),
      }
    }),
    totalMatches: integer(input.totalMatches, "search match count", 0, Number.MAX_SAFE_INTEGER),
    searchedFiles: integer(input.searchedFiles, "searched file count", 0, 2_048),
    truncated: booleanValue(input.truncated, "search truncation"),
  }
}

export function parseReplaceResponse(value: unknown): ReplaceResponse {
  const input = record(value, "replace response")
  const transactionId = stringValue(input.transactionId, "replace transaction", 64)
  if (!/^[\dA-Fa-f]{64}$/.test(transactionId))
    throw new IpcContractError("replace transaction")
  return {
    transactionId,
    changedFiles: integer(input.changedFiles, "changed file count", 0, 128),
    replacedMatches: integer(input.replacedMatches, "replaced match count", 0, Number.MAX_SAFE_INTEGER),
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

export function parseBinaryResponse(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (value instanceof Uint8Array) return value
  throw new IpcContractError("PDF data")
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
    children: arrayValue(input.children, "project entry children", 2_048, (child) =>
      parseProjectEntry(child, budget, depth + 1)
    ),
  }
}

function parseWorkspaceState(value: unknown): WorkspaceState {
  const input = record(value, "workspace state")
  return {
    projectPath: canonicalProjectPath(
      nonEmptyString(input.projectPath, "workspace project path", PATH_LIMIT)
    ),
    pinnedFiles: arrayValue(input.pinnedFiles, "pinned files", MAX_WORKSPACE_FILES, (path) =>
      projectRelativePath(nonEmptyString(path, "pinned file", PATH_LIMIT))
    ),
    selectedRoot: parseNullableRelativePath(input.selectedRoot, "selected root"),
    selectedFile: parseNullableRelativePath(input.selectedFile, "selected file"),
    sidebarWidth: integer(input.sidebarWidth, "sidebar width", 220, 4_096),
    editorFontSize: integer(input.editorFontSize, "editor font size", 11, 24),
    pdfPaneOpen: booleanValue(input.pdfPaneOpen, "PDF pane state"),
    pdfPaneWidth: integer(input.pdfPaneWidth, "PDF pane width", 160, 4_096),
    buildPanelOpen: booleanValue(input.buildPanelOpen, "build panel state"),
    buildPanelHeight: integer(input.buildPanelHeight, "build panel height", 160, 4_096),
    sidebarTab: enumValue(input.sidebarTab, "sidebar tab", ["files", "outline", "references"]),
    buildPanelTab: enumValue(input.buildPanelTab, "build panel tab", ["output", "problems"]),
    bottomPanelTab: input.bottomPanelTab === "terminal" ? "terminal" : "build",
    buildProfile: enumValue(input.buildProfile, "build profile", [
      "latexmkPdf",
      "pdfLatex",
      "xeLatex",
      "luaLatex",
    ]),
    selectedPdf: parseNullableRelativePath(input.selectedPdf, "selected PDF"),
    pdfViewerStates: parseStateMap(input.pdfViewerStates, parsePdfViewerState),
    editorViewerStates: parseStateMap(input.editorViewerStates, parseEditorViewerState),
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
  if (value === 0 || value === 90 || value === 180 || value === 270) return value
  throw new IpcContractError("PDF rotation")
}

function parseEditorViewerState(value: unknown): EditorViewerState {
  const input = record(value, "editor viewer state")
  return {
    line: integer(input.line, "editor line", 1, Number.MAX_SAFE_INTEGER),
    column: integer(input.column, "editor column", 1, Number.MAX_SAFE_INTEGER),
    scrollTop: finiteNumber(input.scrollTop, "editor vertical scroll", 0, Number.MAX_SAFE_INTEGER),
    scrollLeft: finiteNumber(input.scrollLeft, "editor horizontal scroll", 0, Number.MAX_SAFE_INTEGER),
  }
}
