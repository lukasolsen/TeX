// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  canonicalProjectPath,
  type CanonicalProjectPath,
} from "@/domain/identifiers"
import type { StartupState } from "@/domain/project"
import { RecentProjectsDialog } from "@/features/projects/recent-projects-dialog"

// jsdom implements neither ResizeObserver nor scrollIntoView; cmdk uses both to
// size its list and follow the selected item.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
Element.prototype.scrollIntoView = (): void => {}

const loadStartupState = vi.hoisted(() =>
  vi.fn<() => Promise<StartupState>>(() =>
    Promise.resolve({
      recentProjects: [],
      lastWorkspace: null,
      restorationNotice: null,
    })
  )
)

vi.mock("@/services/project-service", () => ({
  loadStartupState,
  projectErrorFromUnknown: (error: unknown) => ({
    code: "unknown",
    message: error instanceof Error ? error.message : "Unknown failure.",
  }),
}))

const reportPath = canonicalProjectPath("/projects/report")
const thesisPath = canonicalProjectPath("/projects/thesis")

function startupWithProjects(): StartupState {
  return {
    recentProjects: [
      {
        name: "report",
        path: reportPath,
        lastOpenedAt: Date.now(),
        availability: "available",
      },
      {
        name: "thesis",
        path: thesisPath,
        lastOpenedAt: Date.now(),
        availability: "missing",
      },
    ],
    lastWorkspace: null,
    restorationNotice: null,
  }
}

afterEach(() => {
  cleanup()
  loadStartupState.mockReset()
})

describe("RecentProjectsDialog", () => {
  it("opens the project the user picks and closes itself", async () => {
    loadStartupState.mockResolvedValue(startupWithProjects())
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const onOpenRecent = vi.fn<(path: CanonicalProjectPath) => void>()
    render(
      <RecentProjectsDialog
        onOpenChange={onOpenChange}
        onOpenProject={vi.fn<() => void>()}
        onOpenRecent={onOpenRecent}
        open
      />
    )

    const entry = await screen.findByText("/projects/report")
    await userEvent.click(entry)

    expect(onOpenRecent).toHaveBeenCalledWith(reportPath)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("marks a project whose folder is gone instead of offering to open it", async () => {
    loadStartupState.mockResolvedValue(startupWithProjects())
    const onOpenRecent = vi.fn<(path: CanonicalProjectPath) => void>()
    render(
      <RecentProjectsDialog
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onOpenProject={vi.fn<() => void>()}
        onOpenRecent={onOpenRecent}
        open
      />
    )

    const entry = await screen.findByText(/thesis — unavailable/)
    await userEvent.click(entry)

    expect(onOpenRecent).not.toHaveBeenCalled()
  })

  it("states when the device remembers no project", async () => {
    loadStartupState.mockResolvedValue({
      recentProjects: [],
      lastWorkspace: null,
      restorationNotice: null,
    })
    render(
      <RecentProjectsDialog
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onOpenProject={vi.fn<() => void>()}
        onOpenRecent={vi.fn<(path: CanonicalProjectPath) => void>()}
        open
      />
    )

    expect(
      await screen.findByText("No projects opened on this device yet.")
    ).toBeTruthy()
  })

  it("reports a history that could not be read", async () => {
    loadStartupState.mockRejectedValue(new Error("History file is damaged."))
    render(
      <RecentProjectsDialog
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onOpenProject={vi.fn<() => void>()}
        onOpenRecent={vi.fn<(path: CanonicalProjectPath) => void>()}
        open
      />
    )

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "History file is damaged."
      )
    })
  })

  it("does not read the history while it is closed", () => {
    render(
      <RecentProjectsDialog
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onOpenProject={vi.fn<() => void>()}
        onOpenRecent={vi.fn<(path: CanonicalProjectPath) => void>()}
        open={false}
      />
    )

    expect(loadStartupState).not.toHaveBeenCalled()
  })
})
