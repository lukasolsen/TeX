import type { Tooltip } from "@codemirror/view"

import type { CanonicalProjectPath, ProjectRelativePath } from "@/domain/identifiers"

import {
  latexCommands,
  latexFileReferenceAt,
  type LatexFileReference,
} from "@/domain/latex"
import {
  projectErrorFromUnknown,
  readProjectSource,
} from "@/services/project-service"

type KeywordInfo = {
  title: string
  summary: string
  example: string
  caution: string
}

const keywordInfo: Record<string, KeywordInfo> = {
  documentclass: {
    title: "\\documentclass",
    summary:
      "Chooses the document class, which controls the overall structure and default typography.",
    example: "\\documentclass[12pt,a4paper]{article}",
    caution:
      "Use one document class, before \\begin{document}. Do not load a class with \\usepackage.",
  },
  usepackage: {
    title: "\\usepackage",
    summary:
      "Loads a package and makes its commands and environments available to the document.",
    example: "\\usepackage{graphicx}",
    caution:
      "Load packages in the preamble. Do not repeat a package unless its documentation says it is safe.",
  },
  begin: {
    title: "\\begin",
    summary: "Starts a named environment, such as a list, figure, or equation.",
    example: "\\begin{itemize}\n  \\item First point\n\\end{itemize}",
    caution:
      "Every \\begin{name} needs a matching \\end{name}; nesting must close in reverse order.",
  },
  end: {
    title: "\\end",
    summary: "Closes the most recently opened matching environment.",
    example: "\\begin{equation}\n  E = mc^2\n\\end{equation}",
    caution:
      "The environment name must match exactly. Closing a different environment causes a compile error.",
  },
  chapter: {
    title: "\\chapter",
    summary:
      "Creates a numbered chapter heading in classes that support chapters, such as book or report.",
    example: "\\chapter{Method}",
    caution: "The article class has no chapters; use \\section there instead.",
  },
  section: {
    title: "\\section",
    summary:
      "Creates a numbered section heading and adds it to the table of contents when enabled.",
    example: "\\section{Introduction}",
    caution:
      "Keep heading levels in order. Do not jump from \\section straight to \\subsubsection without a reason.",
  },
  subsection: {
    title: "\\subsection",
    summary: "Creates a numbered subsection beneath the current section.",
    example: "\\subsection{Data collection}",
    caution:
      "Use it for real structure, not for visual spacing. Prefer paragraphs for short divisions.",
  },
  title: {
    title: "\\title",
    summary: "Sets the title text that \\maketitle renders later.",
    example: "\\title{A clear research title}",
    caution:
      "Put it in the preamble and call \\maketitle only after \\begin{document}.",
  },
  author: {
    title: "\\author",
    summary: "Sets the author information used by \\maketitle.",
    example: "\\author{Ada Lovelace}",
    caution:
      "This does not print by itself; the document must use \\maketitle.",
  },
  date: {
    title: "\\date",
    summary: "Sets the date used by \\maketitle.",
    example: "\\date{\\today}",
    caution: "Use \\date{} to intentionally omit the date.",
  },
  maketitle: {
    title: "\\maketitle",
    summary:
      "Renders the title block from the title, author, and date metadata.",
    example: "\\begin{document}\n\\maketitle",
    caution:
      "Call it once near the start of the document, not in the preamble.",
  },
  label: {
    title: "\\label",
    summary: "Creates a stable name that other commands can reference.",
    example: "\\section{Results}\\label{sec:results}",
    caution:
      "Place it after the heading or caption it labels. Labels must be unique; use prefixes such as sec:, fig:, and eq:.",
  },
  ref: {
    title: "\\ref",
    summary: "Inserts the number associated with a matching \\label.",
    example: "See Section~\\ref{sec:results}.",
    caution:
      "Compile twice after adding or moving labels so LaTeX can resolve the reference.",
  },
  cite: {
    title: "\\cite",
    summary: "Inserts a citation for a bibliography entry.",
    example: "As shown by \\cite{knuth1984}. ",
    caution:
      "The citation key must exist in a configured bibliography file; the exact output style depends on your bibliography package.",
  },
  item: {
    title: "\\item",
    summary: "Adds one entry to a list environment.",
    example: "\\begin{enumerate}\n  \\item First step\n\\end{enumerate}",
    caution:
      "Use it only inside a list-like environment such as itemize, enumerate, or description.",
  },
  input: {
    title: "\\input",
    summary:
      "Inserts another source file at this exact location, keeping large documents split into focused files.",
    example: "\\input{chapters/introduction}",
    caution:
      "The path is relative to this file. Do not include a second document preamble in an input file.",
  },
  include: {
    title: "\\include",
    summary:
      "Includes another source file on a new page and supports \\includeonly workflows.",
    example: "\\include{chapters/method}",
    caution:
      "Use \\input for small inline parts. Do not put \\include inside another included file.",
  },
  subfile: {
    title: "\\subfile",
    summary:
      "Includes a child document when the project uses the subfiles package.",
    example: "\\subfile{chapters/introduction}",
    caution:
      "This requires \\usepackage{subfiles}; the child file needs its own compatible preamble.",
  },
  bibliography: {
    title: "\\bibliography",
    summary: "Selects BibTeX bibliography files for the document.",
    example: "\\bibliography{references}",
    caution:
      "Use this with a BibTeX workflow. Do not mix it with biblatex's \\addbibresource.",
  },
  addbibresource: {
    title: "\\addbibresource",
    summary: "Registers a bibliography file when using biblatex.",
    example: "\\addbibresource{references.bib}",
    caution:
      "Use this in the preamble with biblatex, then print it with \\printbibliography—not \\bibliography.",
  },
  includegraphics: {
    title: "\\includegraphics",
    summary:
      "Places an image asset; the graphicx package provides this command.",
    example: "\\includegraphics[width=0.8\\linewidth]{figures/result.pdf}",
    caution:
      "Load graphicx first and keep image paths relative to the source file. A missing asset stops the build.",
  },
}

export function referencedFileAt(
  source: string,
  sourcePath: ProjectRelativePath,
  position: number
): LatexFileReference | null {
  return latexFileReferenceAt(source, sourcePath, position)
}

export function keywordAt(
  source: string,
  position: number
): { from: number; to: number; info: KeywordInfo } | null {
  const command = latexCommands(source).find(
    ({ from, to, name }) =>
      position >= from && position <= to && keywordInfo[name] !== undefined
  )
  if (command === undefined) return null
  const info = keywordInfo[command.name]
  return info === undefined
    ? null
    : { from: command.from, to: command.to, info }
}

function classOrPackageAt(
  source: string,
  position: number
): { from: number; to: number; title: string; description: string } | null {
  for (const command of latexCommands(source)) {
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
      if (name !== "" && position >= from && position < to) {
        const isClass = command.name === "documentclass"
        return {
          from,
          to,
          title: name,
          description: isClass
            ? "Document class name. It is resolved by your configured TeX distribution when the project builds."
            : "LaTeX package name. It is resolved by your configured TeX distribution when the project builds.",
        }
      }
    }
  }
  return null
}

function card(
  title: string,
  summary: string,
  example?: string,
  caution?: string
): HTMLElement {
  const dom = document.createElement("article")
  dom.className = "tex-hover-card"
  const heading = document.createElement("strong")
  heading.textContent = title
  const description = document.createElement("p")
  description.textContent = summary
  dom.append(heading, description)
  if (example !== undefined) {
    const exampleLabel = document.createElement("span")
    exampleLabel.className = "tex-hover-card-label"
    exampleLabel.textContent = "Example"
    const preview = document.createElement("pre")
    preview.textContent = example
    dom.append(exampleLabel, preview)
  }
  if (caution !== undefined) {
    const cautionLabel = document.createElement("span")
    cautionLabel.className = "tex-hover-card-label"
    cautionLabel.textContent = "Watch for"
    const cautionText = document.createElement("p")
    cautionText.className = "tex-hover-card-caution"
    cautionText.textContent = caution
    dom.append(cautionLabel, cautionText)
  }
  return dom
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
    const reference = referencedFileAt(source, sourcePath, position)
    if (reference !== null) {
      if (
        !reference.path.endsWith(".tex") &&
        !reference.path.endsWith(".bib")
      ) {
        return {
          pos: reference.from,
          end: reference.to,
          create: () => ({
            dom: card(
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
            dom: card(
              document.path,
              `${document.byteLength.toLocaleString()} bytes · referenced by \\${reference.command} · Ctrl/⌘-click to open`,
              excerpt,
              "This is a preview only. Edit the referenced file from the project tree or by opening it in the editor."
            ),
          }),
        }
      } catch (error: unknown) {
        return {
          pos: reference.from,
          end: reference.to,
          create: () => ({
            dom: card(reference.path, projectErrorFromUnknown(error).message),
          }),
        }
      }
    }

    const classOrPackage = classOrPackageAt(source, position)
    if (classOrPackage !== null) {
      return {
        pos: classOrPackage.from,
        end: classOrPackage.to,
        create: () => ({
          dom: card(classOrPackage.title, classOrPackage.description),
        }),
      }
    }

    const keyword = keywordAt(source, position)
    if (keyword === null) return null
    return {
      pos: keyword.from,
      end: keyword.to,
      create: () => ({
        dom: card(
          keyword.info.title,
          keyword.info.summary,
          keyword.info.example,
          keyword.info.caution
        ),
      }),
    }
  }
}
