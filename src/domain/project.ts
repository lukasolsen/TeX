export type ProjectEntryKind = "directory" | "file"

export type ProjectEntry = {
  name: string
  kind: ProjectEntryKind
  children: ProjectEntry[]
}

export type RootEvidence = "documentClass" | "magicComment"

export type RootCandidate = {
  path: string
  evidence: RootEvidence[]
}

export type ProjectSummary = {
  name: string
  path: string
  tree: ProjectEntry
  rootCandidates: RootCandidate[]
  rootDetectionNote: string | null
  persistenceNote: string | null
}

export type ProjectAvailability = "available" | "missing"

export type RecentProject = {
  name: string
  path: string
  lastOpenedAt: number
  availability: ProjectAvailability
}

export type WorkspaceState = {
  projectPath: string
  pinnedFiles: string[]
  selectedRoot: string | null
  selectedFile: string | null
  sidebarWidth: number
  editorFontSize: number
  pdfPaneOpen: boolean
  pdfPaneWidth: number
  buildPanelOpen: boolean
  buildPanelHeight: number
  sidebarTab: ProjectSidebarTab
  buildPanelTab: BuildPanelTab
  buildProfile: BuildProfile
  selectedPdf: string | null
  pdfViewerStates: Record<string, PdfViewerState>
  editorViewerStates: Record<string, EditorViewerState>
}

export type ProjectSidebarTab = "files" | "outline" | "references"
export type BuildPanelTab = "output" | "problems"
export type BuildProfile = "latexmkPdf" | "pdfLatex" | "xeLatex" | "luaLatex"
export type WorkspaceFocus = "source" | "pdf"

export type EditorViewerState = {
  line: number
  column: number
  scrollTop: number
  scrollLeft: number
}

export type PdfLayoutMode = "continuous" | "single"
export type PdfSidebarMode = "none" | "outline"

export type PdfViewerState = {
  page: number
  position: number
  zoom: number
  rotation: 0 | 90 | 180 | 270
  layout: PdfLayoutMode
  sidebar: PdfSidebarMode
}

export type ColorTheme = "system" | "light" | "dark" | "custom"

export type AppPreferences = {
  colorTheme: ColorTheme
  accentColor: string
}

export type StartupState = {
  recentProjects: RecentProject[]
  lastWorkspace: WorkspaceState | null
  restorationNotice: string | null
}

export type SourceDocument = {
  path: string
  content: string
  byteLength: number
  revision: SourceRevision
}

export type SourceRevision = {
  byteLength: number
  contentHash: string
}

export type RecoveryDraft = {
  projectPath: string
  relativePath: string
  content: string
  baseRevision: SourceRevision
  savedAt: number
}

export type ProjectError = {
  code: string
  message: string
}

export type AsyncDocumentState =
  | { status: "empty" }
  | { status: "loading"; path: string }
  | {
      status: "ready"
      document: SourceDocument
      content: string
      saveState: DocumentSaveState
    }
  | { status: "error"; path: string; error: ProjectError }

export type DocumentSaveState =
  | { status: "saved" }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "error"; error: ProjectError }
  | { status: "conflict"; external: SourceDocument }
  | { status: "recovery"; draft: RecoveryDraft }

export type SearchMatch = {
  path: string
  line: number
  column: number
  context: string
  revision: SourceRevision
}

export type ProjectSearchResponse = {
  results: SearchMatch[]
  totalMatches: number
  searchedFiles: number
  truncated: boolean
}

export type ReplaceResponse = {
  transactionId: string
  changedFiles: number
  replacedMatches: number
}

export type OpenProjectFeedback =
  | { status: "idle" }
  | { status: "choosing" }
  | { status: "opening"; path: string }
  | { status: "cancelled" }
  | { status: "error"; error: ProjectError }

export type ProjectSession = {
  project: ProjectSummary
  workspace: WorkspaceState
  documentState: AsyncDocumentState
  notice: string | null
}

export type AppSessionState =
  | { status: "starting" }
  | {
      status: "home"
      startup: StartupState
      openFeedback: OpenProjectFeedback
    }
  | {
      status: "workspace"
      session: ProjectSession
      openFeedback: OpenProjectFeedback
    }
