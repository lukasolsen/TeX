/**
 * Which editing behaviour each language gets.
 *
 * One module owns the mapping so a file cannot be highlighted as one language
 * while being folded, commented, or completed as another. Languages TeX has no
 * parser for still declare their comment syntax, because "toggle comment"
 * failing silently in a Makefile is worse than not colouring it.
 */

import type { CompletionSource } from "@codemirror/autocomplete"
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language"
import { json } from "@codemirror/legacy-modes/mode/javascript"
import { perl } from "@codemirror/legacy-modes/mode/perl"
import { properties } from "@codemirror/legacy-modes/mode/properties"
import { python } from "@codemirror/legacy-modes/mode/python"
import { shell } from "@codemirror/legacy-modes/mode/shell"
import { toml } from "@codemirror/legacy-modes/mode/toml"
import { xml } from "@codemirror/legacy-modes/mode/xml"
import { yaml } from "@codemirror/legacy-modes/mode/yaml"
import { EditorState, type Extension } from "@codemirror/state"
import type { StreamParser } from "@codemirror/language"

import type { EditorLanguageId } from "@/domain/editor-language"
import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import { bibtexCompletionSource } from "@/features/editor/bibtex-completion"
import { bibtexFolding } from "@/features/editor/bibtex-folding"
import { bibtexStreamParser } from "@/features/editor/bibtex-stream-parser"
import { latexCompletionSource } from "@/features/editor/latex-completion"
import { latexDelimiterMatching } from "@/features/editor/latex-matching"
import { latexFolding } from "@/features/editor/latex-folding"
import { latexHighlightStyle } from "@/features/editor/latex-highlighting"
import {
  latexSemanticHighlighting,
  type LatexSemanticContext,
} from "@/features/editor/latex-semantic-highlighting"
import { latexStreamParser } from "@/features/editor/latex-stream-parser"
import { markdownEditing } from "@/features/editor/markdown-editing"
import { markdownFolding } from "@/features/editor/markdown-folding"
import { markdownStreamParser } from "@/features/editor/markdown-stream-parser"
import { sourceHighlightStyle } from "@/features/editor/source-highlighting"

/** The legacy modes TeX uses for the data and script files a project carries. */
const legacyModes: Partial<Record<EditorLanguageId, StreamParser<unknown>>> = {
  json,
  yaml,
  toml,
  xml,
  python,
  shell,
  perl,
  ini: properties,
}

function legacyLanguage(parser: StreamParser<unknown>): Extension {
  return [
    StreamLanguage.define(parser),
    syntaxHighlighting(sourceHighlightStyle),
  ]
}

/**
 * Highlighting, folding, and language-specific editing for `language`.
 *
 * The LaTeX branch also carries the project-aware layers — semantic
 * highlighting and delimiter matching — which have no meaning in another
 * language's syntax.
 */
export function editorLanguageSupport(
  language: EditorLanguageId,
  latex: Readonly<{ semantic: LatexSemanticContext }>
): Extension {
  if (language === "latex") {
    return [
      StreamLanguage.define(latexStreamParser),
      syntaxHighlighting(latexHighlightStyle),
      latexSemanticHighlighting(latex.semantic),
      latexDelimiterMatching(),
      latexFolding(),
    ]
  }
  if (language === "bibtex") {
    return [
      StreamLanguage.define(bibtexStreamParser),
      syntaxHighlighting(sourceHighlightStyle),
      bibtexFolding(),
    ]
  }
  if (language === "markdown") {
    return [
      StreamLanguage.define(markdownStreamParser),
      syntaxHighlighting(sourceHighlightStyle),
      markdownFolding(),
      markdownEditing(),
    ]
  }
  if (language === "makefile") {
    // TeX has no Makefile parser, but declaring the comment syntax is what
    // makes "toggle comment" work in one.
    return EditorState.languageData.of(() => [{ commentTokens: { line: "#" } }])
  }
  const parser = legacyModes[language]
  return parser === undefined ? [] : legacyLanguage(parser)
}

/**
 * The completion sources a language answers with, or an empty list where TeX
 * has nothing truthful to suggest.
 */
export function editorLanguageCompletions(
  language: EditorLanguageId,
  project: Readonly<{
    projectPath: () => CanonicalProjectPath
    relativePath: () => ProjectRelativePath
  }>
): CompletionSource[] {
  if (language === "latex") {
    return [latexCompletionSource(project.projectPath, project.relativePath)]
  }
  if (language === "bibtex") return [bibtexCompletionSource()]
  return []
}
