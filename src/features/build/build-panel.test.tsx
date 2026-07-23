// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { initialProjectBuildState } from "@/domain/build"
import { NotificationProvider } from "@/components/feedback/notification-provider"
import { BuildPanel } from "@/features/build/build-panel"

const noop = () => {}
const asyncNoop = () => Promise.resolve()

afterEach(cleanup)

function renderPanel() {
  render(
    <NotificationProvider>
      <BuildPanel
        configurationState={{ status: "loading" }}
        dispatch={noop}
        engine="latexmkPdf"
        logContextSequence={null}
        onBuild={noop}
        onClean={noop}
        onLatexInstalled={noop}
        onRevealOutput={noop}
        onSaveConfiguration={asyncNoop}
        onStartWatch={noop}
        onStop={noop}
        onStopWatch={noop}
        profiles={{ status: "loading" }}
        queued={false}
        rootCandidates={["main.tex"]}
        setEngine={noop}
        state={initialProjectBuildState}
        watch={{ status: "off", message: null }}
      />
    </NotificationProvider>
  )
}

describe("build panel", () => {
  it("answers the diagnostics question in one place, not two", () => {
    // The dock owns Problems now; a second Problems tab inside this panel is
    // the duplication this layout exists to remove.
    renderPanel()

    expect(screen.queryByRole("tab", { name: /problems/i })).toBeNull()
    expect(screen.queryByRole("tab", { name: /output/i })).toBeNull()
  })

  it("keeps the build controls at the top level rather than behind the menu", () => {
    renderPanel()

    expect(screen.getByRole("button", { name: "Build PDF" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Rebuild on save" })).toBeTruthy()
  })

  // Base UI positions its popup from real layout, which jsdom does not
  // provide, so the menu cannot be opened here. What is checkable is that the
  // trigger announces itself as one — the contract screen readers rely on.
  it("announces the overflow control as a menu trigger", () => {
    renderPanel()
    const trigger = screen.getByRole("button", { name: "More build actions" })

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })
})
