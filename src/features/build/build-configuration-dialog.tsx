import { useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"

import { AlertCircle, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  BibliographyTool,
  ProjectBuildConfiguration,
} from "@/domain/build"
import { formatBuildInvocation } from "@/domain/build"
import { projectErrorFromUnknown } from "@/services/project-service"
import { runDetached } from "@/lib/promises"

export function BuildConfigurationDialog({
  configuration,
  onOpenChange,
  onSave,
  open,
}: {
  configuration: ProjectBuildConfiguration
  onOpenChange: (open: boolean) => void
  onSave: (configuration: ProjectBuildConfiguration) => Promise<void>
  open: boolean
}): ReactElement {
  const [draft, setDraft] = useState(configuration)
  const [environmentText, setEnvironmentText] = useState(() =>
    configuration.environment
      .map((setting) => `${setting.name}=${setting.value}`)
      .join("\n")
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savingRef = useRef(false)
  const custom = draft.customCommand
  const usesShellEscape =
    custom?.arguments.some(
      (argument) =>
        argument === "--shell-escape" ||
        argument === "-shell-escape" ||
        argument.startsWith("--shell-escape=")
    ) ?? false

  const save = async (): Promise<void> => {
    if (savingRef.current) return
    const environment = parseEnvironment(environmentText)
    if (typeof environment === "string") {
      setError(environment)
      return
    }
    savingRef.current = true
    setSaving(true)
    setError(null)
    let saved = false
    try {
      await onSave({ ...draft, environment })
      saved = true
    } catch (reason: unknown) {
      setError(projectErrorFromUnknown(reason).message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    if (saved) onOpenChange(false)
  }

  const setCustom = (
    executable: string,
    argumentsList: ReadonlyArray<string>
  ) => {
    setDraft((current) => ({
      ...current,
      customCommand:
        executable.trim() === "" && argumentsList.length === 0
          ? null
          : { executable, arguments: argumentsList },
    }))
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!savingRef.current) onOpenChange(nextOpen)
      }}
      open={open}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project build configuration</DialogTitle>
          <DialogDescription>
            Stored in TeX application data, not in the project. Every path is
            validated inside the open project before a process runs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Root file">
            <Input
              maxLength={1_024}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  rootFile: emptyToNull(event.target.value),
                }))
              }
              placeholder="main.tex"
              value={draft.rootFile ?? ""}
            />
          </Field>
          <Field label="Output directory">
            <Input
              maxLength={1_024}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  outputDirectory: emptyToNull(event.target.value),
                }))
              }
              placeholder="output"
              value={draft.outputDirectory ?? ""}
            />
          </Field>
          <Field label="Bibliography tool">
            <Select
              onValueChange={(value) => {
                if (isBibliographyTool(value)) {
                  setDraft((current) => ({
                    ...current,
                    bibliographyTool: value,
                  }))
                }
              }}
              value={draft.bibliographyTool}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="biber">Biber</SelectItem>
                <SelectItem value="bibtex">BibTeX</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Generated directories">
            <Input
              maxLength={4_096}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  generatedDirectories: splitLines(event.target.value),
                }))
              }
              placeholder="generated, figures/cache"
              value={draft.generatedDirectories.join(", ")}
            />
          </Field>
        </div>

        <Field label="TeX environment overrides">
          <Textarea
            aria-describedby="build-environment-help"
            className="min-h-20 font-mono text-xs"
            maxLength={8_192}
            onChange={(event) => setEnvironmentText(event.target.value)}
            placeholder="TEXINPUTS=styles:"
            value={environmentText}
          />
          <p
            id="build-environment-help"
            className="text-xs text-muted-foreground"
          >
            One NAME=value per line. Only TEXINPUTS, BIBINPUTS, BSTINPUTS,
            TEXMFHOME, and TEXMFOUTPUT are accepted.
          </p>
        </Field>

        <div className="rounded-lg border p-3">
          <h3 className="font-medium">Custom command</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Leave blank to use the selected safe engine. A custom executable
            must be an existing absolute path; each argument is a separate line.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Executable">
              <Input
                className="font-mono text-xs"
                maxLength={1_024}
                onChange={(event) =>
                  setCustom(event.target.value, custom?.arguments ?? [])
                }
                placeholder="/usr/bin/latexmk"
                value={custom?.executable ?? ""}
              />
            </Field>
            <Field label="Arguments">
              <Textarea
                className="min-h-24 font-mono text-xs"
                maxLength={8_192}
                onChange={(event) =>
                  setCustom(
                    custom?.executable ?? "",
                    splitLines(event.target.value)
                  )
                }
                placeholder={"-pdf\nmain.tex"}
                value={custom?.arguments.join("\n") ?? ""}
              />
            </Field>
          </div>
          {custom !== null ? (
            <>
              <p className="mt-3 rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                {formatBuildInvocation({
                  executable: custom.executable,
                  arguments: custom.arguments,
                })}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Saving a new or changed command opens a native confirmation
                showing the exact executable and arguments.
              </p>
            </>
          ) : null}
          {usesShellEscape ? (
            <Alert className="mt-3" variant="destructive">
              <ShieldAlert />
              <AlertTitle>Shell escape expands project trust</AlertTitle>
              <AlertDescription>
                LaTeX may run programs requested by project source. Saving opens
                a separate native shell-escape confirmation.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {error !== null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Configuration not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter showCloseButton>
          <Button disabled={saving} onClick={() => runDetached(save())}>
            {saving ? "Validating…" : "Save build configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function splitLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item !== "")
}

function parseEnvironment(
  value: string
): ProjectBuildConfiguration["environment"] | string {
  const environment: Array<{ name: string; value: string }> = []
  for (const line of value.split("\n")) {
    if (line.trim() === "") continue
    const separator = line.indexOf("=")
    if (separator <= 0) {
      return "Every environment entry must use NAME=value."
    }
    environment.push({
      name: line.slice(0, separator).trim(),
      value: line.slice(separator + 1),
    })
  }
  return environment
}

function isBibliographyTool(value: string | null): value is BibliographyTool {
  return ["automatic", "biber", "bibtex", "none"].includes(value ?? "")
}
