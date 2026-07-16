import type { DocumentSaveState, EditorDocumentChange } from "@/domain/project"
import type { ProjectRelativePath } from "@/domain/identifiers"

export type EditorChangeDecision = Readonly<{
  accepted: boolean
  contentChanged: boolean
  composingDocument: ProjectRelativePath | null
  schedulePersistence: boolean
}>

/** Classifies editor updates so partial IME composition is never persisted. */
export function classifyEditorChange(
  currentContent: string,
  composingDocument: ProjectRelativePath | null,
  path: ProjectRelativePath,
  change: EditorDocumentChange
): EditorChangeDecision {
  const compositionEnded = !change.composing && composingDocument === path
  const contentChanged = currentContent !== change.content
  const accepted = contentChanged || compositionEnded

  return {
    accepted,
    contentChanged,
    composingDocument: change.composing
      ? path
      : compositionEnded
        ? null
        : composingDocument,
    schedulePersistence: accepted && !change.composing,
  }
}

/** A completed write is current only when no newer editor content exists. */
export function saveStateAfterWrite(
  currentContent: string,
  writtenContent: string
): DocumentSaveState {
  return currentContent === writtenContent
    ? { status: "saved" }
    : { status: "dirty" }
}
