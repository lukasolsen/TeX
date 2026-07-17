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
  const kind = document.createElement("span")
  kind.className = `tex-completion-kind tex-completion-kind-${item.kind}`
  kind.textContent = latexCompletionKindLabel(item.kind) ?? ""
  const provenance = document.createElement("span")
  provenance.className = "tex-completion-provenance"
  provenance.textContent = latexCompletionSourceSummary(item)
  meta.append(kind, provenance)

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
 * Adds a plain-language kind badge to each completion row so newcomers can tell a
 * command from an environment or a template without decoding an icon.
 */
export const latexCompletionRowBadge = {
  render(completion: Completion): Node | null {
    const label = latexCompletionKindLabel(completion.type ?? "")
    if (label === null) return null
    const badge = document.createElement("span")
    badge.className = `tex-completion-kind tex-completion-kind-${completion.type}`
    badge.textContent = label
    return badge
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
