import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import type { WorkspaceState } from "@/domain/project"
import type { AppPreferences } from "@/domain/preferences"
import {
  SettingRow,
  SettingsHeading,
} from "@/features/settings/settings-controls"

const DEFAULT_SIDEBAR_WIDTH = 288

/**
 * Layout belonging to the open project rather than to the application, so
 * nothing here has an application default to restore.
 */
export function WorkspaceSettings({
  onSetSidebarWidth,
  preferences,
  workspace,
}: {
  onSetSidebarWidth: (width: number) => void
  preferences: AppPreferences
  workspace: WorkspaceState | null
}): ReactElement {
  return (
    <section aria-labelledby="settings-heading-workspace">
      <SettingsHeading preferences={preferences} section="workspace">
        Workspace
      </SettingsHeading>

      <SettingRow
        description={
          workspace === null
            ? "Open a project to adjust its workspace layout."
            : `The sidebar is ${workspace.sidebarWidth} pixels wide. Drag its edge in the workspace, or reset it to ${DEFAULT_SIDEBAR_WIDTH}.`
        }
        title="Project files sidebar"
      >
        <Button
          disabled={
            workspace === null ||
            workspace.sidebarWidth === DEFAULT_SIDEBAR_WIDTH
          }
          onClick={() => onSetSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          size="sm"
          variant="outline"
        >
          Reset width
        </Button>
      </SettingRow>
    </section>
  )
}
