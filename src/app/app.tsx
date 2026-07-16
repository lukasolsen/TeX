import { lazy, Suspense, useState } from "react"
import type { WorkspaceFocus } from "@/domain/project"

import { ProjectHomePage } from "@/pages/project-home-page"
import { useProjectSession } from "@/features/projects/use-project-session"
import { StartupScreen } from "@/components/feedback/startup-screen"
import { SettingsPage } from "@/pages/settings-page"
import { useAppPreferences } from "@/features/settings/use-app-preferences"

const ProjectWorkspacePage = lazy(() =>
  import("@/pages/project-workspace-page").then((module) => ({
    default: module.ProjectWorkspacePage,
  }))
)

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceFocus, setWorkspaceFocus] = useState<WorkspaceFocus>("source")
  const [focusRestoreToken, setFocusRestoreToken] = useState(0)
  const { preferences, saveError, setAccentColor, setColorTheme } =
    useAppPreferences()
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
  } = useProjectSession()

  if (state.status === "starting") return <StartupScreen />
  if (settingsOpen) {
    const workspace =
      state.status === "workspace" ? state.session.workspace : null
    return (
      <SettingsPage
        accentColor={preferences.accentColor}
        colorTheme={preferences.colorTheme}
        onClose={() => {
          setSettingsOpen(false)
          if (workspace !== null) {
            setFocusRestoreToken((token) => token + 1)
          }
        }}
        onSetColorTheme={setColorTheme}
        onSetAccentColor={setAccentColor}
        onSetEditorFontSize={setEditorFontSize}
        onSetSidebarWidth={(width) => resizeSidebar(width, true)}
        saveError={saveError}
        workspace={workspace}
      />
    )
  }
  if (state.status === "workspace") {
    return (
      <Suspense fallback={<StartupScreen />}>
        <ProjectWorkspacePage
          feedback={state.openFeedback}
          key={state.session.project.path}
          onOpenProject={chooseAndOpenProject}
          onOpenPdf={openPdf}
          onOpenSettings={(focus) => {
            setWorkspaceFocus(focus)
            setSettingsOpen(true)
          }}
          onReturnHome={returnHome}
          onResizeSidebar={resizeSidebar}
          onCloseFile={closeFile}
          onCloseFiles={closeFiles}
          onCreateProjectEntry={createProjectEntry}
          onDeleteProjectEntry={deleteProjectEntry}
          onEditDocument={editDocument}
          onPinFile={pinFile}
          onPreviewFile={previewFile}
          onRenameProjectEntry={renameProjectEntry}
          onResolveExternalChange={resolveExternalChange}
          onResolveRecovery={resolveRecovery}
          onProjectFilesChanged={refreshProjectFiles}
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
  }

  return (
    <ProjectHomePage
      feedback={state.openFeedback}
      onClearFeedback={clearFeedback}
      onForgetProject={forgetProject}
      onOpenProject={chooseAndOpenProject}
      onOpenRecent={openProjectAtPath}
      onOpenSettings={() => setSettingsOpen(true)}
      startup={state.startup}
    />
  )
}
