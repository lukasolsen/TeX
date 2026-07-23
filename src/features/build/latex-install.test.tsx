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

import {
  initialBuildProgress,
  initialProjectBuildState,
  type BuildProfile,
} from "@/domain/build"
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
import { NotificationProvider } from "@/components/feedback/notification-provider"
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
    title: step.title,
    command: step.command,
    optional: step.optional,
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
  label: "pdfLaTeX",
  description:
    "Reruns pdfLaTeX and the bibliography tools until references resolve.",
  executable: "latexmk",
  resolvesReferences: true,
  recommended: true,
  available: false,
}

const noop = vi.fn<(...arguments_: unknown[]) => void>()
const asyncNoop = vi.fn<(...arguments_: unknown[]) => Promise<void>>(() =>
  Promise.resolve()
)

const pdfLatex: BuildProfile = {
  engine: "pdfLatex",
  label: "Single pass (pdfLaTeX)",
  description: "One pdfLaTeX run. Cross-references will not resolve.",
  executable: "pdflatex",
  resolvesReferences: false,
  recommended: false,
  available: true,
}

function renderPanel(
  overrides: { profiles?: BuildProfile[]; setEngine?: typeof noop } = {}
) {
  return render(
    <NotificationProvider>
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
        queued={false}
        rootCandidates={["main.tex"]}
        profiles={{
          status: "ready",
          profiles: overrides.profiles ?? [missing],
        }}
        setEngine={overrides.setEngine ?? noop}
        state={initialProjectBuildState}
        tab="output"
        watch={{ status: "off", message: null }}
      />
    </NotificationProvider>
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

    const notifications = await screen.findByRole("region", {
      name: "Notifications",
    })
    expect(notifications.textContent).toContain("LaTeX installed")
    await userEvent.click(
      screen.getByRole("button", {
        name: "Dismiss notification: LaTeX installed",
      })
    )
    expect(screen.queryByText("LaTeX installed")).toBeNull()
  })

  /// An installed single-pass engine is offered, but never described as able
  /// to build the project: it resolves no references.
  it("offers a single-pass engine without claiming it builds the project", async () => {
    const setEngine = vi.fn<(...arguments_: unknown[]) => void>()
    renderPanel({ profiles: [missing, pdfLatex], setEngine })

    expect(
      screen.getByText(
        /leaves cross-references, the table of contents, and citations unresolved/
      )
    ).toBeTruthy()
    expect(screen.queryByText(/can build this project/)).toBeNull()
    await userEvent.click(
      screen.getByRole("button", { name: "Use Single pass (pdfLaTeX)" })
    )

    expect(setEngine).toHaveBeenCalledWith("pdfLatex")
  })

  /// A reference-resolving engine is preferred over a single-pass one when
  /// both arrived, so the offer is the one that produces a correct document.
  it("prefers a reference-resolving alternative", async () => {
    const setEngine = vi.fn<(...arguments_: unknown[]) => void>()
    const xelatex: BuildProfile = {
      engine: "xeLatex",
      label: "XeLaTeX",
      description: "Reruns XeLaTeX until references resolve.",
      executable: "latexmk",
      resolvesReferences: true,
      recommended: false,
      available: true,
    }
    renderPanel({ profiles: [missing, pdfLatex, xelatex], setEngine })

    expect(
      screen.getByText(/XeLaTeX is installed and can build this project/)
    ).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Use XeLaTeX" }))

    expect(setEngine).toHaveBeenCalledWith("xeLatex")
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
      bibliography: "automatic" as const,
      resolvesReferences: true,
      custom: false,
    },
    status: "failed" as const,
    reason: null,
    pdfFresh: false,
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
    progress: initialBuildProgress,
  }

  it("explains the replayed error and routes to the clean action", async () => {
    const onClean = vi.fn<(...arguments_: unknown[]) => void>()
    render(
      <NotificationProvider>
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
          queued={false}
          rootCandidates={["main.tex"]}
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
      </NotificationProvider>
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
