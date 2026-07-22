// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { initialProjectBuildState, type BuildProfile } from "@/domain/build"
import type {
  InstallEvent,
  InstallMethod,
  InstallProgress,
  InstallSupport,
} from "@/domain/latex-install"
import {
  buildId,
  canonicalProjectPath,
  projectRelativePath,
} from "@/domain/identifiers"
import { BuildPanel } from "@/features/build/build-panel"

const projectPath = canonicalProjectPath("/projects/report")

const support: InstallSupport = {
  platform: "macOS",
  options: [
    {
      method: "homebrew",
      manager: "Homebrew",
      distribution: "BasicTeX",
      summary: "A compact TeX Live distribution with latexmk.",
      packages: ["basictex"],
      downloadEstimate: "about 500 MB downloaded",
      elevation: "systemPassword",
      recommended: true,
      steps: [
        {
          title: "Locate Homebrew",
          command: "/opt/homebrew/bin/brew",
          optional: false,
        },
        {
          title: "Install BasicTeX",
          command: "/opt/homebrew/bin/brew install --cask basictex",
          optional: false,
        },
        {
          title: "Verify the LaTeX tools",
          command: "latexmk",
          optional: false,
        },
      ],
    },
  ],
  unavailable: [],
  manual: {
    summary: "Install MacTeX or BasicTeX, then restart TeX.",
    command: "brew install --cask basictex",
    documentation: "https://tug.org/mactex/",
  },
}

const startedProgress: InstallProgress = {
  id: "install-1",
  method: "homebrew",
  status: "running",
  steps: (support.options[0]?.steps ?? []).map((step) => ({
    ...step,
    status: "pending",
    detail: null,
  })),
  activeStep: null,
  startedAt: Math.floor(Date.now() / 1_000),
  finishedAt: null,
  message: null,
  availableTools: [],
  log: [],
}

const startLatexInstallation = vi.fn<
  (method: InstallMethod) => Promise<InstallProgress>
>(() => Promise.resolve(startedProgress))

const listeners: Array<(event: InstallEvent) => void> = []

vi.mock("@/services/latex-install-service", () => ({
  getLatexInstallationSupport: () => Promise.resolve(support),
  getLatexInstallationProgress: () => Promise.resolve(null),
  startLatexInstallation: (method: InstallMethod) =>
    startLatexInstallation(method),
  stopLatexInstallation: () => Promise.resolve(),
  listenForInstallEvents: (handler: (event: InstallEvent) => void) => {
    listeners.push(handler)
    return Promise.resolve(() => {
      listeners.splice(listeners.indexOf(handler), 1)
    })
  },
}))

function emit(event: InstallEvent): void {
  for (const listener of listeners.slice()) listener(event)
}

const missing: BuildProfile = {
  engine: "latexmkPdf",
  label: "latexmk (PDF)",
  description: "Recommended; reruns LaTeX and bibliography tools as needed.",
  executable: "latexmk",
  recommended: true,
  available: false,
}

const noop = vi.fn<(...arguments_: unknown[]) => void>()
const asyncNoop = vi.fn<(...arguments_: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
)

const pdfLatex: BuildProfile = {
  engine: "pdfLatex",
  label: "pdfLaTeX",
  description: "Single compiler pass; references may require additional runs.",
  executable: "pdflatex",
  recommended: false,
  available: true,
}

function renderPanel(
  overrides: { profiles?: BuildProfile[]; setEngine?: typeof noop } = {}
) {
  return render(
    <BuildPanel
      activeDiagnosticIndex={null}
      configurationState={{ status: "loading" }}
      dispatch={noop}
      engine="latexmkPdf"
      logContextSequence={null}
      onBuild={noop}
      onClean={noop}
      onLatexInstalled={noop}
      onNavigate={noop}
      onRevealOutput={noop}
      onSaveConfiguration={asyncNoop}
      onSelectDiagnostic={noop}
      onStartWatch={noop}
      onStop={noop}
      onStopWatch={noop}
      onTabChange={noop}
      profiles={{
        status: "ready",
        profiles: overrides.profiles ?? [missing],
      }}
      setEngine={overrides.setEngine ?? noop}
      state={initialProjectBuildState}
      tab="output"
      watch={{ status: "off", message: null }}
    />
  )
}

afterEach(() => {
  cleanup()
  listeners.length = 0
  startLatexInstallation.mockClear()
})

describe("LaTeX installation from the Build tab", () => {
  it("offers installation when the selected build tool is missing", () => {
    renderPanel()

    expect(screen.getByText(/is not installed/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Install LaTeX…" })).toBeTruthy()
  })

  it("shows the exact command before anything is downloaded", async () => {
    renderPanel()
    await userEvent.click(
      screen.getByRole("button", { name: "Install LaTeX…" })
    )

    expect(
      await screen.findByText("/opt/homebrew/bin/brew install --cask basictex")
    ).toBeTruthy()
    expect(
      screen.getByText(
        "Your operating system will ask for an administrator password."
      )
    ).toBeTruthy()
    expect(startLatexInstallation).not.toHaveBeenCalled()
  })

  it("reports live step progress once the user starts the installation", async () => {
    renderPanel()
    await userEvent.click(
      screen.getByRole("button", { name: "Install LaTeX…" })
    )
    await userEvent.click(
      await screen.findByRole("button", { name: /Install BasicTeX/ })
    )

    await waitFor(() =>
      expect(startLatexInstallation).toHaveBeenCalledWith("homebrew")
    )
    const progressBar = await screen.findByRole("progressbar", {
      name: "Installation progress",
    })
    expect(progressBar.getAttribute("aria-valuenow")).toBe("0")
    expect(progressBar.getAttribute("aria-valuemax")).toBe("3")
    expect(
      screen.getByRole("button", { name: "Stop installation" })
    ).toBeTruthy()
  })
})

describe("completion feedback", () => {
  it("confirms a finished installation with a dismissible notice", async () => {
    renderPanel()
    await userEvent.click(
      screen.getByRole("button", { name: "Install LaTeX…" })
    )
    await userEvent.click(
      await screen.findByRole("button", { name: /Install BasicTeX/ })
    )
    await waitFor(() => expect(startLatexInstallation).toHaveBeenCalled())
    await userEvent.click(
      screen.getByRole("button", { name: "Continue in background" })
    )

    act(() =>
      emit({
        kind: "finished",
        installationId: "install-1",
        status: "succeeded",
        finishedAt: 1_700_000_500,
        message: "LaTeX is ready. latexmk and 3 more tools are available.",
        availableTools: ["latexmk", "pdflatex", "xelatex", "lualatex"],
      })
    )

    const notice = await screen.findByRole("status", { name: "" })
    expect(notice.textContent).toContain("LaTeX installed")
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss installation notice" })
    )
    expect(screen.queryByText("LaTeX installed")).toBeNull()
  })

  it("reports the refreshed build tools when only some engines arrived", async () => {
    const setEngine = vi.fn<(...arguments_: unknown[]) => void>()
    renderPanel({ profiles: [missing, pdfLatex], setEngine })

    expect(
      screen.getByText(/pdfLaTeX is installed and can build this project/)
    ).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Use pdfLaTeX" }))

    expect(setEngine).toHaveBeenCalledWith("pdfLatex")
  })
})

describe("latexmk cached failures", () => {
  const failedRun = {
    id: buildId("1700000000-1"),
    projectPath,
    invocation: {
      executable: "/Library/TeX/texbin/latexmk",
      arguments: ["-pdf"],
      workingDirectory: projectPath,
      rootFile: projectRelativePath("main.tex"),
      engine: "latexmkPdf" as const,
      environment: [],
      bibliographyTool: "automatic" as const,
      custom: false,
    },
    status: "failed" as const,
    startedAt: 1_700_000_000,
    finishedAt: 1_700_000_010,
    exitCode: 12,
    entries: [
      {
        sequence: 1,
        timestamp: 1_700_000_005,
        stream: "stdout" as const,
        text: "Latexmk: Nothing to do for './main.tex'.",
      },
      {
        sequence: 2,
        timestamp: 1_700_000_006,
        stream: "stdout" as const,
        text: "  pdflatex: gave an error in previous invocation of latexmk.",
      },
    ],
    diagnostics: [],
  }

  it("explains the replayed error and routes to the clean action", async () => {
    const onClean = vi.fn<(...arguments_: unknown[]) => void>()
    render(
      <BuildPanel
        activeDiagnosticIndex={null}
        configurationState={{ status: "loading" }}
        dispatch={noop}
        engine="latexmkPdf"
        logContextSequence={null}
        onBuild={noop}
        onClean={onClean}
        onLatexInstalled={noop}
        onNavigate={noop}
        onRevealOutput={noop}
        onSaveConfiguration={asyncNoop}
        onSelectDiagnostic={noop}
        onStartWatch={noop}
        onStop={noop}
        onStopWatch={noop}
        onTabChange={noop}
        profiles={{
          status: "ready",
          profiles: [{ ...missing, available: true }],
        }}
        setEngine={noop}
        state={{
          ...initialProjectBuildState,
          runs: [failedRun],
          selectedRunId: failedRun.id,
        }}
        tab="problems"
        watch={{ status: "off", message: null }}
      />
    )

    const alert = screen.getByRole("alert", {
      name: "",
    })
    expect(
      within(alert).getByText("latexmk replayed an earlier failure")
    ).toBeTruthy()
    await userEvent.click(
      within(alert).getByRole("button", { name: "Clean auxiliary files" })
    )

    expect(onClean).toHaveBeenCalled()
  })
})
