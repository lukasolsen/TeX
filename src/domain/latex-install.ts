import type { ProjectError } from "@/domain/project"

export type InstallMethod =
  "homebrew" | "winget" | "pacman" | "apt" | "dnf" | "zypper"

/** How the operating system asks the user to authorize the installation. */
export type InstallElevation = "polkit" | "systemPassword"

export type InstallStepStatus =
  "pending" | "running" | "succeeded" | "failed" | "skipped"

export type InstallStatus =
  "running" | "succeeded" | "restartRequired" | "failed" | "cancelled"

export type InstallStepPlan = Readonly<{
  title: string
  command: string
  /** Failure of an optional step is reported but does not stop the install. */
  optional: boolean
}>

export type InstallOption = Readonly<{
  method: InstallMethod
  manager: string
  distribution: string
  summary: string
  packages: ReadonlyArray<string>
  downloadEstimate: string
  elevation: InstallElevation
  recommended: boolean
  steps: ReadonlyArray<InstallStepPlan>
}>

export type ManualInstruction = Readonly<{
  summary: string
  command: string | null
  documentation: string
}>

/** A known route this machine cannot run, with the missing prerequisite named. */
export type UnavailableOption = Readonly<{
  manager: string
  distribution: string
  reason: string
  documentation: string
}>

export type InstallSupport = Readonly<{
  platform: string
  options: ReadonlyArray<InstallOption>
  unavailable: ReadonlyArray<UnavailableOption>
  manual: ManualInstruction
}>

export type InstallStepState = Readonly<{
  title: string
  command: string
  optional: boolean
  status: InstallStepStatus
  detail: string | null
}>

export type InstallLogEntry = Readonly<{
  sequence: number
  text: string
}>

export type InstallProgress = Readonly<{
  id: string
  method: InstallMethod
  status: InstallStatus
  steps: ReadonlyArray<InstallStepState>
  activeStep: number | null
  startedAt: number
  finishedAt: number | null
  message: string | null
  availableTools: ReadonlyArray<string>
  log: ReadonlyArray<InstallLogEntry>
}>

export type InstallEvent =
  | Readonly<{
      kind: "step"
      installationId: string
      index: number
      status: InstallStepStatus
      detail: string | null
    }>
  | Readonly<{
      kind: "log"
      installationId: string
      entry: InstallLogEntry
    }>
  | Readonly<{
      kind: "finished"
      installationId: string
      status: Exclude<InstallStatus, "running">
      finishedAt: number
      message: string
      availableTools: ReadonlyArray<string>
    }>

export type LatexInstallState =
  | { status: "loading" }
  | { status: "unavailable"; error: ProjectError }
  | {
      status: "ready"
      support: InstallSupport
      progress: InstallProgress | null
    }

const MAX_VISIBLE_LOG_ENTRIES = 400

/**
 * Folds a backend event into the visible installation. Events for a superseded
 * installation are ignored so a stale emission cannot rewrite a newer run.
 */
export function applyInstallEvent(
  progress: InstallProgress,
  event: InstallEvent
): InstallProgress {
  if (event.installationId !== progress.id) return progress
  switch (event.kind) {
    case "step":
      return {
        ...progress,
        activeStep:
          event.status === "running" ? event.index : progress.activeStep,
        steps: progress.steps.map((step, index) =>
          index === event.index
            ? {
                ...step,
                status: event.status,
                detail: event.detail ?? step.detail,
              }
            : step
        ),
      }
    case "log":
      if (
        progress.log.some((entry) => entry.sequence === event.entry.sequence)
      ) {
        return progress
      }
      return {
        ...progress,
        log: [...progress.log, event.entry].slice(-MAX_VISIBLE_LOG_ENTRIES),
      }
    case "finished":
      return {
        ...progress,
        status: event.status,
        finishedAt: event.finishedAt,
        message: event.message,
        availableTools: event.availableTools,
        activeStep: null,
      }
  }
}

export function installStepSummary(progress: InstallProgress): string {
  const completed = completedStepCount(progress)
  return `Step ${Math.min(completed + 1, progress.steps.length)} of ${progress.steps.length}`
}

/** A skipped optional step is resolved, so it advances the visible progress. */
export function completedStepCount(progress: InstallProgress): number {
  return progress.steps.filter(
    (step) => step.status === "succeeded" || step.status === "skipped"
  ).length
}

export type InstallNotice = Readonly<{
  tone: "success" | "warning" | "error"
  title: string
  detail: string
}>

/**
 * The one sentence worth surfacing outside the installer once it finishes.
 * Success is only claimed when a usable engine is actually on the search path.
 */
export function installNotice(
  progress: Pick<InstallProgress, "status" | "availableTools"> & {
    message?: string | null
  }
): InstallNotice | null {
  if (progress.status === "running") return null
  const detail = progress.message ?? installStatusLabel(progress.status)
  switch (progress.status) {
    case "succeeded":
      return progress.availableTools.includes("latexmk")
        ? { tone: "success", title: "LaTeX installed", detail }
        : { tone: "warning", title: "LaTeX installed without latexmk", detail }
    case "restartRequired":
      return { tone: "warning", title: "Restart TeX to finish", detail }
    case "cancelled":
      return { tone: "warning", title: "Installation cancelled", detail }
    case "failed":
      return { tone: "error", title: "Installation failed", detail }
  }
}

export function elevationNotice(elevation: InstallElevation): string {
  return elevation === "polkit"
    ? "Your system will ask you to authorize this installation."
    : "Your operating system will ask for an administrator password."
}

export function installStatusLabel(status: InstallStatus): string {
  switch (status) {
    case "running":
      return "Installing"
    case "succeeded":
      return "Installed"
    case "restartRequired":
      return "Restart required"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
  }
}
