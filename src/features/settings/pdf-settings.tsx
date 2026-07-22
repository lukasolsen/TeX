import type { ReactElement } from "react"

import type { PdfLayoutMode, PdfSidebarMode } from "@/domain/project"
import {
  MAX_PDF_ZOOM,
  MIN_PDF_ZOOM,
  type AppPreferences,
} from "@/domain/preferences"
import {
  SegmentedChoice,
  SettingRow,
  SettingsHeading,
  Stepper,
  type ChoiceOption,
} from "@/features/settings/settings-controls"
import type { PreferencePatch } from "@/features/settings/use-app-preferences"

const layoutOptions: ReadonlyArray<ChoiceOption<PdfLayoutMode>> = [
  { value: "continuous", label: "Continuous" },
  { value: "single", label: "Single page" },
]

const sidebarOptions: ReadonlyArray<ChoiceOption<PdfSidebarMode>> = [
  { value: "none", label: "Hidden" },
  { value: "outline", label: "Outline" },
]

export function PdfSettings({
  onReset,
  onUpdate,
  preferences,
}: {
  onReset: () => void
  onUpdate: (patch: PreferencePatch) => void
  preferences: AppPreferences
}): ReactElement {
  const pdf = preferences.pdf
  return (
    <section aria-labelledby="settings-heading-pdf">
      <SettingsHeading
        onReset={onReset}
        preferences={preferences}
        section="pdf"
      >
        PDF viewer
      </SettingsHeading>

      <SettingRow
        description="Used the first time you open a PDF. After that each document keeps the page, zoom, and layout you left it on, and a rebuild never resets them."
        title="Zoom"
      >
        <Stepper
          format={(value) => `${Math.round(value * 100)}%`}
          label="default PDF zoom"
          maximum={MAX_PDF_ZOOM}
          minimum={MIN_PDF_ZOOM}
          onChange={(defaultZoom) => onUpdate({ pdf: { defaultZoom } })}
          step={0.1}
          value={pdf.defaultZoom}
        />
      </SettingRow>

      <SettingRow title="Page layout">
        <SegmentedChoice
          label="Page layout"
          onChange={(defaultLayout) => onUpdate({ pdf: { defaultLayout } })}
          options={layoutOptions}
          value={pdf.defaultLayout}
        />
      </SettingRow>

      <SettingRow title="Sidebar">
        <SegmentedChoice
          label="Sidebar"
          onChange={(defaultSidebar) => onUpdate({ pdf: { defaultSidebar } })}
          options={sidebarOptions}
          value={pdf.defaultSidebar}
        />
      </SettingRow>
    </section>
  )
}
