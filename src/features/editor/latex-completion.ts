import {
  snippet,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import type { LatexCompletionItem } from "@/domain/latex-completion"
import { requestLatexCompletions } from "@/services/project-service"

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
  return /\\[A-Za-z@]*$/.test(before) || /\\(?:begin|end)\{[A-Za-z@]*$/.test(before)
}

function option(item: LatexCompletionItem, rank: number) {
  return {
    label: item.label,
    detail: `${item.provenance} · ${item.detail}`,
    type: item.kind === "environment" ? "class" : "keyword",
    boost: 64 - rank,
    apply: item.insertText.includes("${")
      ? snippet(item.insertText)
      : item.insertText,
    info: () => {
      const detail = document.createElement("div")
      detail.className = "tex-completion-info"
      const source = document.createElement("span")
      source.className = "tex-completion-source"
      source.textContent = item.provenance
      const description = document.createElement("p")
      description.textContent = item.detail
      detail.append(source, description)
      return detail
    },
  }
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
      options: response.items.map(option),
      validFor: /[A-Za-z@]*/,
    }
  }
}
