import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import type { ReactElement } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { WorkspaceFocus } from "@/domain/project"

import { ProjectHomePage } from "@/pages/project-home-page"
import { useProjectSession } from "@/features/projects/use-project-session"
import { NotificationProvider } from "@/components/feedback/notification-provider"
import { StartupScreen } from "@/components/feedback/startup-screen"
import { SettingsPage } from "@/pages/settings-page"
import { useAppPreferences } from "@/features/settings/use-app-preferences"
import { runDetached } from "@/lib/promises"
import { WindowChrome } from "@/components/window-chrome/window-chrome"
import { shouldRestoreStartupWorkspace } from "@/components/window-chrome/window-chrome-model"
import { createNewWindow } from "@/services/project-service"

const ProjectWorkspacePage = lazy(() =>
  import("@/pages/project-workspace-page").then((module) => ({
    default: module.ProjectWorkspacePage,
  }))
)

export default function App(): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceFocus, setWorkspaceFocus] = useState<WorkspaceFocus>("source")
  const [focusRestoreToken, setFocusRestoreToken] = useState(0)
  const { preferences, saveError, setAccentColor, setColorTheme } =
    useAppPreferences()
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault()
        openNewWindow()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openNewWindow])

  let content: ReactElement
  let onReturnHome: (() => void) | null = null

  if (state.status === "starting") {
    content = <StartupScreen />
  } else if (settingsOpen) {
    const workspace =
      state.status === "workspace" ? state.session.workspace : null
    onReturnHome = () => {
      setSettingsOpen(false)
      if (workspace !== null) {
        setFocusRestoreToken((token) => token + 1)
      }
    }
    content = (
      <SettingsPage
        accentColor={preferences.accentColor}
        colorTheme={preferences.colorTheme}
        onClose={onReturnHome}
        onSetColorTheme={setColorTheme}
        onSetAccentColor={setAccentColor}
        onSetEditorFontSize={setEditorFontSize}
        onSetSidebarWidth={(width) => resizeSidebar(width, true)}
        saveError={saveError}
        workspace={workspace}
      />
    )
  } else if (state.status === "workspace") {
    onReturnHome = () => runDetached(returnHome())
    content = (
      <Suspense fallback={<StartupScreen />}>
        <ProjectWorkspacePage
          feedback={state.openFeedback}
          key={state.session.project.path}
          onOpenProject={() => runDetached(chooseAndOpenProject())}
          onOpenPdf={openPdf}
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
          onProjectFilesChanged={() => runDetached(refreshProjectFiles())}
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
        onOpenRecent={(path) => runDetached(openProjectAtPath(path))}
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
          onOpenSettings={applicationReady ? () => setSettingsOpen(true) : null}
          onReturnHome={onReturnHome}
        />
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    </NotificationProvider>
  )
}
