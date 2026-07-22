// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { defaultAppPreferences } from "@/domain/preferences"
import { canonicalProjectPath, projectRelativePath } from "@/domain/identifiers"
import { PdfViewer } from "@/features/pdf/pdf-viewer"

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn<(options: unknown) => unknown>(),
}))

vi.mock("pdfjs-dist", () => ({
  getDocument: pdfMocks.getDocument,
  GlobalWorkerOptions: { workerSrc: "" },
  TextLayerImages: class {},
}))

vi.mock("pdfjs-dist/web/pdf_viewer.mjs", () => ({
  TextLayerBuilder: class {
    readonly div = document.createElement("div")
    readonly onAppend: ((layer: HTMLDivElement) => void) | undefined

    constructor(options: { onAppend?: (layer: HTMLDivElement) => void }) {
      this.div.className = "textLayer"
      this.onAppend = options.onAppend
    }

    render(): Promise<void> {
      const endOfContent = document.createElement("div")
      endOfContent.className = "endOfContent"
      this.div.append(endOfContent)
      this.onAppend?.(this.div)
      return Promise.resolve()
    }

    cancel(): void {}
  },
}))

vi.mock("@/services/project-service", () => ({
  projectErrorFromUnknown: () => ({
    code: "unavailable",
    message: "PDF unavailable.",
  }),
  projectPdfRevision: () => Promise.resolve("revision"),
  readProjectPdf: () => Promise.resolve(new Uint8Array([1])),
  synctexForwardSearch: () => Promise.reject(new Error("Not used")),
  synctexInverseSearch: () => Promise.reject(new Error("Not used")),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PDF text selection", () => {
  it("renders PDF.js's selection boundary inside each text layer", async () => {
    const viewport = {
      width: 612,
      height: 792,
      scale: 1,
      rotation: 0,
      rawDims: { pageWidth: 612, pageHeight: 792 },
      convertToPdfPoint: (x: number, y: number) => [x, y],
    }
    const document = {
      numPages: 1,
      get loadingTask() {
        return loadingTask
      },
      getOutline: () => Promise.resolve(null),
      getPage: () =>
        Promise.resolve({
          cleanup: () => undefined,
          getViewport: () => viewport,
          render: () => ({
            cancel: () => undefined,
            promise: Promise.resolve(),
          }),
          view: [0, 0, 612, 792],
        }),
    }
    const loadingTask = {
      destroy: () => Promise.resolve(),
      promise: Promise.resolve(document),
    }
    pdfMocks.getDocument.mockReturnValue(loadingTask)
    const callback = vi.fn<() => void>()

    render(
      <PdfViewer
        defaults={defaultAppPreferences.pdf}
        initialState={undefined}
        onClose={callback}
        onNavigateSource={callback}
        onStateChange={callback}
        path={projectRelativePath("main.pdf")}
        projectPath={canonicalProjectPath("/projects/report")}
        refreshToken=""
        sourceLocation={null}
      />
    )

    const page = await screen.findByLabelText("Page 1")
    await waitFor(() => {
      expect(page.querySelector(".textLayer > .endOfContent")).not.toBeNull()
    })
  })
})
