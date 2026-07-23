/**
 * The language a project file is edited as.
 *
 * This is deliberately wider than `projectFileKind`: TeX highlights a generated
 * `.aux` or `.toc` as LaTeX because that is what those files contain, while
 * `isLatexSource` still decides whether TeX offers to *analyse* a file. The two
 * questions are asked separately so broadening highlighting never broadens the
 * claims completion, hover, and diagnostics make.
 */

import { fileExtension, fileName, isLatexSource } from "@/domain/file-kind"

export type EditorLanguageId =
  | "latex"
  | "bibtex"
  | "markdown"
  | "json"
  | "yaml"
  | "toml"
  | "xml"
  | "python"
  | "shell"
  | "perl"
  | "ini"
  | "makefile"
  /** Anything with no syntax TeX can describe honestly. */
  | "plain"

/**
 * Files written in LaTeX's own syntax, including the auxiliary files the
 * engine generates: they are read far more often than they are edited, and
 * `\contentsline` reads as LaTeX wherever it appears.
 */
const latexExtensions = new Set([
  "aux",
  "bbl",
  "bbx",
  "cbx",
  "cls",
  "clo",
  "def",
  "dtx",
  "fd",
  "glo",
  "gls",
  "idx",
  "ind",
  "ins",
  "lbx",
  "ldf",
  "lof",
  "lot",
  "ltx",
  "nav",
  "out",
  "pgf",
  "rnw",
  "snm",
  "sty",
  "tex",
  "tikz",
  "toc",
  "vrb",
])

const byExtension = new Map<string, EditorLanguageId>([
  ["bib", "bibtex"],
  ["cfg", "ini"],
  ["ini", "ini"],
  ["json", "json"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["mk", "makefile"],
  ["py", "python"],
  ["sh", "shell"],
  ["toml", "toml"],
  ["xml", "xml"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
])

/** Extensionless files a LaTeX project carries whose syntax is still known. */
const byFileName = new Map<string, EditorLanguageId>([
  [".editorconfig", "ini"],
  [".gitattributes", "plain"],
  [".gitignore", "plain"],
  // `latexmkrc` is a Perl script that latexmk evaluates.
  [".latexmkrc", "perl"],
  ["latexmkrc", "perl"],
  ["makefile", "makefile"],
  ["readme", "markdown"],
])

/** The language TeX edits `path` as, decided from its name alone. */
export function editorLanguage(path: string): EditorLanguageId {
  const suffix = fileExtension(path)
  if (suffix === null) return byFileName.get(fileName(path)) ?? "plain"
  if (latexExtensions.has(suffix)) return "latex"
  return byExtension.get(suffix) ?? "plain"
}

const languageNames: Record<EditorLanguageId, string> = {
  latex: "LaTeX",
  bibtex: "BibTeX",
  markdown: "Markdown",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  python: "Python",
  shell: "Shell",
  perl: "Perl",
  ini: "INI",
  makefile: "Makefile",
  plain: "Plain text",
}

/** How a language is named in the interface. */
export function editorLanguageName(language: EditorLanguageId): string {
  return languageNames[language]
}

/**
 * Whether TeX's project analysis — completion, hover, and diagnostics — applies
 * to a file.
 *
 * Analysis understands LaTeX documents and the bibliographies they cite, and
 * nothing else. A Markdown or plain-text file in a LaTeX project is edited
 * without it rather than being checked against rules it was never written to.
 */
export function hasLatexAnalysis(path: string): boolean {
  if (!isLatexSource(path)) return false
  const language = editorLanguage(path)
  return language === "latex" || language === "bibtex"
}
