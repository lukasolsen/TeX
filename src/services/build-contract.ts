import type {
  BuildDiagnostic,
  BuildEvent,
  BuildInvocation,
  BuildLogEntry,
  BuildProfile,
  BuildRun,
  CleanPreview,
  ProjectBuildConfiguration,
  WatchEvent,
  WatchStatus,
} from "@/domain/build"
import {
  buildId,
  canonicalProjectPath,
  projectRelativePath,
} from "@/domain/identifiers"
import type { CanonicalProjectPath } from "@/domain/identifiers"

import {
  IpcContractError,
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

const PATH_LIMIT = 32 * 1024

export function parseBuildInvocation(value: unknown): BuildInvocation {
  const input = record(value, "build invocation")
  return {
    executable: nonEmptyString(input.executable, "build executable", PATH_LIMIT),
    arguments: arrayValue(input.arguments, "build arguments", 128, (argument) =>
      stringValue(argument, "build argument", 4_096)
    ),
    workingDirectory: canonicalProjectPath(
      nonEmptyString(input.workingDirectory, "build directory", PATH_LIMIT)
    ),
    rootFile: projectRelativePath(nonEmptyString(input.rootFile, "build root", PATH_LIMIT)),
    engine: parseBuildEngine(input.engine),
    environment: arrayValue(input.environment, "build environment", 5, parseEnvironment),
    bibliographyTool: enumValue(input.bibliographyTool, "bibliography tool", [
      "automatic",
      "biber",
      "bibtex",
      "none",
    ]),
    custom: booleanValue(input.custom, "custom build state"),
  }
}

export function parseBuildProfiles(value: unknown): BuildProfile[] {
  return arrayValue(value, "build profiles", 4, (profile) => {
    const input = record(profile, "build profile")
    return {
      engine: parseBuildEngine(input.engine),
      label: nonEmptyString(input.label, "build profile label", 128),
      description: nonEmptyString(input.description, "build profile description", 1_024),
      executable: nonEmptyString(input.executable, "build profile executable", 128),
      recommended: booleanValue(input.recommended, "recommended build profile"),
      available: booleanValue(input.available, "available build profile"),
    }
  })
}

export function parseBuildRun(value: unknown): BuildRun {
  const input = record(value, "build run")
  return {
    id: buildId(nonEmptyString(input.id, "build run ID", 128)),
    projectPath: canonicalProjectPath(
      nonEmptyString(input.projectPath, "build project path", PATH_LIMIT)
    ),
    invocation: parseBuildInvocation(input.invocation),
    status: parseBuildStatus(input.status),
    startedAt: integer(input.startedAt, "build start time", 0, Number.MAX_SAFE_INTEGER),
    finishedAt: nullableInteger(input.finishedAt, "build finish time", 0, Number.MAX_SAFE_INTEGER),
    exitCode: nullableInteger(input.exitCode, "build exit code", -2_147_483_648, 2_147_483_647),
    entries: arrayValue(input.entries, "build log entries", 500, parseBuildLogEntry),
    diagnostics: arrayValue(input.diagnostics, "build diagnostics", 500, parseBuildDiagnostic),
  }
}

export function parseBuildHistory(value: unknown): BuildRun[] {
  return arrayValue(value, "build history", 10, parseBuildRun)
}

export function parseBuildEvent(value: unknown): BuildEvent {
  const input = record(value, "build event")
  const kind = enumValue(input.kind, "build event kind", ["log", "finished"])
  const common = {
    projectPath: canonicalProjectPath(
      nonEmptyString(input.projectPath, "build event project", PATH_LIMIT)
    ),
    runId: buildId(nonEmptyString(input.runId, "build event run ID", 128)),
  }
  if (kind === "log") {
    return {
      kind,
      ...common,
      entry: parseBuildLogEntry(input.entry),
      diagnostic:
        input.diagnostic === null ? null : parseBuildDiagnostic(input.diagnostic),
    }
  }
  return {
    kind,
    ...common,
    status: enumValue(input.status, "finished build status", [
      "succeeded",
      "failed",
      "cancelled",
    ]),
    finishedAt: integer(input.finishedAt, "build finish time", 0, Number.MAX_SAFE_INTEGER),
    exitCode: nullableInteger(input.exitCode, "build exit code", -2_147_483_648, 2_147_483_647),
  }
}

export function parseWatchStatus(value: unknown): WatchStatus {
  return enumValue(value, "watch status", [
    "off",
    "starting",
    "watching",
    "buildQueued",
    "stopping",
    "error",
  ])
}

export function parseWatchEvent(value: unknown): WatchEvent {
  const input = record(value, "watch event")
  const kind = enumValue(input.kind, "watch event kind", ["status", "changed"])
  const projectPath = canonicalProjectPath(
    nonEmptyString(input.projectPath, "watch project path", PATH_LIMIT)
  )
  if (kind === "status") {
    return {
      kind,
      projectPath,
      status: parseWatchStatus(input.status),
      message: nullableString(input.message, "watch message", 8_192),
    }
  }
  return {
    kind,
    projectPath,
    changes: arrayValue(input.changes, "watch change kinds", 4, (change) =>
      enumValue(change, "watch change kind", ["create", "modify", "remove", "rename"])
    ),
    paths: arrayValue(input.paths, "watch paths", 1_024, (path) =>
      projectRelativePath(nonEmptyString(path, "watch path", PATH_LIMIT))
    ),
    truncated: booleanValue(input.truncated, "watch truncation"),
  }
}

export function parseProjectFilesEvent(value: unknown): CanonicalProjectPath {
  const input = record(value, "project files event")
  return canonicalProjectPath(
    nonEmptyString(input.projectPath, "project files path", PATH_LIMIT)
  )
}

export function parseBuildConfiguration(value: unknown): ProjectBuildConfiguration {
  const input = record(value, "build configuration")
  const schemaVersion = integer(input.schemaVersion, "build configuration version", 1, 1)
  if (schemaVersion !== 1) throw new IpcContractError("build configuration version")
  return {
    schemaVersion,
    rootFile: nullableString(input.rootFile, "configured root", PATH_LIMIT),
    outputDirectory: nullableString(input.outputDirectory, "output directory", PATH_LIMIT),
    bibliographyTool: enumValue(input.bibliographyTool, "bibliography tool", [
      "automatic",
      "biber",
      "bibtex",
      "none",
    ]),
    generatedDirectories: arrayValue(
      input.generatedDirectories,
      "generated directories",
      32,
      (directory) => nonEmptyString(directory, "generated directory", PATH_LIMIT)
    ),
    environment: arrayValue(input.environment, "build environment", 5, parseEnvironment),
    customCommand:
      input.customCommand === null
        ? null
        : parseCustomCommand(input.customCommand),
  }
}

export function parseCleanPreview(value: unknown): CleanPreview {
  const input = record(value, "clean preview")
  return {
    files: arrayValue(input.files, "clean files", 4_096, (path) =>
      projectRelativePath(nonEmptyString(path, "clean path", PATH_LIMIT))
    ),
    totalBytes: integer(input.totalBytes, "clean byte count", 0, Number.MAX_SAFE_INTEGER),
    truncated: booleanValue(input.truncated, "clean truncation"),
  }
}

export function parseCleanCount(value: unknown): number {
  return integer(value, "clean result", 0, 4_096)
}

function parseBuildEngine(value: unknown) {
  return enumValue(value, "build engine", [
    "latexmkPdf",
    "pdfLatex",
    "xeLatex",
    "luaLatex",
  ])
}

function parseBuildStatus(value: unknown) {
  return enumValue(value, "build status", [
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ])
}

function parseEnvironment(value: unknown) {
  const input = record(value, "environment setting")
  return {
    name: nonEmptyString(input.name, "environment name", 128),
    value: stringValue(input.value, "environment value", 4_096),
  }
}

function parseCustomCommand(value: unknown) {
  const input = record(value, "custom command")
  return {
    executable: nonEmptyString(input.executable, "custom executable", PATH_LIMIT),
    arguments: arrayValue(input.arguments, "custom arguments", 128, (argument) =>
      stringValue(argument, "custom argument", 4_096)
    ),
  }
}

function parseBuildLogEntry(value: unknown): BuildLogEntry {
  const input = record(value, "build log entry")
  return {
    sequence: integer(input.sequence, "build log sequence", 1, Number.MAX_SAFE_INTEGER),
    timestamp: integer(input.timestamp, "build log timestamp", 0, Number.MAX_SAFE_INTEGER),
    stream: enumValue(input.stream, "build log stream", ["stdout", "stderr"]),
    text: stringValue(input.text, "build log text", 4_128),
  }
}

function parseBuildDiagnostic(value: unknown): BuildDiagnostic {
  const input = record(value, "build diagnostic")
  return {
    severity: enumValue(input.severity, "diagnostic severity", ["error", "warning"]),
    message: stringValue(input.message, "diagnostic message", 4_128),
    file: parseNullableRelativePath(input.file, "diagnostic file"),
    line: nullableInteger(input.line, "diagnostic line", 1, Number.MAX_SAFE_INTEGER),
    mappingUncertain: booleanValue(input.mappingUncertain, "diagnostic mapping"),
    logSequence: integer(input.logSequence, "diagnostic sequence", 1, Number.MAX_SAFE_INTEGER),
  }
}

function parseNullableRelativePath(value: unknown, contract: string) {
  const parsed = nullableString(value, contract, PATH_LIMIT)
  return parsed === null ? null : projectRelativePath(parsed)
}
