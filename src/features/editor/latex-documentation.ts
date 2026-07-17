/** Curated, bundled Markdown documentation shown by the editor hover. */
export type LatexDocumentation = {
  readonly title: string
  readonly markdown: string
}

type DocumentationCatalog = Readonly<{
  commands: Readonly<Record<string, LatexDocumentation>>
  documentClasses: Readonly<Record<string, LatexDocumentation>>
  packages: Readonly<Record<string, LatexDocumentation>>
}>

const entry = (title: string, markdown: string): LatexDocumentation =>
  Object.freeze({ title, markdown })

// Commands (alphabetical)
const commands = {
  addbibresource: entry(
    "\\addbibresource",
    "Registers a `.bib` file for **biblatex**. Use it in the preamble after loading `biblatex`.\n\n```latex\n\\usepackage[backend=biber]{biblatex}\n\\addbibresource{references.bib}\n```\n\nPrint entries with `\\printbibliography`; do not combine this workflow with `\\bibliography`. [biblatex on CTAN](https://ctan.org/pkg/biblatex)"
  ),
  author: entry(
    "\\author",
    "Sets author metadata for `\\maketitle` in the preamble. Classes decide how multiple authors and affiliations are formatted.\n\n```latex\n\\author{Ada Lovelace}\n```\n\nIt produces no text until `\\maketitle` is used. [LaTeX reference](https://latexref.xyz/_005cauthor.html)"
  ),
  begin: entry(
    "\\begin",
    "Starts a named environment in the document body or wherever that environment is permitted. Every environment has a matching `\\end` with the same name.\n\n```latex\n\\begin{itemize}\n  \\item First point\n\\end{itemize}\n```\n\nNested environments must close in reverse order. [LaTeX environments](https://latexref.xyz/Environments.html)"
  ),
  bibliography: entry(
    "\\bibliography",
    "Selects BibTeX database files, normally near the end of a document using a BibTeX bibliography style.\n\n```latex\n\\bibliographystyle{plain}\n\\bibliography{references}\n```\n\nUse `\\addbibresource` instead when the project uses `biblatex`. [LaTeX bibliography](https://latexref.xyz/Bibliographies.html)"
  ),
  chapter: entry(
    "\\chapter",
    "Creates a top-level numbered division in classes that support chapters, including `book` and `report`. Use it in the document body.\n\n```latex\n\\chapter{Method}\n```\n\nThe `article` class has no chapters; begin with `\\section` there. [LaTeX sectioning](https://latexref.xyz/Sectioning.html)"
  ),
  cite: entry(
    "\\cite",
    "Inserts a citation for one or more bibliography keys in the document body. Its exact output is determined by the bibliography package and style.\n\n```latex\nAs shown by \\cite{knuth1984}, typography matters.\n```\n\nThe key must exist in the configured bibliography database. [LaTeX citations](https://latexref.xyz/Citations.html)"
  ),
  date: entry(
    "\\date",
    "Sets the date metadata that `\\maketitle` renders. Put it in the preamble.\n\n```latex\n\\date{\\today}\n```\n\nUse `\\date{}` when the title block should deliberately omit a date. [LaTeX reference](https://latexref.xyz/_005cdate.html)"
  ),
  documentclass: entry(
    "\\documentclass",
    "Chooses the document class, which supplies the document structure and defaults. It is the first major declaration in the preamble.\n\n```latex\n\\documentclass[12pt,a4paper]{article}\n```\n\nUse exactly one class; classes are not loaded with `\\usepackage`. [LaTeX document classes](https://latexref.xyz/Document-classes.html)"
  ),
  end: entry(
    "\\end",
    "Closes the environment opened by the corresponding `\\begin`. It is required wherever that environment ends.\n\n```latex\n\\begin{equation}\n  E = mc^2\n\\end{equation}\n```\n\nThe name must match exactly or LaTeX cannot recover the environment nesting. [LaTeX environments](https://latexref.xyz/Environments.html)"
  ),
  include: entry(
    "\\include",
    "Includes a separate `.tex` file on a page boundary and supports `\\includeonly` for selective builds. Use it in the document body.\n\n```latex\n\\include{chapters/method}\n```\n\nPrefer `\\input` for small inline fragments; do not nest `\\include`. [LaTeX include](https://latexref.xyz/_005cinclude-_0026-_005cincludeonly.html)"
  ),
  includegraphics: entry(
    "\\includegraphics",
    "Places an image asset; it is supplied by the `graphicx` package and is normally used in the document body.\n\n```latex\n\\includegraphics[width=0.8\\linewidth]{figures/result.pdf}\n```\n\nLoad `graphicx` and keep paths relative to the source file. [graphicx on CTAN](https://ctan.org/pkg/graphicx)"
  ),
  input: entry(
    "\\input",
    "Inserts another source file at this location, which keeps a large document split into focused files.\n\n```latex\n\\input{chapters/introduction}\n```\n\nThe path is relative to this file; an input file normally has no second preamble. [LaTeX input](https://latexref.xyz/_005cinput.html)"
  ),
  item: entry(
    "\\item",
    "Adds an entry to a list-like environment such as `itemize`, `enumerate`, or `description`.\n\n```latex\n\\begin{enumerate}\n  \\item First step\n\\end{enumerate}\n```\n\nUsing it outside a compatible environment causes an error. [LaTeX lists](https://latexref.xyz/Lists.html)"
  ),
  label: entry(
    "\\label",
    "Creates a stable name for a numbered heading, caption, equation, or other counter. Place it immediately after the thing it identifies.\n\n```latex\n\\section{Results}\\label{sec:results}\n```\n\nLabels must be unique; prefixes such as `sec:` and `fig:` prevent collisions. [LaTeX labels](https://latexref.xyz/_005clabel.html)"
  ),
  maketitle: entry(
    "\\maketitle",
    "Renders the title block from preamble metadata set with `\\title`, `\\author`, and `\\date`. Use it near the start of the document body.\n\n```latex\n\\begin{document}\n\\maketitle\n```\n\nDo not call it in the preamble; most classes expect it only once. [LaTeX title page](https://latexref.xyz/_005cmaketitle.html)"
  ),
  ref: entry(
    "\\ref",
    "Inserts the number associated with a matching `\\label` in running text.\n\n```latex\nSee Section~\\ref{sec:results}.\n```\n\nCompile again after adding or moving labels so LaTeX can resolve the reference. [LaTeX references](https://latexref.xyz/_005cref.html)"
  ),
  section: entry(
    "\\section",
    "Creates a numbered section heading in the document body and normally adds it to the table of contents.\n\n```latex\n\\section{Introduction}\n```\n\nKeep heading levels meaningful; use paragraphs rather than headings only to add space. [LaTeX sectioning](https://latexref.xyz/Sectioning.html)"
  ),
  subfile: entry(
    "\\subfile",
    "Includes a child document when the project uses the `subfiles` package, allowing the child to compile independently.\n\n```latex\n\\subfile{chapters/introduction}\n```\n\nLoad `subfiles`; each child needs a compatible standalone preamble. [subfiles on CTAN](https://ctan.org/pkg/subfiles)"
  ),
  subsection: entry(
    "\\subsection",
    "Creates a numbered subsection below the current section in the document body.\n\n```latex\n\\subsection{Data collection}\n```\n\nUse it for actual document structure, not as visual spacing. [LaTeX sectioning](https://latexref.xyz/Sectioning.html)"
  ),
  title: entry(
    "\\title",
    "Sets title metadata for `\\maketitle`; put it in the preamble.\n\n```latex\n\\title{A Clear Research Title}\n```\n\nIt does not print by itself, and its exact styling comes from the document class. [LaTeX reference](https://latexref.xyz/_005ctitle.html)"
  ),
  usepackage: entry(
    "\\usepackage",
    "Loads a LaTeX package and makes its commands and environments available. It belongs in the preamble.\n\n```latex\n\\usepackage{graphicx}\n```\n\nAvoid loading a package twice unless its documentation explicitly supports it. [LaTeX packages](https://latexref.xyz/Additional-packages.html)"
  ),
  setmainfont: entry(
    "\\setmainfont",
    "Selects the main text font when compiling with XeLaTeX or LuaLaTeX. It is supplied by the `fontspec` package.\n\n```latex\n\\usepackage{fontspec}\n\\setmainfont{Times New Roman}\n```\n\nDo not use it with pdfLaTeX; choose an engine before setting fonts. [fontspec on CTAN](https://ctan.org/pkg/fontspec)"
  ),
  captionsetup: entry(
    "\\captionsetup",
    "Configures caption formatting for figures, tables, and other floats. It is supplied by the `caption` package.\n\n```latex\n\\usepackage{caption}\n\\captionsetup{font=small,labelfont=bf}\n```\n\nLoad it after the document class and before any floats. [caption on CTAN](https://ctan.org/pkg/caption)"
  ),
  setlength: entry(
    "\\setlength",
    "Sets the value of a length parameter, which controls spacing and sizing in LaTeX.\n\n```latex\n\\setlength{\\parindent}{0pt}\n```\n\nUse it in the preamble or document body; some lengths are class-specific. [LaTeX lengths](https://latexref.xyz/_005csetlength.html)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>

// Document classes (alphabetical)
const documentClasses = {
  article: entry(
    "article",
    "For short papers, articles, and reports without chapters. It provides sectioning, a title block, and standard typography.\n\n```latex\n\\documentclass[11pt]{article}\n```\n\nUse `report` or `book` when chapter-level structure is needed. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  beamer: entry(
    "beamer",
    "For presentation slides, overlays, and speaker-oriented material. It provides frames, themes, and incremental reveals.\n\n```latex\n\\documentclass{beamer}\n```\n\nSlide themes can change layout substantially; start with content before extensive theming. [beamer on CTAN](https://ctan.org/pkg/beamer)"
  ),
  book: entry(
    "book",
    "For long, book-like documents with chapters, front matter, and back matter. It is appropriate for theses only when local requirements permit it.\n\n```latex\n\\documentclass[12pt]{book}\n```\n\nIts two-sided and chapter-opening defaults differ from `report`. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  memoir: entry(
    "memoir",
    "A configurable book and report class that combines many layout and typesetting features in one class.\n\n```latex\n\\documentclass[11pt]{memoir}\n```\n\nRead its documentation before adding packages that alter page layout or headings. [memoir on CTAN](https://ctan.org/pkg/memoir)"
  ),
  report: entry(
    "report",
    "For multi-chapter reports, dissertations, and technical documents. It adds `\\chapter` while keeping a conventional article-like workflow.\n\n```latex\n\\documentclass[12pt]{report}\n```\n\nCheck institutional templates before changing its title-page or margin defaults. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  slides: entry(
    "slides",
    "For simple presentation slides with a minimalistic style. It is an older class and less feature-rich than `beamer`.\n\n```latex\n\\documentclass{slides}\n```\n\nConsider `beamer` for modern presentations; `slides` is mostly for legacy documents. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  minimal: entry(
    "minimal",
    "A bare-bones class that provides almost no formatting or structure. It is useful for testing or very specialized documents.\n\n```latex\n\\documentclass{minimal}\n```\n\nIt does not support sections, titles, or standard document features. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  ieeetran: entry(
    "ieeetran",
    "A class for IEEE conference and journal papers, providing the correct formatting and layout.\n\n```latex\n\\documentclass[conference]{ieeetran}\n```\n\nFollow IEEE guidelines for submission; it is not compatible with all packages. [ieeetran on CTAN](https://ctan.org/pkg/ieeetran)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>

// Packages (alphabetical)
const packages = {
  amsmath: entry(
    "amsmath",
    "Adds professional mathematical environments such as `align`, `gather`, and `cases`.\n\n```latex\n\\usepackage{amsmath}\n```\n\nPrefer its structured environments over manual alignment with spaces. [amsmath on CTAN](https://ctan.org/pkg/amsmath)"
  ),
  amssymb: entry(
    "amssymb",
    "Adds many mathematical symbols, including blackboard-bold and relation symbols.\n\n```latex\n\\usepackage{amssymb}\n```\n\nIt complements `amsmath`; use a symbol’s documented math mode. [amssymb on CTAN](https://ctan.org/pkg/amsfonts)"
  ),
  babel: entry(
    "babel",
    "Configures language-aware hyphenation, captions, and typography for pdfLaTeX and many other workflows.\n\n```latex\n\\usepackage[english]{babel}\n```\n\nChoose languages and engine-specific guidance from its manual. [babel on CTAN](https://ctan.org/pkg/babel)"
  ),
  biblatex: entry(
    "biblatex",
    "Provides a modern bibliography and citation interface, usually with Biber as backend.\n\n```latex\n\\usepackage[backend=biber]{biblatex}\n```\n\nUse `\\addbibresource` and `\\printbibliography`, not BibTeX’s `\\bibliography`. [biblatex on CTAN](https://ctan.org/pkg/biblatex)"
  ),
  booktabs: entry(
    "booktabs",
    "Provides well-spaced table rules such as `\\toprule`, `\\midrule`, and `\\bottomrule`.\n\n```latex\n\\usepackage{booktabs}\n```\n\nAvoid vertical rules and double rules when following its typography guidance. [booktabs on CTAN](https://ctan.org/pkg/booktabs)"
  ),
  cleveref: entry(
    "cleveref",
    "Formats cross-references with their type, such as “Figure 1”, and handles multiple references.\n\n```latex\n\\usepackage{cleveref}\n```\n\nLoad it late because it integrates with labels and hyperlinks. [cleveref on CTAN](https://ctan.org/pkg/cleveref)"
  ),
  csquotes: entry(
    "csquotes",
    "Supplies context-sensitive quotation commands, especially useful with `biblatex`.\n\n```latex\n\\usepackage{csquotes}\n```\n\nConfigure language support first so quotation styles match the document language. [csquotes on CTAN](https://ctan.org/pkg/csquotes)"
  ),
  fontspec: entry(
    "fontspec",
    "Selects system and OpenType fonts when compiling with XeLaTeX or LuaLaTeX.\n\n```latex\n\\usepackage{fontspec}\n```\n\nDo not use it with pdfLaTeX; choose an engine before setting fonts. [fontspec on CTAN](https://ctan.org/pkg/fontspec)"
  ),
  geometry: entry(
    "geometry",
    "Configures page size and margins with a concise key-value interface.\n\n```latex\n\\usepackage[margin=1in]{geometry}\n```\n\nFollow submission or institutional margin rules before overriding them. [geometry on CTAN](https://ctan.org/pkg/geometry)"
  ),
  graphicx: entry(
    "graphicx",
    "Enables `\\includegraphics` and keys for scaling, rotation, and clipping graphics.\n\n```latex\n\\usepackage{graphicx}\n```\n\nKeep image formats compatible with the chosen compiler. [graphicx on CTAN](https://ctan.org/pkg/graphicx)"
  ),
  hyperref: entry(
    "hyperref",
    "Adds PDF hyperlinks, metadata, and link targets for references and the table of contents.\n\n```latex\n\\usepackage{hyperref}\n```\n\nLoad it near the end of the preamble unless another package documents a different order. [hyperref on CTAN](https://ctan.org/pkg/hyperref)"
  ),
  inputenc: entry(
    "inputenc",
    "Configures input encoding for legacy pdfLaTeX documents.\n\n```latex\n\\usepackage[utf8]{inputenc}\n```\n\nModern LaTeX defaults to UTF-8, and XeLaTeX/LuaLaTeX do not use this package. [inputenc on CTAN](https://ctan.org/pkg/inputenc)"
  ),
  microtype: entry(
    "microtype",
    "Improves justification through character protrusion and font expansion where supported.\n\n```latex\n\\usepackage{microtype}\n```\n\nIt is usually safe, but check publisher templates that tightly control typography. [microtype on CTAN](https://ctan.org/pkg/microtype)"
  ),
  natbib: entry(
    "natbib",
    "Extends BibTeX citation commands with author-year and numeric citation styles.\n\n```latex\n\\usepackage[round]{natbib}\n```\n\nUse it with a BibTeX workflow, not together with `biblatex`. [natbib on CTAN](https://ctan.org/pkg/natbib)"
  ),
  siunitx: entry(
    "siunitx",
    "Formats numbers, units, and quantities consistently according to SI conventions.\n\n```latex\n\\usepackage{siunitx}\n```\n\nUse `\\qty{10}{\\metre\\per\\second}` rather than manually spacing units. [siunitx on CTAN](https://ctan.org/pkg/siunitx)"
  ),
  subcaption: entry(
    "subcaption",
    "Creates subfigures and subcaptions within figure or table floats.\n\n```latex\n\\usepackage{subcaption}\n```\n\nIt replaces older subfigure packages; check class compatibility for caption styling. [subcaption on CTAN](https://ctan.org/pkg/subcaption)"
  ),
  subfiles: entry(
    "subfiles",
    "Lets component documents compile on their own while remaining part of a parent document.\n\n```latex\n\\usepackage{subfiles}\n```\n\nChild files must declare the compatible main document in their own preamble. [subfiles on CTAN](https://ctan.org/pkg/subfiles)"
  ),
  xcolor: entry(
    "xcolor",
    "Defines named colours and colour models for text, tables, and graphics.\n\n```latex\n\\usepackage{xcolor}\n```\n\nUse colour to reinforce meaning, not as the only distinction in document output. [xcolor on CTAN](https://ctan.org/pkg/xcolor)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>

export const latexDocumentation: DocumentationCatalog = Object.freeze({
  commands: Object.freeze(commands),
  documentClasses: Object.freeze(documentClasses),
  packages: Object.freeze(packages),
})

export function commandDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.commands[name]
}

export function documentClassDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.documentClasses[name]
}

export function packageDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.packages[name]
}
