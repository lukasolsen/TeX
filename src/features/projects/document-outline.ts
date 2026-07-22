import { parseLatexDocument, SECTION_LEVELS } from "@/domain/latex-syntax"

export type DocumentOutlineItem = Readonly<{
  command: string
  level: number
  line: number
  title: string
}>

/**
 * Reduces a heading's LaTeX source to the text a reader would see, so the
 * outline shows `An important result` rather than `An \textbf{important}
 * result`. Markup that carries no visible text is dropped; nothing is
 * interpreted, because an outline entry is a label, not a rendering.
 */
function visibleTitle(value: string): string {
  return value
    .replace(
      /\\(?:texorpdfstring|emph|textbf|textit|texttt)\s*\{([^{}]*)\}(?:\{[^{}]*\})?/g,
      "$1"
    )
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z@]+\*?/g, "")
    .replace(/\\([%#&_{}])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The navigable sectioning commands of a document, in source order.
 *
 * Headings come from the shared structural model, so the outline agrees with
 * folding about where a section begins, and neither is fooled by a heading
 * written inside a comment, a listing, or a `\verb` argument.
 */
export function documentOutline(content: string): DocumentOutlineItem[] {
  const model = parseLatexDocument(content)
  const lineStarts = [0]
  for (let index = content.indexOf("\n"); index !== -1;) {
    lineStarts.push(index + 1)
    index = content.indexOf("\n", index + 1)
  }

  const items: DocumentOutlineItem[] = []
  let line = 1
  for (const occurrence of model.occurrences) {
    if (occurrence.role !== "section") continue
    // Occurrences are ordered by position, so the line scan never rewinds.
    while (
      line < lineStarts.length &&
      (lineStarts[line] ?? Number.POSITIVE_INFINITY) <= occurrence.from
    ) {
      line += 1
    }
    const title = visibleTitle(occurrence.name)
    if (title === "") continue
    items.push({
      command: occurrence.command,
      level: SECTION_LEVELS.get(occurrence.command) ?? 2,
      line,
      title,
    })
  }
  return items
}
