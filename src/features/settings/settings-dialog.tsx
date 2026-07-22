import { useEffect, useRef, useState, type ReactElement } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { HiddenFileRule, WorkspaceState } from "@/domain/project"
import type { AppPreferences } from "@/domain/preferences"
import { AppearanceSettings } from "@/features/settings/appearance-settings"
import { AssistanceSettings } from "@/features/settings/assistance-settings"
import { BuildSettings } from "@/features/settings/build-settings"
import { EditorSettings } from "@/features/settings/editor-settings"
import { FilesSettings } from "@/features/settings/files-settings"
import { PdfSettings } from "@/features/settings/pdf-settings"
import { SettingsSearch } from "@/features/settings/settings-search"
import { WorkspaceSettings } from "@/features/settings/workspace-settings"
import {
  navGroupLabels,
  sectionOf,
  settingsSections,
  type SettingsNavGroup,
  type SettingsSectionId,
} from "@/features/settings/settings-catalog"
import type {
  AddHiddenFileRuleResult,
  PreferencePatch,
} from "@/features/settings/use-app-preferences"
import { cn } from "@/lib/utils"

const navGroups: ReadonlyArray<SettingsNavGroup> = ["application", "project"]

/**
 * Settings, as a modal over the workspace rather than a page that replaces it.
 * The workspace stays mounted underneath, so opening settings never costs the
 * user their editor state, and closing returns focus where it came from.
 *
 * One section is shown at a time. Search offers sections rather than filtering
 * the pane, so every control stays where the user learned it was.
 */
export function SettingsDialog({
  hiddenInProject,
  onAddHiddenFileRule,
  onOpenChange,
  onRemoveHiddenFileRule,
  onResetSection,
  onSetEditorFontSize,
  onSetSidebarWidth,
  onUpdate,
  open,
  preferences,
  saveError,
  workspace,
}: {
  hiddenInProject: number | null
  onAddHiddenFileRule: (rule: HiddenFileRule) => AddHiddenFileRuleResult
  onOpenChange: (open: boolean) => void
  onRemoveHiddenFileRule: (rule: HiddenFileRule) => void
  onResetSection: (section: keyof AppPreferences) => void
  onSetEditorFontSize: (fontSize: number) => void
  onSetSidebarWidth: (width: number) => void
  onUpdate: (patch: PreferencePatch) => void
  open: boolean
  preferences: AppPreferences
  saveError: string | null
  workspace: WorkspaceState | null
}): ReactElement {
  const [active, setActive] = useState<SettingsSectionId>("appearance")
  const pane = useRef<HTMLDivElement>(null)

  // Switching section starts the reader at the top of it, the way opening a new
  // page would; without this the pane keeps the previous section's offset.
  useEffect(() => {
    if (pane.current !== null) pane.current.scrollTop = 0
  }, [active])

  const resetActive = () => {
    const resets = sectionOf(active).resets
    if (resets !== null) onResetSection(resets)
  }

  const shared = {
    onReset: resetActive,
    onUpdate,
    preferences,
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(44rem,calc(100vh-4rem))] w-[min(58rem,calc(100vw-3rem))] max-w-none gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Application and project preferences, saved on this device as you
          change them.
        </DialogDescription>

        <nav
          aria-label="Settings sections"
          className="flex w-52 shrink-0 flex-col gap-3 border-r bg-sidebar p-2"
        >
          <SettingsSearch onSelect={setActive} />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {navGroups.map((group) => (
              <div key={group}>
                <p className="px-2 pb-1 text-xs text-muted-foreground">
                  {navGroupLabels[group]}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {settingsSections
                    .filter((section) => section.group === group)
                    .map((section) => {
                      const Icon = section.icon
                      const selected = section.id === active
                      return (
                        <li key={section.id}>
                          <button
                            aria-current={selected ? "page" : undefined}
                            className={cn(
                              "flex h-8 w-full items-center gap-2 rounded-md border border-transparent px-2 text-sm text-muted-foreground transition-colors duration-100 outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                              selected &&
                                "border-primary bg-sidebar-accent text-foreground"
                            )}
                            onClick={() => setActive(section.id)}
                            type="button"
                          >
                            <Icon aria-hidden="true" className="size-4" />
                            <span className="truncate">{section.label}</span>
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div
          className="min-w-0 flex-1 overflow-y-auto bg-background"
          ref={pane}
          tabIndex={-1}
        >
          <div className="mx-auto max-w-2xl px-6 py-6 pr-12">
            {saveError !== null ? (
              <Alert className="mb-4" variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}

            {active === "appearance" ? (
              <AppearanceSettings {...shared} />
            ) : null}
            {active === "editor" ? (
              <EditorSettings
                {...shared}
                onSetEditorFontSize={onSetEditorFontSize}
                workspace={workspace}
              />
            ) : null}
            {active === "assistance" ? (
              <AssistanceSettings {...shared} />
            ) : null}
            {active === "build" ? <BuildSettings {...shared} /> : null}
            {active === "pdf" ? <PdfSettings {...shared} /> : null}
            {active === "files" ? (
              <FilesSettings
                {...shared}
                hiddenInProject={hiddenInProject}
                onAddHiddenFileRule={onAddHiddenFileRule}
                onRemoveHiddenFileRule={onRemoveHiddenFileRule}
              />
            ) : null}
            {active === "workspace" ? (
              <WorkspaceSettings
                onSetSidebarWidth={onSetSidebarWidth}
                preferences={preferences}
                workspace={workspace}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
