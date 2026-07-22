import type { Text } from "@codemirror/state"

import type { ProjectRelativePath } from "@/domain/identifiers"
import {
  parseLatexDocument,
  type LatexDocumentModel,
} from "@/domain/latex-syntax"

/**
 * Documents above this size are not modelled. Folding and matching are
 * conveniences; on a source this large the cost of a full parse per document
 * version would be paid on the typing path, which
 * `ui-ux-requirements.md` does not allow.
 */
const MAX_MODELLED_BYTES = 2 * 1024 * 1024

const EMPTY_MODEL: LatexDocumentModel = {
  regions: [],
  occurrences: [],
  problems: [],
  truncated: true,
}

/**
 * Parses `doc` at most once per document version.
 *
 * Folding, delimiter matching, and navigation all need the structural model
 * while rendering the same frame. Keying the cache on the immutable `Text`
 * instance means they share one parse, and a superseded version becomes
 * collectable as soon as CodeMirror drops it.
 */
const models = new WeakMap<
  Text,
  { sourcePath: ProjectRelativePath | null; model: LatexDocumentModel }
>()

/**
 * `sourcePath` is the file the document belongs to, needed to resolve its file
 * references. A cached parse is reused only for the same path, so switching
 * documents cannot leave paths resolved against the previous file's directory.
 */
export function latexModelOf(
  doc: Text,
  sourcePath: ProjectRelativePath | null = null
): LatexDocumentModel {
  const cached = models.get(doc)
  if (cached !== undefined && cached.sourcePath === sourcePath) {
    return cached.model
  }
  const model =
    doc.length > MAX_MODELLED_BYTES
      ? EMPTY_MODEL
      : parseLatexDocument(doc.toString(), sourcePath)
  models.set(doc, { sourcePath, model })
  return model
}
