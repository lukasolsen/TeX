import type { ReactElement } from "react"
import { Laptop, Moon, Sun } from "lucide-react"

import type { ColorTheme } from "@/domain/project"
import type { AppPreferences, InterfaceScale } from "@/domain/preferences"
import {
  SegmentedChoice,
  SettingRow,
  SettingsHeading,
  type ChoiceOption,
} from "@/features/settings/settings-controls"
import type { PreferencePatch } from "@/features/settings/use-app-preferences"
import { cn } from "@/lib/utils"

const themeOptions: ReadonlyArray<ChoiceOption<ColorTheme>> = [
  { value: "system", label: "Match system", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
]

const scaleOptions: ReadonlyArray<ChoiceOption<InterfaceScale>> = [
  { value: "compact", label: "Compact" },
  { value: "default", label: "Default" },
  { value: "comfortable", label: "Comfortable" },
]

/** Accent presets, so a usable colour is one click away rather than a hex guess. */
const accentPresets: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#2563eb", label: "Blue" },
  { value: "#0f766e", label: "Teal" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#c2410c", label: "Amber" },
  { value: "#be123c", label: "Crimson" },
  { value: "#3f6212", label: "Moss" },
]

export function AppearanceSettings({
  onReset,
  onUpdate,
  preferences,
}: {
  onReset: () => void
  onUpdate: (patch: PreferencePatch) => void
  preferences: AppPreferences
}): ReactElement {
  const { accentColor, colorTheme, interfaceScale } = preferences.appearance
  const usingPreset = accentPresets.some(
    (preset) => preset.value.toLowerCase() === accentColor.toLowerCase()
  )
  return (
    <section aria-labelledby="settings-heading-appearance">
      <SettingsHeading
        onReset={onReset}
        preferences={preferences}
        section="appearance"
      >
        Appearance
      </SettingsHeading>

      <SettingRow title="Colour theme">
        <SegmentedChoice
          compact
          label="Colour theme"
          onChange={(value) => onUpdate({ appearance: { colorTheme: value } })}
          options={themeOptions}
          value={colorTheme}
        />
      </SettingRow>

      <SettingRow
        description="Tints buttons, links, and selection in both light and dark."
        layout="stacked"
        title="Accent colour"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {accentPresets.map((preset) => {
            const selected =
              accentColor.toLowerCase() === preset.value.toLowerCase()
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs transition-colors duration-100 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  selected && "border-primary text-foreground"
                )}
                key={preset.value}
                onClick={() =>
                  onUpdate({ appearance: { accentColor: preset.value } })
                }
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ backgroundColor: preset.value }}
                />
                {preset.label}
              </button>
            )
          })}
          <label
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border bg-background pr-2 pl-1.5 text-xs",
              !usingPreset && "border-primary"
            )}
          >
            <input
              aria-label="Custom accent colour"
              className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
              onChange={(event) =>
                onUpdate({ appearance: { accentColor: event.target.value } })
              }
              type="color"
              value={accentColor}
            />
            <span className="font-mono uppercase">{accentColor}</span>
          </label>
        </div>
      </SettingRow>

      <SettingRow
        description="Scales every control, label, and panel together. The source editor keeps its own font size."
        title="Interface scale"
      >
        <SegmentedChoice
          label="Interface scale"
          onChange={(value) =>
            onUpdate({ appearance: { interfaceScale: value } })
          }
          options={scaleOptions}
          value={interfaceScale}
        />
      </SettingRow>
    </section>
  )
}
