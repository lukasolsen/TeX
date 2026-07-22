import type { Tooltip } from "@codemirror/view"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import {
  latexCommands,
  latexFileReferencesFromCommands,
  type LatexCommand,
  type LatexFileReference,
} from "@/domain/latex"
import {
  commandDocumentation,
  documentClassDocumentation,
  packageDocumentation,
  type LatexDocumentation,
} from "@/features/editor/latex-documentation"
import {
  projectErrorFromUnknown,
  readProjectSource,
} from "@/services/project-service"
import { latexOccurrenceAt, parseLatexDocument } from "@/domain/latex-syntax"
import { latexSymbolDocumentation } from "@/features/editor/latex-symbol-hover"
import { requestLatexSymbol } from "@/services/latex-analysis-service"

/** Roles whose hover is answered by the project index rather than the catalog. */
const CROSS_REFERENCE_ROLES = new Set([
  "label-reference",
  "label-definition",
  "citation-reference",
  "citation-definition",
])

/** The 1-based line and UTF-16 column of `offset` in `source`. */
function positionIn(
  source: string,
  offset: number
): { line: number; column: number } {
  let line = 1
  let lineStart = 0
  for (let index = source.indexOf("\n"); index !== -1 && index < offset;) {
    line += 1
    lineStart = index + 1
    index = source.indexOf("\n", index + 1)
  }
  return { line, column: offset - lineStart + 1 }
}

type HoverDocumentation = {
  from: number
  to: number
  documentation: LatexDocumentation
}

export function referencedFileAt(
  source: string,
  sourcePath: ProjectRelativePath,
  position: number
): LatexFileReference | null {
  return referenceAt(latexCommands(source), sourcePath, position)
}

export function keywordAt(
  source: string,
  position: number
): HoverDocumentation | null {
  return keywordFromCommands(latexCommands(source), position)
}

function keywordFromCommands(
  commands: readonly LatexCommand[],
  position: number
): HoverDocumentation | null {
  const command = commands.find(
    ({ from, to, name }) =>
      position >= from &&
      position <= to &&
      commandDocumentation(name) !== undefined
  )
  if (command === undefined) return null
  const documentation = commandDocumentation(command.name)
  return documentation === undefined
    ? null
    : { from: command.from, to: command.to, documentation }
}

function classOrPackageAt(
  commands: readonly LatexCommand[],
  position: number
): HoverDocumentation | null {
  for (const command of commands) {
    if (command.name !== "documentclass" && command.name !== "usepackage") {
      continue
    }
    const group = command.groups.find(({ kind }) => kind === "required")
    if (group === undefined) continue
    let offset = 0
    for (const rawValue of group.value.split(",")) {
      const leadingWhitespace = rawValue.length - rawValue.trimStart().length
      const name = rawValue.trim()
      const from = group.from + offset + leadingWhitespace
      const to = from + name.length
      offset += rawValue.length + 1
      if (name === "" || position < from || position >= to) continue
      const documentation =
        command.name === "documentclass"
          ? documentClassDocumentation(name)
          : packageDocumentation(name)
      if (documentation !== undefined) return { from, to, documentation }
      const kind =
        command.name === "documentclass" ? "Document class" : "LaTeX package"
      return {
        from,
        to,
        documentation: {
          title: name,
          markdown: `${kind} name. It is resolved by your configured TeX distribution when the project builds.`,
        },
      }
    }
  }
  return null
}

function referenceAt(
  commands: readonly LatexCommand[],
  sourcePath: ProjectRelativePath,
  position: number
): LatexFileReference | null {
  return (
    latexFileReferencesFromCommands(commands, sourcePath).find(
      ({ from, to }) => position >= from && position < to
    ) ?? null
  )
}

function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const pattern =
    /(\[([^\]]+)\]\((https:[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    parent.append(document.createTextNode(text.slice(cursor, index)))
    if (match[2] !== undefined && match[3] !== undefined) {
      const url = httpsUrl(match[3])
      if (url === null) {
        parent.append(document.createTextNode(match[0]))
      } else {
        const link = document.createElement("a")
        link.href = url.href
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.textContent = match[2]
        parent.append(link)
      }
    } else if (match[4] !== undefined) {
      const strong = document.createElement("strong")
      strong.textContent = match[4]
      parent.append(strong)
    } else if (match[5] !== undefined) {
      const emphasis = document.createElement("em")
      emphasis.textContent = match[5]
      parent.append(emphasis)
    } else if (match[6] !== undefined) {
      const code = document.createElement("code")
      code.textContent = match[6]
      parent.append(code)
    }
    cursor = index + match[0].length
  }
  parent.append(document.createTextNode(text.slice(cursor)))
}

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function fencedCode(content: string, language: string): string {
  const longestFence = [...content.matchAll(/^`+/gm)].reduce(
    (longest, match) => Math.max(longest, match[0].length),
    2
  )
  const fence = "`".repeat(longestFence + 1)
  return `${fence}${language}\n${content}\n${fence}`
}

function appendParagraph(article: HTMLElement, lines: string[]): void {
  const paragraph = document.createElement("p")
  appendInlineMarkdown(paragraph, lines.join(" "))
  article.append(paragraph)
}

/** Renders the deliberately limited bundled Markdown subset without HTML parsing. */
export function renderMarkdownDocumentation(
  title: string,
  markdown: string
): HTMLElement {
  const article = document.createElement("article")
  article.className = "tex-hover-card"
  const heading = document.createElement("h2")
  heading.textContent = title
  heading.style.fontSize = "1.2em"
  heading.style.fontWeight = "bold"
  heading.style.marginBottom = "0.5em"
  article.append(heading)

  const lines = markdown.split("\n")
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? ""
    if (line.trim() === "") {
      index += 1
      continue
    }
    const fenceMatch = /^(`{3,})/.exec(line)
    if (fenceMatch !== null) {
      const fence = fenceMatch[1] ?? "```"
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? "").startsWith(fence)) {
        codeLines.push(lines[index] ?? "")
        index += 1
      }
      if (index < lines.length) index += 1
      const pre = document.createElement("pre")
      const code = document.createElement("code")
      code.textContent = codeLines.join("\n")
      pre.append(code)
      article.append(pre)
      continue
    }
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line)
    if (headingMatch !== null) {
      const markers = headingMatch[1] ?? "#"
      const content = headingMatch[2] ?? ""
      const subheading = document.createElement(
        `h${Math.min(6, markers.length + 2)}`
      )
      appendInlineMarkdown(subheading, content)
      article.append(subheading)
      index += 1
      continue
    }
    const listMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(line)
    if (listMatch !== null) {
      const ordered = /\d+\./.test(listMatch[1] ?? "")
      const list = document.createElement(ordered ? "ol" : "ul")
      while (index < lines.length) {
        const itemLine = lines[index] ?? ""
        const itemMatch = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(itemLine)
        if (itemMatch === null || /\d+\./.test(itemLine) !== ordered) break
        const item = document.createElement("li")
        appendInlineMarkdown(item, itemMatch[1] ?? "")
        list.append(item)
        index += 1
      }
      article.append(list)
      continue
    }
    const paragraphLines = [line]
    index += 1
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !/^`{3,}/.test(lines[index] ?? "") &&
      !/^(#{1,6})\s+|^([-*]|\d+\.)\s+/.test(lines[index] ?? "")
    ) {
      paragraphLines.push(lines[index] ?? "")
      index += 1
    }
    appendParagraph(article, paragraphLines)
  }
  return article
}

/** Provides editor-local documentation and project-file previews without modifying source text. */
export function latexHoverTooltip(
  projectPath: CanonicalProjectPath,
  sourcePath: ProjectRelativePath
) {
  return async (
    view: { state: { doc: { toString(): string } } },
    position: number
  ): Promise<Tooltip | null> => {
    const source = view.state.doc.toString()

    const occurrence = latexOccurrenceAt(
      parseLatexDocument(source, sourcePath),
      position
    )
    if (occurrence !== null && CROSS_REFERENCE_ROLES.has(occurrence.role)) {
      try {
        const symbol = await requestLatexSymbol({
          projectPath,
          relativePath: sourcePath,
          content: source,
          ...positionIn(source, occurrence.from),
        })
        const documentation =
          symbol === null ? null : latexSymbolDocumentation(symbol)
        if (documentation !== null) {
          return {
            pos: occurrence.from,
            end: occurrence.to,
            create: () => ({
              dom: renderMarkdownDocumentation(
                documentation.title,
                documentation.markdown
              ),
            }),
          }
        }
      } catch {
        // A failed lookup falls through to the local documentation below
        // rather than replacing a working tooltip with an error.
      }
    }

    const commands = latexCommands(source)
    const reference = referenceAt(commands, sourcePath, position)
    if (reference !== null) {
      if (
        !reference.path.endsWith(".tex") &&
        !reference.path.endsWith(".bib")
      ) {
        return {
          pos: reference.from,
          end: reference.to,
          create: () => ({
            dom: renderMarkdownDocumentation(
              reference.path,
              `Referenced by \\${reference.command}. This asset is not a text source that TeX can preview.`
            ),
          }),
        }
      }
      try {
        const document = await readProjectSource(projectPath, reference.path)
        const excerpt = document.content.split("\n").slice(0, 28).join("\n")
        return {
          pos: reference.from,
          end: reference.to,
          create: () => ({
            dom: renderMarkdownDocumentation(
              document.path,
              `${document.byteLength.toLocaleString()} bytes · referenced by \\${reference.command} · Ctrl/⌘-click to open\n\n${fencedCode(excerpt, "latex")}\n\nThis is a preview only. Edit the referenced file from the project tree or by opening it in the editor.`
            ),
          }),
        }
      } catch (error: unknown) {
        return {
          pos: reference.from,
          end: reference.to,
          create: () => ({
            dom: renderMarkdownDocumentation(
              reference.path,
              projectErrorFromUnknown(error).message
            ),
          }),
        }
      }
    }

    const classOrPackage = classOrPackageAt(commands, position)
    if (classOrPackage !== null) {
      return {
        pos: classOrPackage.from,
        end: classOrPackage.to,
        create: () => ({
          dom: renderMarkdownDocumentation(
            classOrPackage.documentation.title,
            classOrPackage.documentation.markdown
          ),
        }),
      }
    }

    const keyword = keywordFromCommands(commands, position)
    if (keyword === null) return null
    return {
      pos: keyword.from,
      end: keyword.to,
      create: () => ({
        dom: renderMarkdownDocumentation(
          keyword.documentation.title,
          keyword.documentation.markdown
        ),
      }),
    }
  }
}
