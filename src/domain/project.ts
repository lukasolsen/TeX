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
}

export type ProjectError = {
  code: string
  message: string
}

export type AsyncDocumentState =
  | { status: "empty" }
  | { status: "loading"; path: string }
  | { status: "ready"; document: SourceDocument }
  | { status: "error"; path: string; error: ProjectError }

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
