/**
 * Hover documentation for a cross-reference.
 *
 * Hovering `\ref{sec:method}` should answer the question the author actually
 * has — what is that, and where does it live — rather than restate that `\ref`
 * references a label. The answer comes from the project index, so it is the
 * same source of truth the diagnostics and the definition jump use.
 */

import type { LatexSymbolInfo } from "@/domain/latex-analysis"

/** How many uses are listed before the rest are summarised. */
const MAX_LISTED_REFERENCES = 5

function escapeInline(text: string): string {
  // The renderer treats backticks and asterisks as markup; a source line is
  // literal text and must not be reinterpreted as emphasis.
  return text.replaceAll(/([`*[\]])/g, "\\$1")
}

/**
 * The hover card for a resolved symbol, as a title and the limited Markdown
 * subset `renderMarkdownDocumentation` understands.
 *
 * Returns `null` for a symbol the project does not define, because the
 * diagnostic on that span already says so and a second, quieter statement of
 * the same fact adds nothing.
 */
export function latexSymbolDocumentation(
  symbol: LatexSymbolInfo
): { title: string; markdown: string } | null {
  const definition = symbol.definitions[0]
  if (definition === undefined) return null

  const kind = symbol.kind === "citation" ? "Bibliography entry" : "Label"
  const lines: string[] = [
    `${kind} defined in \`${escapeInline(definition.path)}\` on line ${definition.span.line}.`,
  ]

  if (definition.preview !== "") {
    lines.push("", "```latex", definition.preview, "```")
  }

  if (symbol.definitions.length > 1) {
    lines.push(
      "",
      `Defined in ${symbol.definitions.length} places, so references resolve to only one of them.`
    )
  }

  const elsewhere = symbol.references.filter(
    (reference) =>
      reference.path !== definition.path ||
      reference.span.line !== definition.span.line
  )
  if (elsewhere.length > 0) {
    lines.push(
      "",
      `Used ${elsewhere.length === 1 ? "once" : `${elsewhere.length} times`}:`
    )
    for (const reference of elsewhere.slice(0, MAX_LISTED_REFERENCES)) {
      lines.push(
        `- \`${escapeInline(reference.path)}\` line ${reference.span.line}`
      )
    }
    if (elsewhere.length > MAX_LISTED_REFERENCES) {
      lines.push(`- and ${elsewhere.length - MAX_LISTED_REFERENCES} more`)
    }
  }

  lines.push("", "Ctrl/⌘-click or press Ctrl/⌘-Enter to open the definition.")

  return { title: symbol.name, markdown: lines.join("\n") }
}
