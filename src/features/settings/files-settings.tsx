import type { ReactElement } from "react"

import type { HiddenFileRule } from "@/domain/project"
import {
  defaultAppPreferences,
  type AppPreferences,
} from "@/domain/preferences"
import { FileFilterSettings } from "@/features/settings/file-filter-settings"
import {
  SettingRow,
  SettingsHeading,
  Toggle,
} from "@/features/settings/settings-controls"
import type {
  AddHiddenFileRuleResult,
  PreferencePatch,
} from "@/features/settings/use-app-preferences"

export function FilesSettings({
  hiddenInProject,
  onAddHiddenFileRule,
  onRemoveHiddenFileRule,
  onReset,
  onUpdate,
  preferences,
}: {
  hiddenInProject: number | null
  onAddHiddenFileRule: (rule: HiddenFileRule) => AddHiddenFileRuleResult
  onRemoveHiddenFileRule: (rule: HiddenFileRule) => void
  onReset: () => void
  onUpdate: (patch: PreferencePatch) => void
  preferences: AppPreferences
}): ReactElement {
  return (
    <section aria-labelledby="settings-heading-files">
      <SettingsHeading
        onReset={onReset}
        preferences={preferences}
        section="files"
      >
        Files
      </SettingsHeading>

      <SettingRow
        description="Build artifacts like .aux and .log clutter the project sidebar, so TeX leaves them out of the listing. Turning this off lists everything without discarding your rules — no file is ever moved or deleted."
        title="Hide filtered items"
      >
        <Toggle
          checked={preferences.files.hideFilteredFiles}
          label="Hide filtered items in the project sidebar"
          onChange={(hideFilteredFiles) =>
            onUpdate({ files: { hideFilteredFiles } })
          }
        />
      </SettingRow>

      <SettingRow
        description="A file or folder is hidden when it matches any rule below."
        layout="stacked"
        title="Filter rules"
      >
        <FileFilterSettings
          hiddenInProject={hiddenInProject}
          onAddRule={onAddHiddenFileRule}
          onRemoveRule={onRemoveHiddenFileRule}
          onReset={() =>
            onUpdate({
              files: {
                hiddenFileRules: defaultAppPreferences.files.hiddenFileRules,
              },
            })
          }
          rules={preferences.files.hiddenFileRules}
        />
      </SettingRow>
    </section>
  )
}
