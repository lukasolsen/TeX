import {
  snippet,
  type Completion,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete"

import { latexCompletionContextAt } from "@/domain/latex-completion-context"
import { isLiteralPosition } from "@/domain/latex-syntax"
import { latexCatalogOptions } from "@/features/editor/latex-catalog-completion"
import { latexModelOf } from "@/features/editor/latex-model"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import type { LatexCompletionItem } from "@/domain/latex-completion"
import { requestLatexCompletions } from "@/services/project-service"

/**
 * Every kind a completion row can carry. The backend supplies the first six;
 * `package` and `class` come from the bundled catalog, which the project index
 * knows nothing about, and `entry` and `field` from the BibTeX catalog.
 */
const KIND_LABELS: Record<string, string> = {
  command: "Command",
  environment: "Environment",
  snippet: "Template",
  label: "Label",
  citation: "Citation",
  file: "File",
  package: "Package",
  class: "Document class",
  entry: "Entry type",
  field: "Field",
}

/** Plain-language name for a completion kind, or `null` for an unrecognized value. */
export function latexCompletionKindLabel(kind: string): string | null {
  return KIND_LABELS[kind] ?? null
}

const SVG_NS = "http://www.w3.org/2000/svg"

/**
 * A per-kind glyph in the VS Code style (lucide-consistent 24×24 strokes),
 * colored through the `--completion-icon-*` theme tokens via `currentColor`.
 */
const ICON_SHAPES: Record<
  string,
  ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>
> = {
  command: [["path", { d: "M9 5 15 19" }]],
  environment: [
    ["path", { d: "M9 4c-2 0-2 2-2 3.5S6 11 5 11c1 0 2 1 2 3.5S7 20 9 20" }],
    [
      "path",
      { d: "M15 4c2 0 2 2 2 3.5S18 11 19 11c-1 0-2 1-2 3.5S17 20 15 20" },
    ],
  ],
  snippet: [
    ["path", { d: "M9 8 5 12l4 4" }],
    ["path", { d: "M15 8l4 4-4 4" }],
  ],
  label: [
    [
      "path",
      { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6H12l8 6-8 6H4.5A1.5 1.5 0 0 1 3 16.5z" },
    ],
    [
      "circle",
      { cx: "7", cy: "12", r: "1.4", fill: "currentColor", stroke: "none" },
    ],
  ],
  citation: [
    ["path", { d: "M9 7C6.5 8 5 10 5 13v4h5v-6H7c0-2 1-3 3-3.6z" }],
    ["path", { d: "M19 7c-2.5 1-4 3-4 6v4h5v-6h-3c0-2 1-3 3-3.6z" }],
  ],
  file: [
    [
      "path",
      { d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" },
    ],
    ["path", { d: "M14 3v5h5" }],
    ["path", { d: "M9 13h6" }],
    ["path", { d: "M9 16h4" }],
  ],
  package: [
    ["path", { d: "M12 3 20 7.5v9L12 21l-8-4.5v-9z" }],
    ["path", { d: "M4 7.5 12 12l8-4.5" }],
    ["path", { d: "M12 12v9" }],
  ],
  class: [
    [
      "path",
      { d: "M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v13H6a2 2 0 0 1-2-2z" },
    ],
    ["path", { d: "M4 17.5A1.5 1.5 0 0 1 5.5 16H20" }],
    ["path", { d: "M9 8h7" }],
  ],
  entry: [
    ["path", { d: "M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H6a2 2 0 0 1-2-2z" }],
    ["path", { d: "M20 5.5A1.5 1.5 0 0 0 18.5 4H12v16h6a2 2 0 0 0 2-2z" }],
  ],
  field: [
    ["path", { d: "M4 6h6v12H4z" }],
    ["path", { d: "M13 8h7" }],
    ["path", { d: "M13 12h7" }],
    ["path", { d: "M13 16h4" }],
  ],
}

/**
 * The VS Code-style icon for a completion kind, or `null` for an unrecognized
 * value. The glyph is announced to assistive tech with the kind's plain name.
 */
export function latexCompletionKindIcon(kind: string): SVGSVGElement | null {
  const shapes = ICON_SHAPES[kind]
  if (shapes === undefined) return null
  const typed = kind
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
  for (const [tag, attrs] of shapes) {
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
      return item.source
        ? `Defined in ${item.source}`
        : "A file in this project"
  }
}

/**
 * A readable preview of a multi-line or placeholder insertion with `${name}`
 * markers reduced to their names; `null` when the insertion is a plain token.
 */
export function latexInsertionPreview(insertText: string): string | null {
  if (!insertText.includes("\n") && !insertText.includes("${")) return null
  return insertText.replaceAll(/\$\{([^}]*)\}/g, "$1")
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

/**
 * Project suggestions from the backend, merged with the bundled catalog.
 *
 * The two sources answer different questions and neither is allowed to block
 * the other: the backend knows the project's labels, citations, files, and
 * local macros; the catalog knows LaTeX itself. A failed or slow project
 * lookup still leaves the catalog, so typing `\\se` always offers something.
 */
export function latexCompletionSource(
  projectPath: () => CanonicalProjectPath,
  relativePath: () => ProjectRelativePath
): CompletionSource {
  return async (context): Promise<CompletionResult | null> => {
    const position = context.pos
    const content = context.state.doc.toString()
    const completing = latexCompletionContextAt(content, position)
    if (completing === null) return null
    // Suggesting LaTeX inside a listing or a \verb argument would be wrong;
    // the structural model is what knows the difference.
    if (isLiteralPosition(latexModelOf(context.state.doc), position))
      return null

    const catalog = latexCatalogOptions(completing)
    let project: Completion[] = []
    let from = completing.from
    try {
      const response = await requestLatexCompletions({
        projectPath: projectPath(),
        relativePath: relativePath(),
        content,
        position,
      })
      if (context.aborted) return null
      project = response.items.map(latexCompletionOption)
      const first = response.items[0]
      if (first !== undefined) from = first.from
    } catch {
      // The catalog alone is still a useful answer.
      if (context.aborted) return null
    }

    if (project.length === 0 && catalog.length === 0) return null
    // A project symbol and a catalog entry can share a label; the project one
    // is more specific, so it wins.
    const claimed = new Set(project.map((option) => option.label))
    return {
      from,
      options: [
        ...project,
        ...catalog.filter((option) => !claimed.has(option.label)),
      ],
      validFor: /^[A-Za-z@]*$/,
    }
  }
}
