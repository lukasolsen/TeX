import { describe, expect, it } from "vitest"

import {
  applyInstallEvent,
  completedStepCount,
  installNotice,
  installStepSummary,
  type InstallProgress,
} from "@/domain/latex-install"

const progress: InstallProgress = {
  id: "install-1",
  method: "homebrew",
  status: "running",
  steps: [
    {
      title: "Locate Homebrew",
      command: "/opt/homebrew/bin/brew",
      optional: false,
      status: "succeeded",
      detail: "Completed",
    },
    {
      title: "Install BasicTeX",
      command: "brew install --cask basictex",
      optional: false,
      status: "running",
      detail: null,
    },
    {
      title: "Verify the LaTeX tools",
      command: "latexmk",
      optional: false,
      status: "pending",
      detail: null,
    },
  ],
  activeStep: 1,
  startedAt: 1_700_000_000,
  finishedAt: null,
  message: null,
  availableTools: [],
  log: [],
}

describe("applyInstallEvent", () => {
  it("ignores events belonging to a superseded installation", () => {
    const updated = applyInstallEvent(progress, {
      kind: "finished",
      installationId: "install-0",
      status: "failed",
      finishedAt: 1_700_000_100,
      message: "Stale.",
      availableTools: [],
    })

    expect(updated).toBe(progress)
  })

  it("advances the active step and keeps the previous detail when none is sent", () => {
    const updated = applyInstallEvent(progress, {
      kind: "step",
      installationId: "install-1",
      index: 2,
      status: "running",
      detail: null,
    })

    expect(updated.activeStep).toBe(2)
    expect(updated.steps[2]?.status).toBe("running")
    expect(updated.steps[0]?.detail).toBe("Completed")
  })

  it("appends log entries once and drops duplicates from a reconciliation", () => {
    const entry = { sequence: 1, text: "==> Downloading" }
    const once = applyInstallEvent(progress, {
      kind: "log",
      installationId: "install-1",
      entry,
    })
    const twice = applyInstallEvent(once, {
      kind: "log",
      installationId: "install-1",
      entry,
    })

    expect(once.log).toEqual([entry])
    expect(twice.log).toEqual([entry])
  })

  it("records the terminal outcome and clears the active step", () => {
    const updated = applyInstallEvent(progress, {
      kind: "finished",
      installationId: "install-1",
      status: "restartRequired",
      finishedAt: 1_700_000_200,
      message: "Restart TeX, then build again.",
      availableTools: ["latexmk"],
    })

    expect(updated.status).toBe("restartRequired")
    expect(updated.activeStep).toBeNull()
    expect(updated.availableTools).toEqual(["latexmk"])
    expect(updated.message).toBe("Restart TeX, then build again.")
  })
})

describe("progress summaries", () => {
  it("counts only completed steps", () => {
    expect(completedStepCount(progress)).toBe(1)
    expect(installStepSummary(progress)).toBe("Step 2 of 3")
  })

  it("treats a skipped optional step as resolved", () => {
    const withSkip: InstallProgress = {
      ...progress,
      steps: progress.steps.map((step, index) =>
        index === 1 ? { ...step, optional: true, status: "skipped" } : step
      ),
    }

    expect(completedStepCount(withSkip)).toBe(2)
  })

  it("does not report a step beyond the last one", () => {
    const finished: InstallProgress = {
      ...progress,
      status: "succeeded",
      steps: progress.steps.map((step) => ({ ...step, status: "succeeded" })),
    }

    expect(installStepSummary(finished)).toBe("Step 3 of 3")
  })
})

describe("installNotice", () => {
  it("claims success only when latexmk actually landed", () => {
    expect(
      installNotice({
        status: "succeeded",
        availableTools: ["latexmk", "pdflatex"],
        message: "LaTeX is ready.",
      })
    ).toEqual({
      tone: "success",
      title: "LaTeX installed",
      detail: "LaTeX is ready.",
    })
  })

  it("warns when the distribution installed without latexmk", () => {
    const notice = installNotice({
      status: "succeeded",
      availableTools: ["pdflatex"],
      message: "LaTeX is installed, but latexmk could not be added.",
    })

    expect(notice?.tone).toBe("warning")
    expect(notice?.title).toBe("LaTeX installed without latexmk")
  })

  it("reports nothing while an installation is still running", () => {
    expect(
      installNotice({ status: "running", availableTools: [], message: null })
    ).toBeNull()
  })

  it("raises a failure to the error tone", () => {
    expect(
      installNotice({
        status: "failed",
        availableTools: [],
        message: "Installation stopped.",
      })?.tone
    ).toBe("error")
  })
})
