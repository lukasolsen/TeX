import {
  snippet,
  type Completion,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import type {
  LatexCompletionItem,
  LatexCompletionKind,
} from "@/domain/latex-completion"
import { requestLatexCompletions } from "@/services/project-service"

const KIND_LABELS: Record<LatexCompletionKind, string> = {
  command: "Command",
  environment: "Environment",
  snippet: "Template",
  label: "Label",
  citation: "Citation",
  file: "File",
}

function isEscaped(source: string, position: number): boolean {
  let slashes = 0
  for (let index = position - 1; index >= 0 && source[index] === "\\"; index -= 1) {
    slashes += 1
  }
  return slashes % 2 === 1
}

export function isLatexCompletionContext(source: string, position: number): boolean {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1
  for (let index = lineStart; index < position; index += 1) {
    if (source[index] === "%" && !isEscaped(source, index)) return false
  }
  const before = source.slice(lineStart, position)
  return (
    // A command prefix being typed, e.g. `\sec`.
    /\\[A-Za-z@]*$/.test(before) ||
    // The environment name inside `\begin{…}` / `\end{…}`.
    /\\(?:begin|end)\{[A-Za-z@]*$/.test(before) ||
    // The cursor inside a command's mandatory argument (tolerating one optional
    // `[…]` group), e.g. `\ref{sec`, `\cite{a, b`, `\includegraphics[w]{fi`.
    // Mirrors the backend's `completion_context` Argument detection so argument
    // completions actually reach the command.
    /\\[A-Za-z@]+(?:\[[^\]]*\])?\{[^{}]*$/.test(before)
  )
}

/** Plain-language name for a completion kind, or `null` for an unrecognized value. */
export function latexCompletionKindLabel(kind: string): string | null {
  return Object.hasOwn(KIND_LABELS, kind)
    ? KIND_LABELS[kind as LatexCompletionKind]
    : null
}

const SVG_NS = "http://www.w3.org/2000/svg"

/**
 * A per-kind glyph in the VS Code style (lucide-consistent 24×24 strokes),
 * colored through the `--completion-icon-*` theme tokens via `currentColor`.
 */
const ICON_SHAPES: Record<
  LatexCompletionKind,
  ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>
> = {
  command: [["path", { d: "M9 5 15 19" }]],
  environment: [
    ["path", { d: "M9 4c-2 0-2 2-2 3.5S6 11 5 11c1 0 2 1 2 3.5S7 20 9 20" }],
    ["path", { d: "M15 4c2 0 2 2 2 3.5S18 11 19 11c-1 0-2 1-2 3.5S17 20 15 20" }],
  ],
  snippet: [
    ["path", { d: "M9 8 5 12l4 4" }],
    ["path", { d: "M15 8l4 4-4 4" }],
  ],
  label: [
    ["path", { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6H12l8 6-8 6H4.5A1.5 1.5 0 0 1 3 16.5z" }],
    ["circle", { cx: "7", cy: "12", r: "1.4", fill: "currentColor", stroke: "none" }],
  ],
  citation: [
    ["path", { d: "M9 7C6.5 8 5 10 5 13v4h5v-6H7c0-2 1-3 3-3.6z" }],
    ["path", { d: "M19 7c-2.5 1-4 3-4 6v4h5v-6h-3c0-2 1-3 3-3.6z" }],
  ],
  file: [
    ["path", { d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" }],
    ["path", { d: "M14 3v5h5" }],
    ["path", { d: "M9 13h6" }],
    ["path", { d: "M9 16h4" }],
  ],
}

/**
 * The VS Code-style icon for a completion kind, or `null` for an unrecognized
 * value. The glyph is announced to assistive tech with the kind's plain name.
 */
export function latexCompletionKindIcon(kind: string): SVGSVGElement | null {
  if (!Object.hasOwn(ICON_SHAPES, kind)) return null
  const typed = kind as LatexCompletionKind
  const label = latexCompletionKindLabel(typed) ?? typed
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("class", `tex-completion-icon tex-completion-icon-${typed}`)
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", label)
  const title = document.createElementNS(SVG_NS, "title")
  title.textContent = label
  svg.append(title)
  for (const [tag, attrs] of ICON_SHAPES[typed]) {
    const shape = document.createElementNS(SVG_NS, tag)
    for (const [name, value] of Object.entries(attrs)) {
      shape.setAttribute(name, value)
    }
    svg.append(shape)
  }
  return svg
}

/** A sentence explaining where a suggestion comes from, avoiding LaTeX jargon. */
export function latexCompletionSourceSummary(
  item: Pick<LatexCompletionItem, "provenance" | "requires"> & {
    readonly source?: string | null
  }
): string {
  switch (item.provenance) {
    case "local":
      return "Defined in this project"
    case "package":
      return item.requires
        ? `Provided by the ${item.requires} package`
        : "Provided by a loaded package"
    case "core":
      return "Built into LaTeX"
    case "project":
      return item.source ? `Defined in ${item.source}` : "A file in this project"
  }
}

/**
 * A readable preview of a multi-line or placeholder insertion with `${name}`
 * markers reduced to their names; `null` when the insertion is a plain token.
 */
export function latexInsertionPreview(insertText: string): string | null {
  if (!insertText.includes("\n") && !insertText.includes("${")) return null
  return insertText.replace(/\$\{([^}]*)\}/g, "$1")
}

function renderInfo(item: LatexCompletionItem): Node {
  const card = document.createElement("div")
  card.className = "tex-completion-info"

  const meta = document.createElement("div")
  meta.className = "tex-completion-meta"
  const icon = latexCompletionKindIcon(item.kind)
  const provenance = document.createElement("span")
  provenance.className = "tex-completion-provenance"
  provenance.textContent = latexCompletionSourceSummary(item)
  if (icon) meta.append(icon, provenance)
  else meta.append(provenance)

  const description = document.createElement("p")
  description.className = "tex-completion-description"
  description.textContent = item.detail
  card.append(meta, description)

  const preview = latexInsertionPreview(item.insertText)
  if (preview !== null) {
    const label = document.createElement("p")
    label.className = "tex-completion-preview-label"
    label.textContent = "Inserts"
    const block = document.createElement("pre")
    block.className = "tex-completion-preview"
    block.textContent = preview
    card.append(label, block)
  }

  const hint = document.createElement("p")
  hint.className = "tex-completion-hint"
  hint.textContent = "Press Enter to insert"
  card.append(hint)

  return card
}

/** Maps a backend completion item to a CodeMirror option, preserving backend order. */
export function latexCompletionOption(
  item: LatexCompletionItem,
  rank: number
): Completion {
  return {
    label: item.label,
    detail: item.detail,
    type: item.kind,
    boost: 99 - rank,
    apply: item.insertText.includes("${")
      ? snippet(item.insertText)
      : item.insertText,
    info: () => renderInfo(item),
  }
}

/**
 * Leads each completion row with a per-kind icon in the VS Code style, so the
 * kind reads at a glance; the glyph is labelled for assistive tech.
 */
export const latexCompletionRowBadge = {
  render(completion: Completion): Node | null {
    return latexCompletionKindIcon(completion.type ?? "")
  },
  position: 10,
}

export function latexCompletionSource(
  projectPath: () => CanonicalProjectPath,
  relativePath: () => ProjectRelativePath
): CompletionSource {
  return async (context): Promise<CompletionResult | null> => {
    const position = context.pos
    const content = context.state.doc.toString()
    if (!isLatexCompletionContext(content, position)) return null
    const response = await requestLatexCompletions({
      projectPath: projectPath(),
      relativePath: relativePath(),
      content,
      position,
    })
    if (context.aborted || response.items.length === 0) return null
    const first = response.items[0]
    if (first === undefined) return null
    return {
      from: first.from,
      options: response.items.map(latexCompletionOption),
      validFor: /[A-Za-z@]*/,
    }
  }
}
