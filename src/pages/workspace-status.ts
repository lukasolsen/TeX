import type { AsyncDocumentState, OpenProjectFeedback } from "@/domain/project"

/**
 * The status-bar activity line describing an in-flight or failed project open,
 * or `null` when there is nothing to report.
 */
export function describeOpenFeedback(
  feedback: OpenProjectFeedback
): string | null {
  return feedback.status === "choosing"
    ? "Waiting for a folder…"
    : feedback.status === "opening"
      ? "Opening project…"
      : feedback.status === "cancelled"
        ? "Folder selection cancelled"
        : feedback.status === "error"
          ? feedback.error.message
          : null
}

/**
 * The status-bar activity line describing the active document's save state, or
 * `null` while no editable document is ready.
 */
export function describeSaveState(
  documentState: AsyncDocumentState
): string | null {
  return documentState.status !== "ready"
    ? null
    : documentState.saveState.status === "saved"
      ? "Saved"
      : documentState.saveState.status === "dirty"
        ? "Unsaved changes"
        : documentState.saveState.status === "saving"
          ? "Saving…"
          : documentState.saveState.status === "error"
            ? "Save failed · recovery available"
            : documentState.saveState.status === "conflict"
              ? "External change needs review"
              : "Recovery draft needs review"
}
