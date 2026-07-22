// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { canonicalProjectPath } from "@/domain/identifiers"
import type { BottomPanelTab } from "@/domain/project"
import { BottomPanel } from "@/features/workspace/bottom-panel"

afterEach(cleanup)

function renderPanel(tab: BottomPanelTab = "build") {
  const onTabChange = vi.fn<(tab: BottomPanelTab) => void>()
  render(
    <BottomPanel
      buildPanel={<p>Build output</p>}
      onClose={vi.fn<() => void>()}
      onTabChange={onTabChange}
      problemCount={0}
      problemsPanel={<p>Problem list</p>}
      projectPath={canonicalProjectPath("/projects/report")}
      tab={tab}
      terminalStarted={false}
    />
  )
  return { onTabChange }
}

/** Inactive panes stay mounted and are hidden with a class, not unmounted. */
function paneHidden(text: string): boolean {
  const pane = screen.getByText(text).closest("div")
  return pane?.className.includes("hidden") ?? true
}

describe("bottom dock", () => {
  it.each<[BottomPanelTab, BottomPanelTab]>([
    ["build", "terminal"],
    ["problems", "build"],
    ["terminal", "build"],
  ])("reports a switch to the %s tab", async (tab, initialTab) => {
    // Every trigger must reach the handler; a value the handler silently
    // drops makes its tab look broken rather than fail loudly.
    const { onTabChange } = renderPanel(initialTab)

    await userEvent.click(
      screen.getByRole("tab", { name: new RegExp(tab, "i") })
    )

    expect(onTabChange).toHaveBeenCalledWith(tab)
  })

  it("shows the problems panel when its tab is active", () => {
    renderPanel("problems")

    expect(paneHidden("Problem list")).toBe(false)
  })

  it("keeps the build panel mounted but hidden while another tab is active", () => {
    renderPanel("problems")

    expect(screen.getByText("Build output")).not.toBeNull()
    expect(paneHidden("Build output")).toBe(true)
  })

  it("counts problems on the tab only when there are some", () => {
    const { unmount } = render(
      <BottomPanel
        buildPanel={null}
        onClose={vi.fn<() => void>()}
        onTabChange={vi.fn<(tab: BottomPanelTab) => void>()}
        problemCount={3}
        problemsPanel={null}
        projectPath={canonicalProjectPath("/projects/report")}
        tab="build"
        terminalStarted={false}
      />
    )
    expect(
      screen.getByRole("tab", { name: /problems/i }).textContent
    ).toContain("3")
    unmount()

    renderPanel("build")
    expect(
      screen.getByRole("tab", { name: /problems/i }).textContent
    ).not.toMatch(/\d/)
  })
})
