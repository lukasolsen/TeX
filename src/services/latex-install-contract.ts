import type {
  InstallElevation,
  InstallEvent,
  InstallLogEntry,
  InstallMethod,
  InstallOption,
  InstallProgress,
  InstallStatus,
  InstallStepPlan,
  InstallStepState,
  InstallStepStatus,
  InstallSupport,
  ManualInstruction,
  UnavailableOption,
} from "@/domain/latex-install"
import {
  arrayValue,
  booleanValue,
  enumValue,
  integer,
  nonEmptyString,
  nullableInteger,
  nullableString,
  record,
  stringValue,
} from "@/services/ipc-contract"

const COMMAND_LIMIT = 4 * 1024
const MAX_OPTIONS = 6
const MAX_STEPS = 8
const MAX_PACKAGES = 32
const MAX_LOG_ENTRIES = 400

const METHODS = [
  "homebrew",
  "winget",
  "pacman",
  "apt",
  "dnf",
  "zypper",
] as const satisfies readonly InstallMethod[]

const STEP_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const satisfies readonly InstallStepStatus[]

const STATUSES = [
  "running",
  "succeeded",
  "restartRequired",
  "failed",
  "cancelled",
] as const satisfies readonly InstallStatus[]

const ELEVATIONS = [
  "polkit",
  "systemPassword",
] as const satisfies readonly InstallElevation[]

export function parseInstallSupport(value: unknown): InstallSupport {
  const input = record(value, "LaTeX installation support")
  return {
    platform: nonEmptyString(input["platform"], "installation platform", 64),
    options: arrayValue(
      input["options"],
      "installation options",
      MAX_OPTIONS,
      parseInstallOption
    ),
    unavailable: arrayValue(
      input["unavailable"],
      "unavailable installation options",
      MAX_OPTIONS,
      parseUnavailableOption
    ),
    manual: parseManualInstruction(input["manual"]),
  }
}

export function parseInstallProgress(value: unknown): InstallProgress {
  const input = record(value, "LaTeX installation progress")
  return {
    id: nonEmptyString(input["id"], "installation ID", 128),
    method: enumValue(input["method"], "installation method", METHODS),
    status: enumValue(input["status"], "installation status", STATUSES),
    steps: arrayValue(
      input["steps"],
      "installation steps",
      MAX_STEPS,
      parseInstallStepState
    ),
    activeStep: nullableInteger(
      input["activeStep"],
      "active step",
      0,
      MAX_STEPS
    ),
    startedAt: integer(
      input["startedAt"],
      "installation start time",
      0,
      Number.MAX_SAFE_INTEGER
    ),
    finishedAt: nullableInteger(
      input["finishedAt"],
      "installation finish time",
      0,
      Number.MAX_SAFE_INTEGER
    ),
    message: nullableString(input["message"], "installation message", 2_048),
    availableTools: parseTools(input["availableTools"]),
    log: arrayValue(
      input["log"],
      "installation log",
      MAX_LOG_ENTRIES,
      parseInstallLogEntry
    ),
  }
}

export function parseOptionalInstallProgress(
  value: unknown
): InstallProgress | null {
  return value === null ? null : parseInstallProgress(value)
}

export function parseInstallEvent(value: unknown): InstallEvent {
  const input = record(value, "installation event")
  const kind = enumValue(input["kind"], "installation event kind", [
    "step",
    "log",
    "finished",
  ])
  const installationId = nonEmptyString(
    input["installationId"],
    "installation event ID",
    128
  )
  if (kind === "step") {
    return {
      kind,
      installationId,
      index: integer(input["index"], "installation step index", 0, MAX_STEPS),
      status: enumValue(
        input["status"],
        "installation step status",
        STEP_STATUSES
      ),
      detail: nullableString(
        input["detail"],
        "installation step detail",
        1_024
      ),
    }
  }
  if (kind === "log") {
    return { kind, installationId, entry: parseInstallLogEntry(input["entry"]) }
  }
  return {
    kind,
    installationId,
    status: enumValue(input["status"], "finished installation status", [
      "succeeded",
      "restartRequired",
      "failed",
      "cancelled",
    ]),
    finishedAt: integer(
      input["finishedAt"],
      "installation finish time",
      0,
      Number.MAX_SAFE_INTEGER
    ),
    message: nonEmptyString(input["message"], "installation message", 2_048),
    availableTools: parseTools(input["availableTools"]),
  }
}

function parseManualInstruction(value: unknown): ManualInstruction {
  const input = record(value, "manual installation instruction")
  return {
    summary: nonEmptyString(
      input["summary"],
      "manual instruction summary",
      1_024
    ),
    command: nullableString(
      input["command"],
      "manual instruction command",
      COMMAND_LIMIT
    ),
    documentation: nonEmptyString(
      input["documentation"],
      "manual instruction documentation",
      1_024
    ),
  }
}

function parseInstallOption(value: unknown): InstallOption {
  const input = record(value, "installation option")
  return {
    method: enumValue(input["method"], "installation method", METHODS),
    manager: nonEmptyString(input["manager"], "package manager", 64),
    distribution: nonEmptyString(input["distribution"], "TeX distribution", 64),
    summary: nonEmptyString(input["summary"], "installation summary", 1_024),
    packages: arrayValue(
      input["packages"],
      "installation packages",
      MAX_PACKAGES,
      (item) => nonEmptyString(item, "installation package", 128)
    ),
    downloadEstimate: nonEmptyString(
      input["downloadEstimate"],
      "download estimate",
      128
    ),
    elevation: enumValue(
      input["elevation"],
      "installation elevation",
      ELEVATIONS
    ),
    recommended: booleanValue(input["recommended"], "recommended installation"),
    steps: arrayValue(
      input["steps"],
      "installation plan steps",
      MAX_STEPS,
      parseInstallStepPlan
    ),
  }
}

function parseUnavailableOption(value: unknown): UnavailableOption {
  const input = record(value, "unavailable installation option")
  return {
    manager: nonEmptyString(input["manager"], "package manager", 64),
    distribution: nonEmptyString(input["distribution"], "TeX distribution", 64),
    reason: nonEmptyString(input["reason"], "unavailability reason", 1_024),
    documentation: nonEmptyString(
      input["documentation"],
      "installation documentation",
      1_024
    ),
  }
}

function parseInstallStepPlan(value: unknown): InstallStepPlan {
  const input = record(value, "installation plan step")
  return {
    title: nonEmptyString(input["title"], "installation step title", 128),
    command: nonEmptyString(
      input["command"],
      "installation step command",
      COMMAND_LIMIT
    ),
    optional: booleanValue(input["optional"], "optional installation step"),
  }
}

function parseInstallStepState(value: unknown): InstallStepState {
  const plan = parseInstallStepPlan(value)
  const input = record(value, "installation step")
  return {
    ...plan,
    status: enumValue(
      input["status"],
      "installation step status",
      STEP_STATUSES
    ),
    detail: nullableString(input["detail"], "installation step detail", 1_024),
  }
}

function parseInstallLogEntry(value: unknown): InstallLogEntry {
  const input = record(value, "installation log entry")
  return {
    sequence: integer(
      input["sequence"],
      "installation log sequence",
      0,
      Number.MAX_SAFE_INTEGER
    ),
    text: stringValue(input["text"], "installation log text", 8 * 1024),
  }
}

function parseTools(value: unknown): string[] {
  return arrayValue(value, "installed LaTeX tools", 8, (item) =>
    nonEmptyString(item, "installed LaTeX tool", 128)
  )
}
