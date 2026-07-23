/**
 * Completion for `.bib` files.
 *
 * Everything it offers is known from the file itself and the bundled catalog,
 * so it answers instantly and cannot be wrong about a project it never
 * consulted: entry templates after `@`, and the fields an entry type expects
 * where a field name belongs.
 */

import {
  snippet,
  type Completion,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete"

import { bibtexCompletionContextAt } from "@/domain/bibtex"
import {
  BIBTEX_ENTRY_TYPES,
  BIBTEX_FIELDS,
  type BibtexEntryType,
} from "@/domain/bibtex-catalog"

/** A complete entry, with a placeholder for the key and one per field. */
function entryTemplate(type: BibtexEntryType): string {
  if (type.name === "string") return "@string{${name} = {${value}}}"
  if (type.name === "preamble") return '@preamble{"${LaTeX}"}'
  if (type.name === "comment") return "@comment{${text}}"
  const fields = type.required
    .map((field) => `  ${field} = {\${${field}}},`)
    .join("\n")
  return `@${type.name}{\${key},\n${fields}\n}`
}

function entryOptions(): Completion[] {
  return BIBTEX_ENTRY_TYPES.map((type) => ({
    label: `@${type.name}`,
    detail: type.description,
    type: "entry",
    apply: snippet(entryTemplate(type)),
    ...(type.required.length === 0
      ? {}
      : { info: `Fields: ${type.required.join(", ")}` }),
  }))
}

function fieldOptions(
  entryType: string,
  present: ReadonlyArray<string>
): Completion[] {
  const known = BIBTEX_ENTRY_TYPES.find((type) => type.name === entryType)
  const expected = new Set([
    ...(known?.required ?? []),
    ...(known?.optional ?? []),
  ])
  const taken = new Set(present)
  return [...BIBTEX_FIELDS.entries()]
    .filter(([field]) => !taken.has(field))
    .map(([field, description]) => ({
      label: field,
      detail: description,
      type: "field",
      // The fields the entry's style will look for lead the list; the rest stay
      // available because a bibliography may legitimately carry more.
      boost: expected.has(field) ? 1 : 0,
      apply: snippet(`${field} = {\${}}`),
      info: expected.has(field)
        ? `Used by @${entryType} entries.`
        : `Not used by @${entryType} entries.`,
    }))
}

export function bibtexCompletionSource(): CompletionSource {
  return (context): CompletionResult | null => {
    const completing = bibtexCompletionContextAt(
      context.state.doc.toString(),
      context.pos
    )
    if (completing === null) return null
    if (completing.kind === "entry-type") {
      return {
        from: completing.from,
        to: completing.to,
        options: entryOptions(),
        validFor: /^@[A-Za-z]*$/,
      }
    }
    // An empty field slot is offered on request rather than while the author is
    // still moving around inside an entry.
    if (completing.query === "" && !context.explicit) return null
    return {
      from: completing.from,
      to: completing.to,
      options: fieldOptions(completing.entryType, completing.present),
      validFor: /^[A-Za-z]*$/,
    }
  }
}
