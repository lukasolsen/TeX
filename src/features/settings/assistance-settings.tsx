import type { ReactElement } from "react"

import {
  MAX_COMPLETION_LIMIT,
  MAX_HOVER_DELAY,
  MIN_COMPLETION_LIMIT,
  MIN_HOVER_DELAY,
  type AppPreferences,
} from "@/domain/preferences"
import {
  SettingRow,
  SettingsHeading,
  Stepper,
  Toggle,
} from "@/features/settings/settings-controls"
import type { PreferencePatch } from "@/features/settings/use-app-preferences"
import { shortcutLabel } from "@/lib/shortcuts"

export function AssistanceSettings({
  onReset,
  onUpdate,
  preferences,
}: {
  onReset: () => void
  onUpdate: (patch: PreferencePatch) => void
  preferences: AppPreferences
}): ReactElement {
  const assistance = preferences.assistance
  return (
    <section aria-labelledby="settings-heading-assistance">
      <SettingsHeading
        onReset={onReset}
        preferences={preferences}
        section="assistance"
      >
        Assistance
      </SettingsHeading>

      <SettingRow
        description="Commands, environments, packages, labels, citations, and project files are suggested from the documentation catalogue and from the project itself."
        title="Suggest completions"
      >
        <Toggle
          checked={assistance.completionEnabled}
          label="Suggest completions while editing"
          onChange={(completionEnabled) =>
            onUpdate({ assistance: { completionEnabled } })
          }
        />
      </SettingRow>

      <SettingRow
        description={
          assistance.completionEnabled
            ? `When off, suggestions appear only when you ask for them with ${shortcutLabel(["primary", "space"])}.`
            : "Available once suggestions are turned on."
        }
        title="Open the list as you type"
      >
        <Toggle
          checked={assistance.completionOnTyping}
          disabled={!assistance.completionEnabled}
          label="Open the suggestion list automatically"
          onChange={(completionOnTyping) =>
            onUpdate({ assistance: { completionOnTyping } })
          }
        />
      </SettingRow>

      <SettingRow
        description="A shorter list is faster to scan; a longer one shows more of a large package."
        title="Most suggestions shown at once"
      >
        <Stepper
          disabled={!assistance.completionEnabled}
          format={(value) => `${value}`}
          label="suggestion limit"
          maximum={MAX_COMPLETION_LIMIT}
          minimum={MIN_COMPLETION_LIMIT}
          onChange={(completionLimit) =>
            onUpdate({ assistance: { completionLimit } })
          }
          step={5}
          value={assistance.completionLimit}
        />
      </SettingRow>

      <SettingRow
        description="Resting the pointer on a command, environment, or reference shows what it does and where it is defined."
        title="Documentation on hover"
      >
        <Toggle
          checked={assistance.hoverDocumentation}
          label="Show documentation on hover"
          onChange={(hoverDocumentation) =>
            onUpdate({ assistance: { hoverDocumentation } })
          }
        />
      </SettingRow>

      <SettingRow
        description="How long the pointer must rest before the card appears."
        title="Hover delay"
      >
        <Stepper
          disabled={!assistance.hoverDocumentation}
          format={(value) => `${value} ms`}
          label="hover delay"
          maximum={MAX_HOVER_DELAY}
          minimum={MIN_HOVER_DELAY}
          onChange={(hoverDelay) => onUpdate({ assistance: { hoverDelay } })}
          step={50}
          value={assistance.hoverDelay}
        />
      </SettingRow>

      <SettingRow
        description="Checks the open file for unbalanced environments and unresolved references without running a build, and fills the Problems tab. Build diagnostics are always reported."
        title="Problem analysis"
      >
        <Toggle
          checked={assistance.diagnosticsEnabled}
          label="Analyse the open file while typing"
          onChange={(diagnosticsEnabled) =>
            onUpdate({ assistance: { diagnosticsEnabled } })
          }
        />
      </SettingRow>
    </section>
  )
}
