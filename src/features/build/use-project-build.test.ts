// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  initialBuildProgress,
  type BuildEngine,
  type BuildInvocation,
  type BuildProfile,
  type BuildRun,
} from "@/domain/build"
import {
  buildId,
  canonicalProjectPath,
  projectRelativePath,
} from "@/domain/identifiers"
import { useProjectBuild } from "@/features/build/use-project-build"

const projectPath = canonicalProjectPath("/projects/report")
const rootFile = projectRelativePath("main.tex")

const latexmk: BuildProfile = {
  engine: "latexmkPdf",
  label: "pdfLaTeX",
  description: "Recommended.",
  executable: "latexmk",
  resolvesReferences: true,
  recommended: true,
  available: false,
}

const invocation: BuildInvocation = {
  executable: "/Library/TeX/texbin/latexmk",
  arguments: ["-pdf"],
  workingDirectory: projectPath,
  rootFile,
  engine: "latexmkPdf",
  environment: [],
  bibliography: "automatic",
  resolvesReferences: true,
  custom: false,
}

const toolUnavailable = Object.assign(
  new Error(
    "The selected LaTeX build tool is not installed or is unavailable on PATH."
  ),
  { code: "build-tool-unavailable" }
)

let profileAvailable = false
let previewFails = true
const getBuildProfiles = vi.fn<() => Promise<BuildProfile[]>>(() =>
  Promise.resolve([{ ...latexmk, available: profileAvailable }])
)
const previewBuild = vi.fn<() => Promise<BuildInvocation>>(() =>
  previewFails ? Promise.reject(toolUnavailable) : Promise.resolve(invocation)
)
let startedRuns = 0
const startBuild = vi.fn<() => Promise<BuildRun>>(() => {
  startedRuns += 1
  return Promise.resolve({
    id: buildId(`1700000000-${startedRuns}`),
    projectPath,
    invocation,
    status: "running" as const,
    reason: null,
    pdfFresh: false,
    startedAt: startedRuns,
    finishedAt: null,
    exitCode: null,
    entries: [],
    diagnostics: [],
    progress: initialBuildProgress,
  })
})

vi.mock("@/services/build-service", () => ({
  getBuildProfiles: () => getBuildProfiles(),
  previewBuild: () => previewBuild(),
  getBuildHistory: () => Promise.resolve([]),
  listenForBuildEvents: () => Promise.resolve(() => {}),
  startBuild: () => startBuild(),
  stopBuild: () => Promise.resolve(),
  loadProjectBuildConfiguration: () =>
    Promise.resolve({
      schemaVersion: 2 as const,
      rootFile: "main.tex",
      outputDirectory: null,
      bibliography: "automatic" as const,
      generatedDirectories: [],
      environment: [],
      customCommand: null,
      shellEscape: false,
    }),
  saveProjectBuildConfiguration: (_path: unknown, configuration: unknown) =>
    Promise.resolve(configuration),
}))

afterEach(() => {
  cleanup()
  getBuildProfiles.mockClear()
  previewBuild.mockClear()
  profileAvailable = false
  previewFails = true
  startedRuns = 0
  startBuild.mockClear()
})

describe("useProjectBuild", () => {
  it("re-resolves the build preview when the LaTeX tools change on disk", async () => {
    const { result } = renderHook(() =>
      useProjectBuild({
        beforeBuild: () => Promise.resolve(true),
        initialEngine: "latexmkPdf",
        onEngineChange: vi.fn<(engine: BuildEngine) => void>(),
        projectPath,
        rootFile,
      })
    )

    await waitFor(() =>
      expect(result.current.state.preview.status).toBe("error")
    )
    expect(result.current.profiles).toEqual({
      status: "ready",
      profiles: [{ ...latexmk, available: false }],
    })

    // The installer has just added latexmk underneath the running window.
    profileAvailable = true
    previewFails = false
    act(() => result.current.refreshProfiles())

    await waitFor(() =>
      expect(result.current.state.preview.status).toBe("ready")
    )
    expect(result.current.profiles).toEqual({
      status: "ready",
      profiles: [{ ...latexmk, available: true }],
    })
    expect(previewBuild.mock.calls.length).toBeGreaterThan(1)
  })

  it("retires a stale action failure so the panel stops reporting it", async () => {
    const { result } = renderHook(() =>
      useProjectBuild({
        beforeBuild: () => Promise.resolve(true),
        initialEngine: "latexmkPdf",
        onEngineChange: vi.fn<(engine: BuildEngine) => void>(),
        projectPath,
        rootFile,
      })
    )

    await waitFor(() =>
      expect(result.current.state.preview.status).toBe("error")
    )
    act(() =>
      result.current.dispatch({ type: "actionError", error: toolUnavailable })
    )
    expect(result.current.state.action.status).toBe("error")

    profileAvailable = true
    previewFails = false
    act(() => result.current.refreshProfiles())

    await waitFor(() => expect(result.current.state.action.status).toBe("idle"))
  })

  /// Pressing Build during a build is an unambiguous request, not a mistake.
  /// Refusing it with a red panel state was a defect, not a guard rail.
  it("queues a build requested while one is running instead of failing", async () => {
    profileAvailable = true
    previewFails = false
    const { result } = renderHook(() =>
      useProjectBuild({
        beforeBuild: () => Promise.resolve(true),
        initialEngine: "latexmkPdf",
        onEngineChange: vi.fn<(engine: BuildEngine) => void>(),
        projectPath,
        rootFile,
      })
    )
    await waitFor(() =>
      expect(result.current.state.preview.status).toBe("ready")
    )

    await act(() => result.current.build())
    await waitFor(() => expect(startBuild).toHaveBeenCalledTimes(1))

    // The first run is still going; a second request waits rather than erroring.
    await act(() => result.current.build())
    expect(result.current.queued).toBe(true)
    expect(result.current.state.action.status).not.toBe("error")
    expect(startBuild).toHaveBeenCalledTimes(1)

    act(() =>
      result.current.dispatch({
        type: "eventReceived",
        event: {
          kind: "finished",
          projectPath,
          runId: buildId("1700000000-1"),
          status: "succeeded",
          reason: "main.pdf is up to date.",
          pdfFresh: true,
          finishedAt: 2,
          exitCode: 0,
          diagnostics: [],
        },
      })
    )

    await waitFor(() => expect(startBuild).toHaveBeenCalledTimes(2))
    expect(result.current.queued).toBe(false)
  })
})
