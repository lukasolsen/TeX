// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BuildEngine, BuildInvocation, BuildProfile } from "@/domain/build"
import { canonicalProjectPath, projectRelativePath } from "@/domain/identifiers"
import { useProjectBuild } from "@/features/build/use-project-build"

const projectPath = canonicalProjectPath("/projects/report")
const rootFile = projectRelativePath("main.tex")

const latexmk: BuildProfile = {
  engine: "latexmkPdf",
  label: "latexmk (PDF)",
  description: "Recommended.",
  executable: "latexmk",
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
  bibliographyTool: "automatic",
  custom: false,
}

const toolUnavailable = {
  code: "build-tool-unavailable",
  message:
    "The selected LaTeX build tool is not installed or is unavailable on PATH.",
}

let profileAvailable = false
let previewFails = true
const getBuildProfiles = vi.fn<() => Promise<BuildProfile[]>>(() =>
  Promise.resolve([{ ...latexmk, available: profileAvailable }])
)
const previewBuild = vi.fn<() => Promise<BuildInvocation>>(() =>
  previewFails ? Promise.reject(toolUnavailable) : Promise.resolve(invocation)
)

vi.mock("@/services/build-service", () => ({
  getBuildProfiles: () => getBuildProfiles(),
  previewBuild: () => previewBuild(),
  getBuildHistory: () => Promise.resolve([]),
  listenForBuildEvents: () => Promise.resolve(() => undefined),
  startBuild: () => Promise.reject(toolUnavailable),
  stopBuild: () => Promise.resolve(),
  loadProjectBuildConfiguration: () =>
    Promise.resolve({
      schemaVersion: 1 as const,
      rootFile: "main.tex",
      outputDirectory: null,
      bibliographyTool: "automatic" as const,
      generatedDirectories: [],
      environment: [],
      customCommand: null,
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
})
