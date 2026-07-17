import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const command = (name: string, markdown: string): LatexDocumentation =>
  entry(`\\${name}`, markdown)

const biblatexOnly =
  " It belongs to the `biblatex`/Biber workflow; do not combine that workflow with BibTeX/natbib commands such as `\\bibliography` and `\\bibliographystyle`."

const natbibOnly =
  " It belongs to the BibTeX/natbib workflow; do not mix it with the `biblatex`/Biber workflow."

export const commandsBibliography = {
  addbibresource: command(
    "addbibresource",
    "Registers a `.bib` database for `biblatex`, normally in the preamble after loading the package. Use `\\printbibliography` to produce the reference list." +
      biblatexOnly
  ),
  autocite: command(
    "autocite",
    "Creates a citation whose form is selected by the active `biblatex` style's autocite setting." +
      biblatexOnly
  ),
  bibbysection: command(
    "bibbysection",
    "Prints a bibliography for each `refsection` when using `biblatex`. It is intended for documents that divide bibliography data into reference sections." +
      biblatexOnly
  ),
  bibliography: command(
    "bibliography",
    "Selects one or more BibTeX database files, normally near the end of a document. Pair it with `\\bibliographystyle`, then run BibTeX as part of the build; use comma-separated database names without the `.bib` extension." +
      natbibOnly
  ),
  bibliographystyle: command(
    "bibliographystyle",
    "Selects the `.bst` style BibTeX uses to format the bibliography, for example `\\bibliographystyle{plain}`. Place it before `\\bibliography`." +
      natbibOnly
  ),
  cite: command(
    "cite",
    "Inserts a citation for one or more comma-separated bibliography keys. Core LaTeX and natbib styles determine its output; with `biblatex`, prefer its documented citation commands for the selected style. A starred form is parsed as this command and may alter name-list output in packages that support it."
  ),
  citealp: command(
    "citealp",
    "Creates a natbib parenthetical-style citation without enclosing parentheses." +
      natbibOnly
  ),
  citealt: command(
    "citealt",
    "Creates a natbib textual-style citation without enclosing parentheses." +
      natbibOnly
  ),
  citeauthor: command(
    "citeauthor",
    "Prints only the author portion of a citation. natbib and biblatex both provide it, but its formatting follows the active bibliography workflow. Starred variants are documented here because the parser keeps `*` outside command names."
  ),
  citefullauthor: command(
    "citefullauthor",
    "Prints the full author list for a natbib citation, equivalent to the full-name author form." +
      natbibOnly
  ),
  citep: command(
    "citep",
    "Creates a parenthetical natbib citation, with optional pre- and post-notes before the key list. Its starred form requests the full author list where the chosen style supports it." +
      natbibOnly
  ),
  citepauthor: command(
    "citepauthor",
    "Prints the author name or names in parentheses using natbib." + natbibOnly
  ),
  citet: command(
    "citet",
    "Creates a textual natbib citation, placing the author name in the sentence and the year in parentheses. Its starred form requests the full author list where supported." +
      natbibOnly
  ),
  citetext: command(
    "citetext",
    "Wraps arbitrary text in the citation delimiters configured by natbib, useful for a parenthetical citation-like note." +
      natbibOnly
  ),
  citetitle: command(
    "citetitle",
    "Prints the title field of a cited entry using `biblatex`'s citation formatting." +
      biblatexOnly
  ),
  citeurl: command(
    "citeurl",
    "Prints the `url` field of a cited entry using `biblatex`'s citation formatting." +
      biblatexOnly
  ),
  citeyear: command(
    "citeyear",
    "Prints only the year portion of a citation. natbib and biblatex both provide this command; its exact formatting follows the active workflow."
  ),
  citeyearpar: command(
    "citeyearpar",
    "Prints a natbib citation year enclosed in the configured parentheses." +
      natbibOnly
  ),
  citenum: command(
    "citenum",
    "Prints the numeric citation label without its surrounding delimiters in natbib's numeric mode." +
      natbibOnly
  ),
  defbibheading: command(
    "defbibheading",
    "Defines a named heading format for use when printing a `biblatex` bibliography." +
      biblatexOnly
  ),
  defcitealias: command(
    "defcitealias",
    "Associates a bibliography key with text that natbib's alias citation commands can print." +
      natbibOnly
  ),
  ExecuteBibliographyOptions: command(
    "ExecuteBibliographyOptions",
    "Applies `biblatex` package options after the package has loaded. Use it for options that must be set in the document preamble." +
      biblatexOnly
  ),
  footcite: command(
    "footcite",
    "Places a `biblatex` citation in a footnote, using the active citation style." +
      biblatexOnly
  ),
  footfullcite: command(
    "footfullcite",
    "Places a full `biblatex` citation in a footnote, commonly for a work's first mention." +
      biblatexOnly
  ),
  fullcite: command(
    "fullcite",
    "Prints a complete bibliography-style entry inline at the citation location using `biblatex`." +
      biblatexOnly
  ),
  nocite: command(
    "nocite",
    "Adds bibliography keys to the reference list without placing a citation in the text. Use `\\nocite{*}` to include every entry from the selected BibTeX database." +
      natbibOnly
  ),
  parencite: command(
    "parencite",
    "Creates a parenthetical citation using `biblatex` and the active citation style." +
      biblatexOnly
  ),
  printbibheading: command(
    "printbibheading",
    "Prints the bibliography heading configured by `biblatex` without printing entries." +
      biblatexOnly
  ),
  printbibliography: command(
    "printbibliography",
    "Prints the bibliography managed by `biblatex`. It accepts filters such as `type`, `keyword`, `category`, and `heading`." +
      biblatexOnly
  ),
  smartcite: command(
    "smartcite",
    "Creates a `biblatex` citation that chooses textual or parenthetical form from its position and surrounding punctuation." +
      biblatexOnly
  ),
  supercite: command(
    "supercite",
    "Creates a superscript citation using `biblatex`; the active citation style controls its appearance." +
      biblatexOnly
  ),
  textcite: command(
    "textcite",
    "Creates a textual `biblatex` citation, normally integrating the label name into the sentence." +
      biblatexOnly
  ),
  citealias: command(
    "citealias",
    "Prints the alias text assigned with `\\defcitealias` for a natbib citation key." +
      natbibOnly
  ),
  citetalias: command(
    "citetalias",
    "Prints a natbib citation alias as textual citation text." + natbibOnly
  ),
  citepalias: command(
    "citepalias",
    "Prints a natbib citation alias in parenthetical form." + natbibOnly
  ),
  multicite: command(
    "multicite",
    "Combines several `biblatex` citation commands in one citation group; it is useful for custom citation command definitions." +
      biblatexOnly
  ),
  cites: command(
    "cites",
    "Combines multiple `biblatex` citations while allowing separate notes and key lists for each citation." +
      biblatexOnly
  ),
  DeclareCiteCommand: command(
    "DeclareCiteCommand",
    "Defines a custom `biblatex` citation command from formatting hooks. Use it in the preamble." +
      biblatexOnly
  ),
  DeclareMultiCiteCommand: command(
    "DeclareMultiCiteCommand",
    "Defines a multi-citation command based on an existing `biblatex` citation command. Use it in the preamble." +
      biblatexOnly
  ),
  DeclareAutoCiteCommand: command(
    "DeclareAutoCiteCommand",
    "Changes which `biblatex` citation commands `\\autocite` selects in inline, footnote, and superscript contexts." +
      biblatexOnly
  ),
  DeclareBibliographyCategory: command(
    "DeclareBibliographyCategory",
    "Declares a named category for filtering `biblatex` bibliographies. Use it in the preamble with `\\addtocategory`." +
      biblatexOnly
  ),
  addtocategory: command(
    "addtocategory",
    "Adds one or more bibliography keys to a named `biblatex` category for later filtering." +
      biblatexOnly
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
