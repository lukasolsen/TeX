import { useState } from "react"
import type { ReactNode } from "react"

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
}) {
  const [draft, setDraft] = useState(configuration)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const custom = draft.customCommand
  const usesShellEscape =
    custom?.arguments.some(
      (argument) =>
        argument === "--shell-escape" ||
        argument === "-shell-escape" ||
        argument.startsWith("--shell-escape=")
    ) ?? false

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      onOpenChange(false)
    } catch (reason: unknown) {
      setError(projectErrorFromUnknown(reason).message)
    } finally {
      setSaving(false)
    }
  }

  const setCustom = (executable: string, argumentsList: string[]) => {
    setDraft((current) => ({
      ...current,
      customCommand:
        executable.trim() === "" && argumentsList.length === 0
          ? null
          : { executable, arguments: argumentsList },
    }))
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
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
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                environment: splitLines(event.target.value).flatMap((line) => {
                  const separator = line.indexOf("=")
                  return separator <= 0
                    ? []
                    : [
                        {
                          name: line.slice(0, separator),
                          value: line.slice(separator + 1),
                        },
                      ]
                }),
              }))
            }
            placeholder="TEXINPUTS=styles:"
            value={draft.environment
              .map((setting) => `${setting.name}=${setting.value}`)
              .join("\n")}
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
                  workingDirectory: "project root",
                  rootFile: draft.rootFile ?? "selected root",
                  engine: "latexmkPdf",
                  environment: draft.environment,
                  bibliographyTool: draft.bibliographyTool,
                  custom: true,
                  toolVersion: null,
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
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Validating…" : "Save build configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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

function isBibliographyTool(value: string | null): value is BibliographyTool {
  return ["automatic", "biber", "bibtex", "none"].includes(value ?? "")
}
