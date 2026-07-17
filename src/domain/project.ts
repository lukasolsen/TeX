import type {
  CanonicalProjectPath,
  ProjectRelativePath,
  RevisionHash,
} from "@/domain/identifiers"

export type ProjectEntryKind = "directory" | "file"

export type ProjectEntry = Readonly<{
  name: string
  kind: ProjectEntryKind
  children: ReadonlyArray<ProjectEntry>
}>

export type RootEvidence = "documentClass" | "magicComment" | "configured"

export type RootCandidate = Readonly<{
  path: ProjectRelativePath
  evidence: ReadonlyArray<RootEvidence>
}>

export type ProjectSummary = Readonly<{
  name: string
  path: CanonicalProjectPath
  tree: ProjectEntry
  rootCandidates: ReadonlyArray<RootCandidate>
  rootDetectionNote: string | null
  persistenceNote: string | null
}>

export type ProjectAvailability = "available" | "missing"

export type RecentProject = Readonly<{
  name: string
  path: CanonicalProjectPath
  lastOpenedAt: number
  availability: ProjectAvailability
}>

export type WorkspaceState = Readonly<{
  projectPath: CanonicalProjectPath
  pinnedFiles: ReadonlyArray<ProjectRelativePath>
  selectedRoot: ProjectRelativePath | null
  selectedFile: ProjectRelativePath | null
  sidebarWidth: number
  editorFontSize: number
  pdfPaneOpen: boolean
  pdfPaneWidth: number
  buildPanelOpen: boolean
  buildPanelHeight: number
  sidebarTab: ProjectSidebarTab
  buildPanelTab: BuildPanelTab
  bottomPanelTab: BottomPanelTab
  buildProfile: BuildProfile
  selectedPdf: ProjectRelativePath | null
  pdfViewerStates: Readonly<Record<string, PdfViewerState>>
  editorViewerStates: Readonly<Record<string, EditorViewerState>>
}>

export type ProjectSidebarTab = "files" | "outline" | "references"
export type BuildPanelTab = "output" | "problems"
export type BottomPanelTab = "build" | "terminal"
export type BuildProfile = "latexmkPdf" | "pdfLatex" | "xeLatex" | "luaLatex"
export type WorkspaceFocus = "source" | "pdf"

export type EditorViewerState = Readonly<{
  line: number
  column: number
  scrollTop: number
  scrollLeft: number
}>

export type EditorDocumentChange = Readonly<{
  content: string
  composing: boolean
}>

export type PdfLayoutMode = "continuous" | "single"
export type PdfSidebarMode = "none" | "outline"

export type PdfViewerState = Readonly<{
  page: number
  position: number
  zoom: number
  rotation: 0 | 90 | 180 | 270
  layout: PdfLayoutMode
  sidebar: PdfSidebarMode
}>

export type ColorTheme = "system" | "light" | "dark" | "custom"

export type AppPreferences = Readonly<{
  colorTheme: ColorTheme
  accentColor: string
}>

export type StartupState = Readonly<{
  recentProjects: ReadonlyArray<RecentProject>
  lastWorkspace: WorkspaceState | null
  restorationNotice: string | null
}>

export type SourceDocument = Readonly<{
  path: ProjectRelativePath
  content: string
  byteLength: number
  revision: SourceRevision
}>

export type SourceRevision = Readonly<{
  byteLength: number
  contentHash: RevisionHash
}>

export type RecoveryDraft = Readonly<{
  projectPath: CanonicalProjectPath
  relativePath: ProjectRelativePath
  content: string
  baseRevision: SourceRevision
  savedAt: number
}>

export type ProjectError = Readonly<{
  code: string
  message: string
}>

export type AsyncDocumentState =
  | { status: "empty" }
  | { status: "loading"; path: ProjectRelativePath }
  | {
      status: "ready"
      document: SourceDocument
      content: string
      saveState: DocumentSaveState
    }
  | { status: "error"; path: ProjectRelativePath; error: ProjectError }

export type DocumentSaveState =
  | { status: "saved" }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "error"; error: ProjectError }
  | { status: "conflict"; external: SourceDocument }
  | { status: "recovery"; draft: RecoveryDraft }

export type SearchMatch = Readonly<{
  path: ProjectRelativePath
  line: number
  column: number
  context: string
  revision: SourceRevision
}>

export type ProjectSearchResponse = Readonly<{
  results: ReadonlyArray<SearchMatch>
  totalMatches: number
  searchedFiles: number
  truncated: boolean
}>

export type ReplaceResponse = Readonly<{
  transactionId: string
  changedFiles: number
  replacedMatches: number
}>

export type OpenProjectFeedback =
  | { status: "idle" }
  | { status: "choosing" }
  | { status: "opening"; path: CanonicalProjectPath }
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
