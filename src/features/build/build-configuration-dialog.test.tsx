// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProjectBuildConfiguration } from "@/domain/build"
import { BuildConfigurationDialog } from "@/features/build/build-configuration-dialog"

const configuration: ProjectBuildConfiguration = {
  schemaVersion: 1,
  rootFile: "main.tex",
  outputDirectory: null,
  bibliographyTool: "automatic",
  generatedDirectories: [],
  environment: [],
  customCommand: null,
}

afterEach(() => cleanup())

describe("BuildConfigurationDialog", () => {
  it("retains an incomplete environment entry and blocks submission", async () => {
    const onSave = vi.fn<(next: ProjectBuildConfiguration) => Promise<void>>(
      () => Promise.resolve()
    )
    render(
      <BuildConfigurationDialog
        configuration={configuration}
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onSave={onSave}
        open
      />
    )

    const environment = screen.getByRole("textbox", {
      name: /^TeX environment overrides/,
    })
    await userEvent.type(environment, "TEXINPUTS")
    expect(environment).toHaveProperty("value", "TEXINPUTS")
    await userEvent.click(
      screen.getByRole("button", { name: "Save build configuration" })
    )

    expect(onSave).not.toHaveBeenCalled()
    expect(
      screen.getByText("Every environment entry must use NAME=value.")
    ).toBeTruthy()
  })
})
