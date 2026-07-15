import { ProjectHomePage } from "@/pages/project-home-page"
import { ProjectWorkspacePage } from "@/pages/project-workspace-page"
import { useProjectSession } from "@/features/projects/use-project-session"
import { StartupScreen } from "@/components/feedback/startup-screen"

export default function App() {
  const {
    chooseAndOpenProject,
    clearFeedback,
    closeFile,
    closeFiles,
    createProjectEntry,
    deleteProjectEntry,
    forgetProject,
    openProjectAtPath,
    pinFile,
    resizeSidebar,
    returnHome,
    previewFile,
    renameProjectEntry,
    selectRoot,
    state,
  } = useProjectSession()

  if (state.status === "starting") return <StartupScreen />
  if (state.status === "workspace") {
    return (
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
        onPinFile={pinFile}
        onPreviewFile={previewFile}
        onRenameProjectEntry={renameProjectEntry}
        onSelectRoot={selectRoot}
        session={state.session}
      />
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
