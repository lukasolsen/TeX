// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NotificationProvider } from "@/components/feedback/notification-provider"
import type { HiddenEntryPredicate } from "@/domain/file-visibility"
import type { ProjectEntry } from "@/domain/project"
import type { ProjectRelativePath } from "@/domain/identifiers"
import { ProjectTree } from "@/features/projects/project-tree"

afterEach(() => cleanup())

const projectWithArtifacts: ProjectEntry = {
  name: "project",
  kind: "directory",
  children: [
    { name: "main.tex", kind: "file", children: [] },
    { name: "main.log", kind: "file", children: [] },
    { name: "main.aux", kind: "file", children: [] },
    { name: "references.bib", kind: "file", children: [] },
  ],
}

function renderTree(
  onRefresh = vi.fn<() => void>(),
  isHidden: HiddenEntryPredicate = () => false,
  tree: ProjectEntry = { name: "project", kind: "directory", children: [] },
  handlers: {
    onOpenPdf?: (path: ProjectRelativePath) => void
    onPreviewFile?: (path: ProjectRelativePath) => void
  } = {}
): void {
  render(
    <NotificationProvider>
      <ProjectTree
        isHidden={isHidden}
        onCreate={async () => false}
        onDelete={vi.fn<(path: ProjectRelativePath) => Promise<void>>(
          async () => undefined
        )}
        onOpenFileSettings={vi.fn<() => void>()}
        onOpenPdf={
          handlers.onOpenPdf ?? vi.fn<(path: ProjectRelativePath) => void>()
        }
        onPinFile={vi.fn<(path: ProjectRelativePath) => void>()}
        onPreviewFile={
          handlers.onPreviewFile ?? vi.fn<(path: ProjectRelativePath) => void>()
        }
        onRefresh={onRefresh}
        onRename={vi.fn<
          (path: ProjectRelativePath, name: string) => Promise<boolean>
        >(async () => true)}
        rootFiles={[]}
        selectedFile={null}
        selectedPdf={null}
        selectedRoot={null}
        tree={tree}
      />
    </NotificationProvider>
  )
}

describe("ProjectTree", () => {
  it("closes a failed creation input and announces the error", async () => {
    const user = userEvent.setup()
    renderTree()

    fireEvent.contextMenu(
      screen.getByRole("complementary", { name: "Project files" })
    )
    await user.click(screen.getByRole("menuitem", { name: "New file" }))
    const input = screen.getByRole("textbox", { name: "New file name" })
    await user.type(input, "testing/example.txt{Enter}")

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not create the project entry."
    )
    expect(screen.queryByRole("textbox", { name: "New file name" })).toBeNull()
  })

  it("reloads the tree from the root context menu", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn<() => void>()
    renderTree(onRefresh)

    fireEvent.contextMenu(
      screen.getByRole("complementary", { name: "Project files" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Refresh" }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("omits filtered entries but says how many are missing", () => {
    renderTree(
      vi.fn<() => void>(),
      (name) => name.endsWith(".log") || name.endsWith(".aux"),
      projectWithArtifacts
    )

    expect(screen.queryByText("main.log")).toBeNull()
    expect(screen.queryByText("main.aux")).toBeNull()
    expect(screen.getByText("main.tex")).toBeTruthy()
    expect(screen.getByText("2 filtered items")).toBeTruthy()
  })

  it("reveals filtered entries on request without changing the rules", async () => {
    const user = userEvent.setup()
    renderTree(
      vi.fn<() => void>(),
      (name) => name.endsWith(".log") || name.endsWith(".aux"),
      projectWithArtifacts
    )

    await user.click(screen.getByRole("button", { name: "Show" }))
    expect(screen.getByText("main.log")).toBeTruthy()
    expect(screen.getByText("main.aux")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Hide" }))
    expect(screen.queryByText("main.log")).toBeNull()
  })

  it("opens logs and images, and disables what it cannot display", async () => {
    const user = userEvent.setup()
    const onPreviewFile = vi.fn<(path: ProjectRelativePath) => void>()
    const onOpenPdf = vi.fn<(path: ProjectRelativePath) => void>()
    renderTree(
      vi.fn<() => void>(),
      () => false,
      {
        name: "project",
        kind: "directory",
        children: [
          { name: "main.log", kind: "file", children: [] },
          { name: "plot.png", kind: "file", children: [] },
          { name: "main.pdf", kind: "file", children: [] },
          { name: "cmr10.pfb", kind: "file", children: [] },
        ],
      },
      { onOpenPdf, onPreviewFile }
    )

    await user.click(screen.getByRole("button", { name: /main\.log/ }))
    await user.click(screen.getByRole("button", { name: /plot\.png/ }))
    await user.click(screen.getByRole("button", { name: /main\.pdf/ }))

    expect(onPreviewFile.mock.calls.map(([path]) => path)).toEqual([
      "main.log",
      "plot.png",
    ])
    expect(onOpenPdf).toHaveBeenCalledWith("main.pdf")
    expect(
      screen
        .getByRole("button", { name: /cmr10\.pfb/ })
        .hasAttribute("disabled")
    ).toBe(true)
  })

  it("leaves the footer out when nothing is filtered", () => {
    renderTree(vi.fn<() => void>(), () => false, projectWithArtifacts)

    expect(screen.getByText("main.log")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull()
  })
})
