// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import type { NotificationRequest } from "@/domain/notification"

import { NotificationProvider } from "./notification-provider"
import { useNotifier } from "./notifier-context"

afterEach(cleanup)

function Raiser({
  requests,
}: {
  requests: ReadonlyArray<NotificationRequest>
}): ReactElement {
  const { notify } = useNotifier()
  return (
    <button onClick={() => requests.forEach((request) => notify(request))}>
      Raise
    </button>
  )
}

function renderWith(
  requests: ReadonlyArray<NotificationRequest>
): ReturnType<typeof userEvent.setup> {
  render(
    <NotificationProvider>
      <Raiser requests={requests} />
    </NotificationProvider>
  )
  return userEvent.setup()
}

describe("NotificationProvider", () => {
  it("keeps both live regions mounted before anything is raised", () => {
    render(
      <NotificationProvider>
        <span />
      </NotificationProvider>
    )
    const region = screen.getByRole("region", { name: "Notifications" })
    expect(region.querySelectorAll("[aria-live]")).toHaveLength(2)
  })

  it("renders a raised notification with its detail and action", async () => {
    const run = vi.fn<() => void>()
    const user = renderWith([
      {
        tone: "success",
        title: "LaTeX installed",
        detail: "latexmk is on the search path.",
        action: { label: "View installation details", run },
      },
    ])

    await user.click(screen.getByRole("button", { name: "Raise" }))

    expect(screen.getByText("LaTeX installed")).toBeTruthy()
    expect(screen.getByText("latexmk is on the search path.")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "View installation details" })
    )
    expect(run).toHaveBeenCalledOnce()
  })

  it("announces an error assertively and everything else politely", async () => {
    const user = renderWith([
      { tone: "error", title: "Copy failed" },
      { tone: "success", title: "Saved" },
    ])

    await user.click(screen.getByRole("button", { name: "Raise" }))

    const assertive = document.querySelector('[aria-live="assertive"]')
    const polite = document.querySelector('[aria-live="polite"]')
    expect(assertive?.textContent).toContain("Copy failed")
    expect(assertive?.textContent).not.toContain("Saved")
    expect(polite?.textContent).toContain("Saved")
  })

  it("caps the visible stack at three and drops the oldest", async () => {
    const user = renderWith([
      { tone: "warning", title: "First" },
      { tone: "warning", title: "Second" },
      { tone: "warning", title: "Third" },
      { tone: "warning", title: "Fourth" },
    ])

    await user.click(screen.getByRole("button", { name: "Raise" }))

    expect(screen.queryByText("First")).toBeNull()
    for (const title of ["Second", "Third", "Fourth"]) {
      expect(screen.getByText(title)).toBeTruthy()
    }
  })

  it("collapses a repeating keyed condition onto one entry", async () => {
    const user = renderWith([
      { tone: "error", title: "Copy failed", key: "clipboard" },
      { tone: "error", title: "Copy failed again", key: "clipboard" },
    ])

    await user.click(screen.getByRole("button", { name: "Raise" }))

    expect(screen.queryByText("Copy failed")).toBeNull()
    expect(screen.getByText("Copy failed again")).toBeTruthy()
  })

  it("dismisses on request", async () => {
    const user = renderWith([{ tone: "warning", title: "Restart TeX" }])

    await user.click(screen.getByRole("button", { name: "Raise" }))
    await user.click(
      screen.getByRole("button", { name: "Dismiss notification: Restart TeX" })
    )

    expect(screen.queryByText("Restart TeX")).toBeNull()
  })

  it("retires a settled tone and keeps an unresolved one", async () => {
    vi.useFakeTimers()
    try {
      render(
        <NotificationProvider>
          <Raiser
            requests={[
              { tone: "success", title: "Build finished" },
              { tone: "error", title: "Build failed" },
            ]}
          />
        </NotificationProvider>
      )
      fireEvent.click(screen.getByRole("button", { name: "Raise" }))
      expect(screen.getByText("Build finished")).toBeTruthy()

      await act(() => vi.advanceTimersByTimeAsync(10_000))

      expect(screen.queryByText("Build finished")).toBeNull()
      expect(screen.getByText("Build failed")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
