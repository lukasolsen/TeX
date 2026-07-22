/**
 * Deciding what a Ctrl/⌘-click or a go-to-definition keystroke targets.
 *
 * The decision is split in two on purpose. Whether a position is navigable is
 * answered from the local model, synchronously, because the underline that
 * invites the click has to appear while the pointer moves. Where the target
 * actually is needs the project index, so it is resolved over IPC only once the
 * user commits to the jump.
 */

import type { Text } from "@codemirror/state"

import type { ProjectRelativePath } from "@/domain/identifiers"
import { latexOccurrenceAt, type LatexOccurrence } from "@/domain/latex-syntax"
import { latexModelOf } from "@/features/editor/latex-model"

export type EditorPosition = Readonly<{ line: number; column: number }>

export type NavigationTarget =
  /** A file reference, resolvable without the project index. */
  | Readonly<{
      kind: "file"
      from: number
      to: number
      path: ProjectRelativePath
    }>
  /** A label or citation, whose definition only the project index knows. */
  | Readonly<{
      kind: "symbol"
      from: number
      to: number
      name: string
      role: LatexOccurrence["role"]
    }>

const NAVIGABLE_SYMBOL_ROLES: ReadonlySet<LatexOccurrence["role"]> = new Set([
  "label-reference",
  "citation-reference",
])

/**
 * What a jump from `position` would target, or `null` where nothing would
 * happen. A file reference is only offered when the file exists, so the
 * underline never invites a click that cannot land; a symbol reference is
 * offered on its spelling alone, because deciding whether it resolves needs the
 * project index and a diagnostic already marks the ones that do not.
 */
export function navigationTargetAt(
  doc: Text,
  sourcePath: ProjectRelativePath,
  position: number,
  fileExists: (path: ProjectRelativePath) => boolean
): NavigationTarget | null {
  const occurrence = latexOccurrenceAt(latexModelOf(doc, sourcePath), position)
  if (occurrence === null) return null

  if (occurrence.role === "file-reference") {
    if (occurrence.path === null || !fileExists(occurrence.path)) return null
    return {
      kind: "file",
      from: occurrence.from,
      to: occurrence.to,
      path: occurrence.path,
    }
  }

  if (!NAVIGABLE_SYMBOL_ROLES.has(occurrence.role)) return null
  return {
    kind: "symbol",
    from: occurrence.from,
    to: occurrence.to,
    name: occurrence.name,
    role: occurrence.role,
  }
}

/** How a symbol that could not be resolved is explained to the user. */
export function unresolvedSymbolMessage(target: {
  name: string
  role: LatexOccurrence["role"]
}): string {
  return target.role === "citation-reference"
    ? `No bibliography entry named ${target.name} exists in this project`
    : `No \\label{${target.name}} is defined in this project`
}
