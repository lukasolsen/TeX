import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactElement } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { WorkspaceFocus } from "@/domain/project"
import type { CanonicalProjectPath } from "@/domain/identifiers"

import { ProjectHomePage } from "@/pages/project-home-page"
import { useProjectSession } from "@/features/projects/use-project-session"
import { NotificationProvider } from "@/components/feedback/notification-provider"
import { StartupScreen } from "@/components/feedback/startup-screen"
import { SettingsDialog } from "@/features/settings/settings-dialog"
import { useAppPreferences } from "@/features/settings/use-app-preferences"
import { runDetached } from "@/lib/promises"
import { WindowChrome } from "@/components/window-chrome/window-chrome"
import { shouldRestoreStartupWorkspace } from "@/components/window-chrome/window-chrome-model"
import { createNewWindow } from "@/services/project-service"
import { countHiddenEntries } from "@/features/projects/project-model"
import { RecentProjectsDialog } from "@/features/projects/recent-projects-dialog"

const ProjectWorkspacePage = lazy(() =>
  import("@/pages/project-workspace-page").then((module) => ({
    default: module.ProjectWorkspacePage,
  }))
)

export default function App(): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recentProjectsOpen, setRecentProjectsOpen] = useState(false)
  const [workspaceFocus, setWorkspaceFocus] = useState<WorkspaceFocus>("source")
  const [focusRestoreToken, setFocusRestoreToken] = useState(0)
  const {
    addHiddenFileRule,
    isHidden,
    preferences,
    removeHiddenFileRule,
    resetSection,
    saveError,
    update,
  } = useAppPreferences()
  const restoreStartupWorkspace = shouldRestoreStartupWorkspace(
    getCurrentWindow().label
  )
  const {
    chooseAndOpenProject,
    clearFeedback,
    closeFile,
    closeFiles,
    createProjectEntry,
    deleteProjectEntry,
    editDocument,
    forgetProject,
    openProjectAtPath,
    openPdf,
    pinFile,
    refreshProjectFiles,
    resizeSidebar,
    returnHome,
    previewFile,
    renameProjectEntry,
    resolveExternalChange,
    resolveRecovery,
    selectRoot,
    setEditorFontSize,
    saveActiveDocument,
    state,
    updatePdfViewerState,
    updateEditorViewerState,
    updateWorkspaceView,
  } = useProjectSession({ restoreStartupWorkspace })
  const openNewWindow = useCallback(() => {
    runDetached(createNewWindow())
  }, [])
  // Opening another project replaces the session, so the document the user is
  // editing is written first; a failed save keeps them where they are.
  const openRecentProject = useCallback(
    async (path: CanonicalProjectPath) => {
      if (!(await saveActiveDocument())) return
      await openProjectAtPath(path)
    },
    [openProjectAtPath, saveActiveDocument]
  )
  const onProjectFilesChanged = useCallback(() => {
    runDetached(refreshProjectFiles())
  }, [refreshProjectFiles])

  useEffect(() => {
    // Window-level chords stay out of the way while a modal owns the keyboard.
    if (settingsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault()
        openNewWindow()
      } else if (
        modifier &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "r"
      ) {
        // The webview would otherwise reload and discard the session.
        event.preventDefault()
        setRecentProjectsOpen(true)
      }
    }
    const openRecentProjects = () => setRecentProjectsOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("tex:open-recent-projects", openRecentProjects)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("tex:open-recent-projects", openRecentProjects)
    }
  }, [openNewWindow, settingsOpen])

  // Settings shows this so the rule list can be judged against a real project
  // rather than in the abstract; null simply means no project is open.
  const projectTree =
    state.status === "workspace" ? state.session.project.tree : null
  const hiddenInProject = useMemo(
    () =>
      projectTree === null ? null : countHiddenEntries(projectTree, isHidden),
    [isHidden, projectTree]
  )

  const workspace =
    state.status === "workspace" ? state.session.workspace : null
  // Settings is a modal over the workspace, so closing it hands the caret back
  // to the surface the user was editing rather than to the chrome button.
  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setFocusRestoreToken((token) => token + 1)
  }, [])

  let content: ReactElement
  let onReturnHome: (() => void) | null = null

  if (state.status === "starting") {
    content = <StartupScreen />
  } else if (state.status === "workspace") {
    onReturnHome = () => runDetached(returnHome())
    content = (
      <Suspense fallback={<StartupScreen />}>
        <ProjectWorkspacePage
          feedback={state.openFeedback}
          key={state.session.project.path}
          onOpenProject={() => runDetached(chooseAndOpenProject())}
          onOpenPdf={openPdf}
          isHidden={isHidden}
          preferences={preferences}
          shortcutsEnabled={!settingsOpen}
          onOpenSettings={(focus) => {
            setWorkspaceFocus(focus)
            setSettingsOpen(true)
          }}
          onReturnHome={() => runDetached(returnHome())}
          onResizeSidebar={resizeSidebar}
          onCloseFile={(path) => runDetached(closeFile(path))}
          onCloseFiles={(paths) => runDetached(closeFiles(paths))}
          onCreateProjectEntry={createProjectEntry}
          onDeleteProjectEntry={deleteProjectEntry}
          onEditDocument={editDocument}
          onPinFile={pinFile}
          onPreviewFile={previewFile}
          onRenameProjectEntry={renameProjectEntry}
          onResolveExternalChange={(keepMine) =>
            runDetached(resolveExternalChange(keepMine))
          }
          onResolveRecovery={(restore) => runDetached(resolveRecovery(restore))}
          onProjectFilesChanged={onProjectFilesChanged}
          onSaveDocument={saveActiveDocument}
          onSelectRoot={selectRoot}
          onSetEditorFontSize={setEditorFontSize}
          session={state.session}
          onUpdatePdfViewerState={updatePdfViewerState}
          onUpdateEditorViewerState={updateEditorViewerState}
          onUpdateWorkspaceView={updateWorkspaceView}
          restoreFocus={workspaceFocus}
          restoreFocusToken={focusRestoreToken}
        />
      </Suspense>
    )
  } else {
    content = (
      <ProjectHomePage
        feedback={state.openFeedback}
        onClearFeedback={clearFeedback}
        onForgetProject={(path) => runDetached(forgetProject(path))}
        onOpenProject={() => runDetached(chooseAndOpenProject())}
        onOpenRecent={(path) => runDetached(openRecentProject(path))}
        onOpenSettings={() => setSettingsOpen(true)}
        startup={state.startup}
      />
    )
  }

  const applicationReady = state.status !== "starting"
  return (
    <NotificationProvider>
      <div className="flex h-svh min-h-0 flex-col overflow-hidden">
        <WindowChrome
          onNewWindow={openNewWindow}
          onOpenCommands={
            state.status === "workspace" && !settingsOpen
              ? () =>
                  window.dispatchEvent(new Event("tex:open-command-palette"))
              : null
          }
          onWorkspaceAction={
            state.status === "workspace" && !settingsOpen
              ? (action) =>
                  window.dispatchEvent(
                    new CustomEvent("tex:workspace-action", { detail: action })
                  )
              : null
          }
          onOpenProject={
            applicationReady ? () => runDetached(chooseAndOpenProject()) : null
          }
          onOpenRecentProjects={
            applicationReady && !settingsOpen
              ? () => setRecentProjectsOpen(true)
              : null
          }
          onOpenSettings={applicationReady ? () => setSettingsOpen(true) : null}
          onReturnHome={onReturnHome}
        />
        <div className="min-h-0 flex-1">{content}</div>
        <RecentProjectsDialog
          onOpenChange={setRecentProjectsOpen}
          onOpenProject={() => runDetached(chooseAndOpenProject())}
          onOpenRecent={(path) => runDetached(openRecentProject(path))}
          open={recentProjectsOpen}
        />
        <SettingsDialog
          hiddenInProject={hiddenInProject}
          onAddHiddenFileRule={addHiddenFileRule}
          onOpenChange={(next) =>
            next ? setSettingsOpen(true) : closeSettings()
          }
          onRemoveHiddenFileRule={removeHiddenFileRule}
          onResetSection={resetSection}
          onSetEditorFontSize={setEditorFontSize}
          onSetSidebarWidth={(width) => resizeSidebar(width, true)}
          onUpdate={update}
          open={settingsOpen}
          preferences={preferences}
          saveError={saveError}
          workspace={workspace}
        />
      </div>
    </NotificationProvider>
  )
}
