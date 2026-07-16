import type { WorkspaceState } from "@/domain/project"

export type WorkspaceViewport = { width: number; height: number }

const SIDEBAR_MIN = 220
const SOURCE_MIN = 240
const PDF_MIN = 240
const BUILD_MIN = 160

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.max(minimum, Math.min(maximum, value)))
}

/** Validates persisted pixel geometry against the viewport used for restoration. */
export function restoreWorkspaceGeometry(
  workspace: WorkspaceState,
  viewport: WorkspaceViewport
): { workspace: WorkspaceState; notice: string | null } {
  const width = Math.max(SIDEBAR_MIN + SOURCE_MIN, Math.floor(viewport.width))
  const height = Math.max(BUILD_MIN + 240, Math.floor(viewport.height))
  const pdfReserve = workspace.pdfPaneOpen ? PDF_MIN : 0
  const sidebarWidth = clamp(
    workspace.sidebarWidth,
    SIDEBAR_MIN,
    Math.max(SIDEBAR_MIN, width - SOURCE_MIN - pdfReserve)
  )
  const pdfPaneWidth = clamp(
    workspace.pdfPaneWidth,
    PDF_MIN,
    Math.max(PDF_MIN, width - sidebarWidth - SOURCE_MIN)
  )
  const buildPanelHeight = clamp(
    workspace.buildPanelHeight,
    BUILD_MIN,
    Math.max(BUILD_MIN, Math.floor(height * 0.6))
  )
  const changed =
    sidebarWidth !== workspace.sidebarWidth ||
    pdfPaneWidth !== workspace.pdfPaneWidth ||
    buildPanelHeight !== workspace.buildPanelHeight

  return {
    workspace: {
      ...workspace,
      sidebarWidth,
      pdfPaneWidth,
      buildPanelHeight,
    },
    notice: changed
      ? "Some workspace sizes were adjusted to fit the current window."
      : null,
  }
}
