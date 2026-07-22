import type { ReactElement } from "react"

import type { AppPreferences } from "@/domain/preferences"
import {
  SettingRow,
  SettingsHeading,
  Toggle,
} from "@/features/settings/settings-controls"
import type { PreferencePatch } from "@/features/settings/use-app-preferences"

export function BuildSettings({
  onReset,
  onUpdate,
  preferences,
}: {
  onReset: () => void
  onUpdate: (patch: PreferencePatch) => void
  preferences: AppPreferences
}): ReactElement {
  const build = preferences.build
  return (
    <section aria-labelledby="settings-heading-build">
      <SettingsHeading
        onReset={onReset}
        preferences={preferences}
        section="build"
      >
        Build
      </SettingsHeading>

      <SettingRow
        description={
          build.saveBeforeBuild
            ? "A build reads the files on disk, so the open file is written first."
            : "Builds use the last saved version of each file. Unsaved edits are not compiled."
        }
        title="Save before building"
      >
        <Toggle
          checked={build.saveBeforeBuild}
          label="Save the open file before each build"
          onChange={(saveBeforeBuild) =>
            onUpdate({ build: { saveBeforeBuild } })
          }
        />
      </SettingRow>

      <SettingRow
        description="A failed build never replaces the PDF you were reading; this only brings the details to the front."
        title="Open the build panel on failure"
      >
        <Toggle
          checked={build.openPanelOnFailure}
          label="Open the build panel when a build fails"
          onChange={(openPanelOnFailure) =>
            onUpdate({ build: { openPanelOnFailure } })
          }
        />
      </SettingRow>

      <SettingRow
        description={
          build.openPanelOnFailure
            ? "Selects the Problems tab instead of the raw build output."
            : "Available once the build panel opens on failure."
        }
        title="Show the Problems tab first"
      >
        <Toggle
          checked={build.revealProblemsOnFailure}
          disabled={!build.openPanelOnFailure}
          label="Show the Problems tab first after a failed build"
          onChange={(revealProblemsOnFailure) =>
            onUpdate({ build: { revealProblemsOnFailure } })
          }
        />
      </SettingRow>
    </section>
  )
}
