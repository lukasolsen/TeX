import { StateEffect, type Extension } from "@codemirror/state"
import {
  Decoration,
  EditorView,
  type DecorationSet,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view"

import {
  latexCommands,
  latexFileReferences,
  type LatexGroup,
} from "@/domain/latex"
import type { ProjectRelativePath } from "@/domain/identifiers"

export type LatexSemanticContext = Readonly<{
  sourcePath: ProjectRelativePath
  projectFiles: ReadonlySet<ProjectRelativePath>
}>

export type LatexSemanticToken = Readonly<{
  from: number
  to: number
  className: string
}>

const referenceCommands = new Set([
  "ref",
  "pageref",
  "eqref",
  "autoref",
  "cref",
  "Cref",
  "vref",
  "nameref",
])
const citationCommands = new Set([
  "cite",
  "citep",
  "citet",
  "autocite",
  "parencite",
  "textcite",
  "footcite",
  "nocite",
])
const headingCommands = new Set([
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
  "title",
])
const urlCommands = new Set(["url", "href", "path"])

function requiredGroup(
  groups: LatexGroup[],
  index = 0
): LatexGroup | undefined {
  return groups.filter(({ kind }) => kind === "required")[index]
}

function groupValueTokens(
  group: LatexGroup,
  className: string
): LatexSemanticToken[] {
  const tokens: LatexSemanticToken[] = []
  let offset = 0
  for (const rawValue of group.value.split(",")) {
    const leading = rawValue.length - rawValue.trimStart().length
    const value = rawValue.trim()
    if (value !== "") {
      const from = group.from + offset + leading
      tokens.push({ from, to: from + value.length, className })
    }
    offset += rawValue.length + 1
  }
  return tokens
}

function projectContainsReference(
  projectFiles: ReadonlySet<ProjectRelativePath>,
  path: ProjectRelativePath
): boolean {
  if (projectFiles.has(path)) return true
  return (
    !path.includes(".") &&
    [...projectFiles].some((file) => file.startsWith(`${path}.`))
  )
}

/** Adds meaning that the stream parser cannot infer from generic brace groups. */
export function latexSemanticTokens(
  source: string,
  context: LatexSemanticContext
): LatexSemanticToken[] {
  const tokens: LatexSemanticToken[] = []

  for (const command of latexCommands(source)) {
    for (const group of command.groups) {
      if (group.kind === "optional" && group.from < group.to) {
        tokens.push({
          from: group.from,
          to: group.to,
          className: "cm-latex-option",
        })
      }
    }

    const first = requiredGroup(command.groups)
    if (first === undefined) continue
    if (command.name === "begin" || command.name === "end") {
      tokens.push(...groupValueTokens(first, "cm-latex-environment"))
    } else if (command.name === "label") {
      tokens.push(...groupValueTokens(first, "cm-latex-label-definition"))
    } else if (referenceCommands.has(command.name)) {
      tokens.push(...groupValueTokens(first, "cm-latex-label-reference"))
    } else if (citationCommands.has(command.name)) {
      tokens.push(...groupValueTokens(first, "cm-latex-citation"))
    } else if (
      command.name === "documentclass" ||
      command.name === "usepackage"
    ) {
      tokens.push(...groupValueTokens(first, "cm-latex-package"))
    } else if (headingCommands.has(command.name)) {
      tokens.push({
        from: first.from,
        to: first.to,
        className: "cm-latex-heading",
      })
    } else if (urlCommands.has(command.name)) {
      const urlGroup =
        command.name === "href" ? first : requiredGroup(command.groups)
      if (urlGroup !== undefined) {
        tokens.push({
          from: urlGroup.from,
          to: urlGroup.to,
          className: "cm-latex-url",
        })
      }
    }
  }

  for (const reference of latexFileReferences(source, context.sourcePath)) {
    const exists = projectContainsReference(
      context.projectFiles,
      reference.path
    )
    tokens.push({
      from: reference.from,
      to: reference.to,
      className: exists
        ? "cm-latex-file-reference"
        : "cm-latex-file-reference cm-latex-file-missing",
    })
  }

  return tokens
    .filter(({ from, to }) => from < to)
    .toSorted((left, right) => left.from - right.from || left.to - right.to)
}

export const setLatexSemanticContext =
  StateEffect.define<LatexSemanticContext>()

function visibleDecorations(
  view: EditorView,
  context: LatexSemanticContext
): DecorationSet {
  const ranges: Array<ReturnType<Decoration["range"]>> = []
  const seen = new Set<string>()
  for (const viewport of view.visibleRanges) {
    const from = view.state.doc.lineAt(Math.max(0, viewport.from - 2_048)).from
    const to = view.state.doc.lineAt(
      Math.min(view.state.doc.length, viewport.to + 2_048)
    ).to
    const source = view.state.doc.sliceString(from, to)
    for (const token of latexSemanticTokens(source, context)) {
      const tokenFrom = from + token.from
      const tokenTo = from + token.to
      if (tokenTo < viewport.from || tokenFrom > viewport.to) continue
      const key = `${tokenFrom}:${tokenTo}:${token.className}`
      if (seen.has(key)) continue
      seen.add(key)
      ranges.push(
        Decoration.mark({ class: token.className }).range(tokenFrom, tokenTo)
      )
    }
  }
  ranges.sort((left, right) => left.from - right.from || left.to - right.to)
  return Decoration.set(ranges)
}

export function latexSemanticHighlighting(
  initialContext: LatexSemanticContext
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      private context = initialContext

      constructor(view: EditorView) {
        this.decorations = visibleDecorations(view, this.context)
      }

      update(update: ViewUpdate) {
        let contextChanged = false
        for (const transaction of update.transactions) {
          for (const effect of transaction.effects) {
            if (effect.is(setLatexSemanticContext)) {
              this.context = effect.value
              contextChanged = true
            }
          }
        }
        if (update.docChanged || update.viewportChanged || contextChanged) {
          this.decorations = visibleDecorations(update.view, this.context)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
