import type { Text } from "@codemirror/state"

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
const models = new WeakMap<Text, LatexDocumentModel>()

export function latexModelOf(doc: Text): LatexDocumentModel {
  const cached = models.get(doc)
  if (cached !== undefined) return cached
  const model =
    doc.length > MAX_MODELLED_BYTES
      ? EMPTY_MODEL
      : parseLatexDocument(doc.toString())
  models.set(doc, model)
  return model
}
