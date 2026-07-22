// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { projectRelativePath } from "@/domain/identifiers"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import { ProblemsPanel } from "@/features/workspace/problems-panel"

const path = projectRelativePath("main.tex")

const unresolved: LatexDiagnosticEntry = {
  code: "undefined-label",
  severity: "warning",
  message: "No \\label{sec:missing} is defined in this project.",
  from: 5,
  to: 16,
  layer: "project",
  line: 4,
  column: 6,
}

const unclosed: LatexDiagnosticEntry = {
  code: "unclosed-environment",
  severity: "error",
  message: "\\begin{itemize} is never closed. Add \\end{itemize}.",
  from: 40,
  to: 55,
  layer: "document",
  line: 9,
  column: 1,
}

afterEach(cleanup)

function renderPanel(
  diagnostics: readonly LatexDiagnosticEntry[],
  overrides: Partial<Parameters<typeof ProblemsPanel>[0]> = {}
) {
  const onNavigate = vi.fn<(line: number, column: number) => void>()
  render(
    <ProblemsPanel
      analysed
      diagnostics={diagnostics}
      onNavigate={onNavigate}
      onSelect={vi.fn<(index: number) => void>()}
      path={path}
      projectAnalysisComplete
      selectedIndex={null}
      {...overrides}
    />
  )
  return { onNavigate }
}

describe("problems panel", () => {
  it("states the file is clean rather than showing an empty list", () => {
    renderPanel([])

    expect(screen.getByText("No problems in main.tex")).toBeTruthy()
    expect(
      screen.getByText("Structure is balanced and every reference resolves.")
    ).toBeTruthy()
  })

  it("says why cross-reference checks are limited when the scan was partial", () => {
    renderPanel([], { projectAnalysisComplete: false })

    expect(
      screen.getByText(/could not read every file in this project/)
    ).toBeTruthy()
  })

  it("says it is still checking rather than claiming the file is clean", () => {
    renderPanel([], { analysed: false })

    expect(screen.getByText("Checking main.tex")).toBeTruthy()
    expect(screen.queryByText(/No problems/)).toBeNull()
  })

  it("explains that no file is open rather than reporting zero problems", () => {
    renderPanel([], { path: null })

    expect(screen.getByText("No source file open")).toBeTruthy()
  })

  it("counts errors and warnings separately", () => {
    renderPanel([unresolved, unclosed])

    expect(screen.getByText("1 error, 1 warning")).toBeTruthy()
  })

  it("navigates to the position of the problem that was activated", async () => {
    const { onNavigate } = renderPanel([unresolved, unclosed])

    await userEvent.click(
      screen.getByRole("button", { name: /is never closed/ })
    )

    expect(onNavigate).toHaveBeenCalledWith(9, 1)
  })

  it("names each severity in text rather than by colour alone", () => {
    renderPanel([unresolved, unclosed])

    expect(screen.getByRole("button", { name: /^Warning:/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Error:/ })).toBeTruthy()
  })

  it("reaches every problem by keyboard", async () => {
    renderPanel([unresolved, unclosed])
    const buttons = screen.getAllByRole("button")

    await userEvent.tab()
    expect(document.activeElement).toBe(buttons[0])
    await userEvent.tab()
    expect(document.activeElement).toBe(buttons[1])
  })
})
