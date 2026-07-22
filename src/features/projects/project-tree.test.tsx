// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProjectRelativePath } from "@/domain/identifiers"
import { ProjectTree } from "@/features/projects/project-tree"

afterEach(() => cleanup())

describe("ProjectTree", () => {
  it("closes a failed creation input and announces the error", async () => {
    const user = userEvent.setup()
    render(
      <ProjectTree
        onCreate={async () => false}
        onDelete={vi.fn<(path: ProjectRelativePath) => Promise<void>>(
          async () => undefined
        )}
        onOpenPdf={vi.fn<(path: ProjectRelativePath) => void>()}
        onPinFile={vi.fn<(path: ProjectRelativePath) => void>()}
        onPreviewFile={vi.fn<(path: ProjectRelativePath) => void>()}
        onRename={vi.fn<
          (path: ProjectRelativePath, name: string) => Promise<boolean>
        >(async () => true)}
        rootFiles={[]}
        selectedFile={null}
        selectedPdf={null}
        selectedRoot={null}
        tree={{ name: "project", kind: "directory", children: [] }}
      />
    )

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
})
