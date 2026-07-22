/**
 * Completion from the bundled documentation catalog.
 *
 * The catalog already describes several hundred commands, packages, and
 * document classes for hover. Offering the same entries as completions costs no
 * new content and means a suggestion and its hover card can never disagree.
 *
 * The whole catalog for a context is returned at once and CodeMirror's own
 * matcher narrows it as the user types, which is what makes `\bfsr` find
 * `\bfseries`. Filtering server-side by prefix could not do that.
 */

import type { Completion } from "@codemirror/autocomplete"

import type { LatexCompletionContext } from "@/domain/latex-completion-context"
import { latexDocumentation } from "@/features/editor/latex-documentation"
import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"
import { renderMarkdownDocumentation } from "@/features/editor/latex-hover"

/**
 * Catalog entries rank below anything the project itself defines: a macro or
 * label from the user's own source is nearly always the better answer.
 */
const CATALOG_BOOST = -20

/** A one-line summary for the row, taken from the entry's first sentence. */
export function catalogSummary(markdown: string): string {
  const firstParagraph = markdown.split("\n\n")[0] ?? ""
  const sentence = /^(.*?[.!?])(\s|$)/.exec(firstParagraph)?.[1]
  return (sentence ?? firstParagraph)
    .replaceAll(/`([^`]*)`/g, "$1")
    .replaceAll(/\*\*?([^*]*)\*\*?/g, "$1")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim()
}

function option(
  label: string,
  documentation: LatexDocumentation,
  type: string,
  apply?: string
): Completion {
  return {
    label,
    type,
    detail: catalogSummary(documentation.markdown),
    boost: CATALOG_BOOST,
    info: () =>
      renderMarkdownDocumentation(documentation.title, documentation.markdown),
    ...(apply === undefined ? {} : { apply }),
  }
}

let commandOptions: Completion[] | null = null
let packageOptions: Completion[] | null = null
let documentClassOptions: Completion[] | null = null

/** Built once and reused; the catalog is immutable for the process lifetime. */
function commands(): Completion[] {
  commandOptions ??= Object.entries(latexDocumentation.commands).map(
    ([name, documentation]) => option(`\\${name}`, documentation, "command")
  )
  return commandOptions
}

function packages(): Completion[] {
  packageOptions ??= Object.entries(latexDocumentation.packages).map(
    ([name, documentation]) => option(name, documentation, "package")
  )
  return packageOptions
}

function documentClasses(): Completion[] {
  documentClassOptions ??= Object.entries(
    latexDocumentation.documentClasses
  ).map(([name, documentation]) => option(name, documentation, "class"))
  return documentClassOptions
}

/**
 * The catalog options for a completion context, or an empty list where the
 * catalog has nothing to say and the project index owns the answer.
 */
export function latexCatalogOptions(
  context: LatexCompletionContext
): Completion[] {
  switch (context.kind) {
    case "command":
      return commands()
    case "package":
      return packages()
    case "document-class":
      return documentClasses()
    case "environment":
    case "argument":
      return []
  }
}
