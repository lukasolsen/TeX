import { useState, type ReactNode } from "react"
import {
  ArrowLeft,
  Check,
  FilePenLine,
  Laptop,
  Moon,
  Palette,
  PanelLeft,
  Search,
  Sun,
  X,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { ColorTheme, WorkspaceState } from "@/domain/project"
import { cn } from "@/lib/utils"

type SettingsSection = "appearance" | "editor" | "workspace"

const sections: {
  id: SettingsSection
  label: string
  icon: typeof Palette
}[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "editor", label: "Editor", icon: FilePenLine },
  { id: "workspace", label: "Workspace", icon: PanelLeft },
]

const sectionSearchTerms: Record<SettingsSection, string> = {
  appearance: "appearance color theme system light dark custom accent",
  editor: "editor source font text size writing",
  workspace: "workspace project sidebar files layout width",
}

const themeOptions: {
  value: ColorTheme
  label: string
  detail: string
  icon: typeof Laptop
}[] = [
  {
    value: "system",
    label: "System",
    detail: "Match system",
    icon: Laptop,
  },
  { value: "light", label: "Light", detail: "Always light", icon: Sun },
  { value: "dark", label: "Dark", detail: "Always dark", icon: Moon },
  {
    value: "custom",
    label: "Custom",
    detail: "Use accent color",
    icon: Palette,
  },
]

function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="px-5 sm:px-6">{children}</div>
    </section>
  )
}

function SettingRow({
  children,
  description,
  modified = false,
  title,
}: {
  children: ReactNode
  description: string
  modified?: boolean
  title: string
}) {
  return (
    <div
      className={cn(
        "relative py-5",
        modified &&
          "before:absolute before:top-5 before:bottom-5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
      )}
    >
      <div className={cn("max-w-xl", modified && "sm:pl-3")}>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className={cn("mt-4", modified && "sm:pl-3")}>{children}</div>
    </div>
  )
}

export function SettingsPage({
  accentColor,
  colorTheme,
  onClose,
  onSetAccentColor,
  onSetColorTheme,
  onSetEditorFontSize,
  onSetSidebarWidth,
  saveError,
  workspace,
}: {
  accentColor: string
  colorTheme: ColorTheme
  onClose: () => void
  onSetAccentColor: (color: string) => void
  onSetColorTheme: (theme: ColorTheme) => void
  onSetEditorFontSize: (fontSize: number) => void
  onSetSidebarWidth: (width: number) => void
  saveError: string | null
  workspace: WorkspaceState | null
}) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("appearance")
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const isSearching = normalizedQuery.length > 0
  const matches = (terms: string) =>
    !isSearching || terms.toLowerCase().includes(normalizedQuery)
  const visibleSections = isSearching
    ? sections.filter((section) =>
        sectionSearchTerms[section.id].includes(normalizedQuery)
      )
    : sections.filter((section) => section.id === activeSection)

  return (
    <main className="h-svh overflow-y-auto bg-home-surface">
      <header className="sticky top-0 z-10 border-b bg-workspace-chrome/95 backdrop-blur supports-[backdrop-filter]:bg-workspace-chrome/85">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5 sm:px-8">
          <Button
            onClick={onClose}
            size="icon-sm"
            title="Back to TeX"
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" />
            <span className="sr-only">Back to TeX</span>
          </Button>
          <Separator className="h-5" orientation="vertical" />
          <span className="text-sm font-semibold">Settings</span>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            Changes are saved locally
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 pt-8 pb-14 sm:px-8 sm:pt-10">
        <div className="mb-8">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Preferences
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            Make TeX comfortable for your workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm/6 text-muted-foreground">
            Appearance is stored for the app. Editor and layout choices stay
            with the open project.
          </p>
        </div>
        <div className="relative max-w-2xl">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search settings"
            className="h-10 bg-background pr-10 pl-9 shadow-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
            value={query}
          />
          {query !== "" ? (
            <button
              aria-label="Clear settings search"
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-7 grid items-start gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
          <nav aria-label="Settings categories" className="flex flex-col gap-1">
            {sections.map((section) => {
              const Icon = section.icon
              const selected = activeSection === section.id && !isSearching
              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-background font-medium text-foreground shadow-xs"
                      : ""
                  )}
                  key={section.id}
                  onClick={() => {
                    setQuery("")
                    setActiveSection(section.id)
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {section.label}
                </button>
              )
            })}
          </nav>

          <div className="flex min-w-0 flex-col gap-6">
            {saveError !== null ? (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}
            {visibleSections.some((section) => section.id === "appearance") &&
            matches(
              "appearance color theme system light dark custom accent"
            ) ? (
              <SettingsGroup>
                <SettingRow
                  description="Applied immediately across TeX and remembered on this device."
                  modified={colorTheme !== "system"}
                  title="Color theme"
                >
                  <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
                    {themeOptions.map((option) => {
                      const Icon = option.icon
                      const selected = colorTheme === option.value
                      return (
                        <button
                          aria-pressed={selected}
                          className={cn(
                            "relative min-w-25 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                            selected &&
                              "border-primary bg-primary/5 ring-1 ring-primary"
                          )}
                          key={option.value}
                          onClick={() => onSetColorTheme(option.value)}
                          type="button"
                        >
                          <Icon
                            aria-hidden="true"
                            className="mb-2 size-4 text-muted-foreground"
                          />
                          <span className="block text-sm font-medium">
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {option.detail}
                          </span>
                          {selected ? (
                            <Check
                              aria-hidden="true"
                              className="absolute top-2 right-2 size-3.5 text-primary"
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </SettingRow>
                <Separator />
                <SettingRow
                  description="Selecting a color enables the Custom theme."
                  modified={colorTheme === "custom"}
                  title="Accent color"
                >
                  <label className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm shadow-xs">
                    <input
                      aria-label="Custom accent color"
                      className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                      onChange={(event) => onSetAccentColor(event.target.value)}
                      type="color"
                      value={accentColor}
                    />
                    <span className="font-mono text-xs uppercase">
                      {accentColor}
                    </span>
                  </label>
                </SettingRow>
              </SettingsGroup>
            ) : null}

            {visibleSections.some((section) => section.id === "editor") &&
            matches("editor source font text size writing") ? (
              <SettingsGroup>
                <SettingRow
                  description={
                    workspace === null
                      ? "Open a project to adjust its source editor size."
                      : "Stored with this project workspace so your reading setup is restored next time."
                  }
                  modified={
                    workspace?.editorFontSize !== undefined &&
                    workspace.editorFontSize !== 14
                  }
                  title="Editor font size"
                >
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label="Decrease editor font size"
                      disabled={
                        workspace === null || workspace.editorFontSize <= 11
                      }
                      onClick={() =>
                        workspace !== null &&
                        onSetEditorFontSize(workspace.editorFontSize - 1)
                      }
                      size="sm"
                      variant="outline"
                    >
                      −
                    </Button>
                    <output className="w-12 text-center text-sm tabular-nums">
                      {workspace === null
                        ? "—"
                        : `${workspace.editorFontSize}px`}
                    </output>
                    <Button
                      aria-label="Increase editor font size"
                      disabled={
                        workspace === null || workspace.editorFontSize >= 24
                      }
                      onClick={() =>
                        workspace !== null &&
                        onSetEditorFontSize(workspace.editorFontSize + 1)
                      }
                      size="sm"
                      variant="outline"
                    >
                      +
                    </Button>
                  </div>
                </SettingRow>
              </SettingsGroup>
            ) : null}

            {visibleSections.some((section) => section.id === "workspace") &&
            matches("workspace project sidebar files layout width") ? (
              <SettingsGroup>
                <SettingRow
                  description={
                    workspace === null
                      ? "Open a project to adjust its workspace."
                      : "Restore the project files sidebar to its standard width of 288 pixels."
                  }
                  modified={
                    workspace?.sidebarWidth !== undefined &&
                    workspace.sidebarWidth !== 288
                  }
                  title="Project files sidebar"
                >
                  <Button
                    disabled={
                      workspace === null || workspace.sidebarWidth === 288
                    }
                    onClick={() => onSetSidebarWidth(288)}
                    variant="outline"
                  >
                    Reset width
                  </Button>
                </SettingRow>
              </SettingsGroup>
            ) : null}

            {visibleSections.length === 0 ? (
              <Empty className="border bg-card py-12 shadow-sm">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No settings found</EmptyTitle>
                  <EmptyDescription>
                    Try a different search term.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
