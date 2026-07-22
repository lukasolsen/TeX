// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProjectImage } from "@/domain/project"
import { projectRelativePath } from "@/domain/identifiers"
import { ImageViewer } from "@/features/projects/image-viewer"

afterEach(() => cleanup())

const image: ProjectImage = {
  path: projectRelativePath("figures/plot.png"),
  mediaType: "image/png",
  bytes: new Uint8Array(2048),
}

describe("ImageViewer", () => {
  it("shows the file's size and zoom state, and reports its dimensions", () => {
    render(<ImageViewer image={image} />)

    expect(
      screen.getByRole("button", { name: "Fit" }).getAttribute("aria-pressed")
    ).toBe("true")
    expect(screen.getByText(/2\.0 KiB/)).toBeTruthy()

    const element = screen.getByRole("img", {
      name: "Contents of figures/plot.png",
    })
    Object.defineProperty(element, "naturalWidth", { value: 640 })
    Object.defineProperty(element, "naturalHeight", { value: 480 })
    fireEvent.load(element)

    expect(screen.getByText("640 × 480 px")).toBeTruthy()
  })

  it("steps zoom away from fit and back to actual size", async () => {
    const user = userEvent.setup()
    render(<ImageViewer image={image} />)

    await user.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(screen.getByText("150%")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Actual size" }))
    expect(screen.getByText("100%")).toBeTruthy()
  })

  it("states that the file is not a readable image when decoding fails", () => {
    render(<ImageViewer image={image} />)

    fireEvent.error(
      screen.getByRole("img", { name: "Contents of figures/plot.png" })
    )

    expect(screen.getByText(/not a readable image\/png image/)).toBeTruthy()
  })

  it("revokes the object URL it created when the image changes", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL")
    const { unmount } = render(<ImageViewer image={image} />)

    unmount()

    expect(revoke).toHaveBeenCalledTimes(1)
    revoke.mockRestore()
  })
})
