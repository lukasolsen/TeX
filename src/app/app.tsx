import { lazy, Suspense } from "react"

import { ProjectHomePage } from "@/pages/project-home-page"
import { useProjectSession } from "@/features/projects/use-project-session"
import { StartupScreen } from "@/components/feedback/startup-screen"

const ProjectWorkspacePage = lazy(() =>
  import("@/pages/project-workspace-page").then((module) => ({
    default: module.ProjectWorkspacePage,
  }))
)

export default function App() {
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
    pinFile,
    refreshActiveDocument,
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
  } = useProjectSession()

  if (state.status === "starting") return <StartupScreen />
  if (state.status === "workspace") {
    return (
      <Suspense fallback={<StartupScreen />}>
        <ProjectWorkspacePage
          feedback={state.openFeedback}
          key={state.session.project.path}
          onOpenProject={chooseAndOpenProject}
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
          onProjectFilesChanged={refreshActiveDocument}
          onSaveDocument={() => void saveActiveDocument()}
          onSelectRoot={selectRoot}
          onSetEditorFontSize={setEditorFontSize}
          session={state.session}
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
      startup={state.startup}
    />
  )
}
