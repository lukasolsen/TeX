// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { editorContextActions } from "@/features/editor/editor-context-actions"
import { EditorContextMenu } from "@/features/editor/editor-context-menu"

afterEach(cleanup)

function renderMenu(
  state: Parameters<typeof editorContextActions>[0] = {
    navigable: true,
    hasSelection: true,
    foldable: true,
    folded: false,
    readOnly: false,
  }
) {
  const onSelect = vi.fn<(id: string) => void>()
  const onOpen = vi.fn<(event: { clientX: number; clientY: number }) => void>()
  render(
    <EditorContextMenu
      actions={editorContextActions(state)}
      onOpen={onOpen}
      onSelect={onSelect}
    >
      <div data-testid="editor-surface" style={{ height: 100, width: 100 }} />
    </EditorContextMenu>
  )
  return { onOpen, onSelect }
}

async function openMenu() {
  await userEvent.pointer({
    target: screen.getByTestId("editor-surface"),
    keys: "[MouseRight]",
  })
  await waitFor(() => screen.getByRole("menu"))
}

describe("editor context menu", () => {
  it("reports the pointer position so the caller can read what was clicked", async () => {
    const { onOpen } = renderMenu()
    await openMenu()

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]?.[0]).toMatchObject({
      clientX: expect.any(Number),
      clientY: expect.any(Number),
    })
  })

  it("shows every offered action as a named menu item", async () => {
    renderMenu()
    await openMenu()

    for (const name of [
      "Go to definition",
      "Cut",
      "Copy",
      "Paste",
      "Toggle comment",
      "Fold",
      "Find in file",
      "Select all",
    ]) {
      expect(
        screen.getByRole("menuitem", { name: new RegExp(name) })
      ).toBeTruthy()
    }
  })

  it("dispatches the action that was chosen", async () => {
    const { onSelect } = renderMenu()
    await openMenu()
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Go to definition/ })
    )

    expect(onSelect).toHaveBeenCalledWith("go-to-definition")
  })

  it("omits an action that cannot do anything rather than disabling it", async () => {
    renderMenu({
      navigable: false,
      hasSelection: false,
      foldable: false,
      folded: false,
      readOnly: false,
    })
    await openMenu()

    expect(
      screen.queryByRole("menuitem", { name: /Go to definition/ })
    ).toBeNull()
    expect(screen.queryByRole("menuitem", { name: /Copy/ })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: /disabled/i })).toBeNull()
  })

  it("is operable from the keyboard", async () => {
    const { onSelect } = renderMenu()
    await openMenu()

    await userEvent.keyboard("{ArrowDown}")
    await userEvent.keyboard("{Enter}")

    expect(onSelect).toHaveBeenCalledWith("go-to-definition")
  })
})
