import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const command = (name: string, markdown: string): LatexDocumentation =>
  entry(`\\${name}`, markdown)

export const commandsStructure = {
  addcontentsline: command(
    "addcontentsline",
    "Adds a manual entry to a table of contents, list of figures, or list of tables.\n\n```latex\n\\addcontentsline{toc}{section}{Acknowledgements}\n```\n\nUse the target file, entry level, and displayed text in that order."
  ),
  addtocontents: command(
    "addtocontents",
    "Writes formatting material directly to an auxiliary contents file. Prefer higher-level commands when possible because the file format is class-dependent."
  ),
  and: command(
    "and",
    "Separates authors in `\\author` for classes that recognise it. The document class controls the resulting author layout."
  ),
  appendix: command(
    "appendix",
    "Changes subsequent sectioning commands to appendix numbering.\n\n```latex\n\\appendix\n\\section{Supplementary derivation}\n```\n\nIt does not create an appendix heading by itself."
  ),
  author: command(
    "author",
    "Sets author metadata for `\\maketitle` in the preamble. Classes decide how multiple authors and affiliations are formatted.\n\n```latex\n\\author{Ada Lovelace}\n```\n\nIt produces no text until `\\maketitle` is used."
  ),
  autoref: command(
    "autoref",
    "Creates a typed cross-reference such as ‘Section 2’. It is provided by `hyperref`; load that package before using it."
  ),
  backmatter: command(
    "backmatter",
    "Starts unnumbered back matter in classes such as `book` and `memoir`. Use it before bibliographies, indexes, or closing chapters when the class supports it."
  ),
  begin: command(
    "begin",
    "Starts a named environment with `\\begin{name}`; close it with `\\end{name}` using exactly the same name.\n\n```latex\n\\begin{itemize}\n  \\item First point\n\\end{itemize}\n```\n\nNested environments must close in reverse order. An environment may require a package or allow its own optional arguments, so check the environment's documentation before adding options."
  ),
  chapter: command(
    "chapter",
    "Creates a top-level numbered division in classes that support chapters, including `book` and `report`. The `article` class has no chapters; begin with `\\section` there."
  ),
  cleardoublepage: command(
    "cleardoublepage",
    "Ends the current page and, in two-sided layouts, inserts a blank page when needed so following content starts on a right-hand page."
  ),
  clearpage: command(
    "clearpage",
    "Ends the current page and places all pending floats before continuing. Use it when a figure or table must not move beyond a boundary."
  ),
  date: command(
    "date",
    "Sets the date metadata that `\\maketitle` renders. Put it in the preamble.\n\n```latex\n\\date{\\today}\n```\n\nUse `\\date{}` when the title block should deliberately omit a date."
  ),
  documentclass: command(
    "documentclass",
    "Chooses the document class and its global options. Its syntax is `\\documentclass[options]{class}`, and it belongs at the start of the preamble.\n\n```latex\n\\documentclass[12pt,a4paper]{article}\n```\n\nThe available options depend on the class; `12pt` and `a4paper` are common standard-class options. Use exactly one class—classes are not loaded with `\\usepackage`. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  end: command(
    "end",
    "Closes the environment opened by the corresponding `\\begin`.\n\n```latex\n\\begin{equation}\n  E = mc^2\n\\end{equation}\n```\n\nThe name must match exactly or LaTeX cannot recover the environment nesting."
  ),
  eqref: command(
    "eqref",
    "Prints a parenthesised reference to a labelled equation. It is provided by `amsmath`; load that package before using it."
  ),
  frontmatter: command(
    "frontmatter",
    "Starts unnumbered front matter in classes such as `book` and `memoir`, typically using roman page numbers."
  ),
  href: command(
    "href",
    "Creates linked text with the syntax `\\href{URL}{text}`. It is provided by `hyperref`.\n\n```latex\n\\href{https://example.org}{Project website}\n```\n\nUse `\\url{...}` when the URL itself should be displayed. Do not put fragile commands in the URL argument. [hyperref on CTAN](https://ctan.org/pkg/hyperref)"
  ),
  include: command(
    "include",
    "Includes a separate `.tex` file on a page boundary and supports `\\includeonly` for selective builds.\n\n```latex\n\\include{chapters/method}\n```\n\nPrefer `\\input` for small inline fragments; do not nest `\\include`."
  ),
  includeonly: command(
    "includeonly",
    "Limits which `\\include` files are processed while retaining cross-reference information from earlier builds. Put it in the preamble.\n\n```latex\n\\includeonly{chapters/method}\n```"
  ),
  input: command(
    "input",
    "Inserts another source file at this location, which keeps a large document split into focused files.\n\n```latex\n\\input{chapters/introduction}\n```\n\nAn input file normally has no second preamble."
  ),
  label: command(
    "label",
    "Creates a stable name for the most recently stepped counter, such as a heading, caption, or equation.\n\n```latex\n\\section{Results}\\label{sec:results}\n```\n\nPut it after `\\caption` for figures and tables, and inside the numbered equation environment for equations. Labels must be unique; prefixes such as `sec:` and `fig:` prevent collisions."
  ),
  linebreak: command(
    "linebreak",
    "Requests a line break at the current point. An optional value from 0 to 4 expresses how strongly LaTeX should try to break there."
  ),
  listoffigures: command(
    "listoffigures",
    "Prints the list of figures, usually after the table of contents. Compile twice after changing captions so entries are current."
  ),
  listoftables: command(
    "listoftables",
    "Prints the list of tables, usually after the table of contents. Compile twice after changing captions so entries are current."
  ),
  mainmatter: command(
    "mainmatter",
    "Starts numbered main matter in classes such as `book` and `memoir`, typically resetting page numbering to arabic numerals."
  ),
  maketitle: command(
    "maketitle",
    "Renders the title block from preamble metadata set with `\\title`, `\\author`, and `\\date`. Use it near the start of the document body.\n\n```latex\n\\begin{document}\n\\maketitle\n```\n\nMost classes expect it only once."
  ),
  nameref: command(
    "nameref",
    "References the title associated with a label instead of its number. It is provided by `nameref` and is also available through `hyperref`."
  ),
  newcommand: command(
    "newcommand",
    "Defines a reusable command and reports an error if its name already exists. Its form is `\\newcommand{\\name}[arguments][default]{replacement}`; the argument count and default are optional.\n\n```latex\n\\newcommand{\\vect}[1]{\\mathbf{#1}}\n```\n\nUse `#1`, `#2`, and so on only when an argument count is declared. Use `\\renewcommand` only when deliberately replacing an existing command."
  ),
  newcounter: command(
    "newcounter",
    "Creates a new counter, optionally resetting it when another counter advances. Use `\\newtheorem` for theorem numbering rather than managing theorem counters manually."
  ),
  newenvironment: command(
    "newenvironment",
    "Defines an environment with opening and closing code.\n\n```latex\n\\newenvironment{note}{\\begin{quote}\\itshape}{\\end{quote}}\n```\n\nIt reports an error when the environment name already exists."
  ),
  newpage: command(
    "newpage",
    "Ends the current page without forcing queued floats to appear. Use `\\clearpage` when pending floats must be placed first."
  ),
  newline: command(
    "newline",
    "Forces a line break at the current point. Prefer paragraph breaks for ordinary prose separation."
  ),
  newtheorem: command(
    "newtheorem",
    "Defines a numbered theorem-like environment. It is commonly supplied by the document class or `amsthm`.\n\n```latex\n\\newtheorem{theorem}{Theorem}[section]\n```"
  ),
  nolinebreak: command(
    "nolinebreak",
    "Discourages a line break at the current point. An optional value from 0 to 4 controls the strength of the request."
  ),
  nolinkurl: command(
    "nolinkurl",
    "Typesets a URL in a breakable monospaced form without creating a hyperlink. It is provided by `hyperref`."
  ),
  nopagebreak: command(
    "nopagebreak",
    "Discourages a page break at the current point. An optional value from 0 to 4 controls the strength of the request."
  ),
  pageref: command(
    "pageref",
    "Prints the page number associated with a matching label.\n\n```latex\nSee page~\\pageref{sec:results}.\n```\n\nCompile again after moving labelled material."
  ),
  pagebreak: command(
    "pagebreak",
    "Requests a page break at the current point. An optional value from 0 to 4 expresses how strongly LaTeX should break there."
  ),
  paragraph: command(
    "paragraph",
    "Creates a run-in sectioning heading below `\\subsubsection` in standard classes. Its formatting depends on the document class."
  ),
  part: command(
    "part",
    "Creates the highest document division, above chapters or sections.\n\n```latex\n\\part{Foundations}\n```\n\nUse it for major groups of content rather than ordinary sections."
  ),
  phantomsection: command(
    "phantomsection",
    "Creates a hyperlink anchor at the current position. It is provided by `hyperref` and is useful before manual contents entries."
  ),
  providecommand: command(
    "providecommand",
    "Defines a command only when it is not already defined, which helps packages offer a safe fallback definition."
  ),
  ref: command(
    "ref",
    "Inserts the number associated with a matching `\\label` in running text.\n\n```latex\nSee Section~\\ref{sec:results}.\n```\n\nUse a non-breaking space before it when the preceding word must stay with the number. Compile again after adding or moving labels so LaTeX can resolve the reference; use `\\autoref` or `\\cref` when a typed reference is wanted."
  ),
  refstepcounter: command(
    "refstepcounter",
    "Increments a counter and makes its value available to the next `\\label`. Use it when creating a custom numbered object that users can reference."
  ),
  renewcommand: command(
    "renewcommand",
    "Redefines an existing command and reports an error if it is undefined. Limit redefinitions to documented extension points to avoid surprising package interactions."
  ),
  renewenvironment: command(
    "renewenvironment",
    "Redefines an existing environment. Use it only when the existing environment is known and the replacement preserves its intended use."
  ),
  RequirePackage: command(
    "RequirePackage",
    "Loads a package from a class or package file. In a normal document preamble, use `\\usepackage` instead."
  ),
  section: command(
    "section",
    "Creates a numbered section heading in the document body and normally adds it to the table of contents. The starred form, `\\section*{...}`, omits numbering and the contents entry.\n\n```latex\n\\section{Introduction}\n```\n\nAdd `\\label` immediately after a numbered heading when it will be referenced. Keep heading levels meaningful; use paragraphs rather than headings only to add space."
  ),
  setcounter: command(
    "setcounter",
    "Sets a counter to a specific integer.\n\n```latex\n\\setcounter{section}{3}\n```\n\nChanging built-in counters can affect numbering and references."
  ),
  stepcounter: command(
    "stepcounter",
    "Increments a counter without making its value available to `\\label`. Use `\\refstepcounter` when the new value must be referenced."
  ),
  subparagraph: command(
    "subparagraph",
    "Creates the lowest standard sectioning level below `\\paragraph`. Its formatting depends on the document class and is often run-in."
  ),
  subsection: command(
    "subsection",
    "Creates a numbered subsection below the current section in the document body.\n\n```latex\n\\subsection{Data collection}\n```\n\nUse it for actual document structure, not as visual spacing."
  ),
  subsubsection: command(
    "subsubsection",
    "Creates a numbered subsection below `\\subsection`. Use it sparingly so the document hierarchy remains easy to scan."
  ),
  subfile: command(
    "subfile",
    "Includes a child document when the project uses the `subfiles` package, allowing the child to compile independently.\n\n```latex\n\\subfile{chapters/introduction}\n```\n\nLoad `subfiles`; each child needs a compatible standalone preamble."
  ),
  tableofcontents: command(
    "tableofcontents",
    "Prints the table of contents at the current location.\n\n```latex\n\\tableofcontents\n```\n\nCompile twice after changing headings so entries are current."
  ),
  thanks: command(
    "thanks",
    "Adds a footnote to title metadata, usually inside `\\author` or `\\title`. The document class determines where it is printed."
  ),
  title: command(
    "title",
    "Sets title metadata for `\\maketitle`; put it in the preamble.\n\n```latex\n\\title{A Clear Research Title}\n```\n\nIt does not print by itself, and its styling comes from the document class."
  ),
  url: command(
    "url",
    "Typesets a URL in a breakable monospaced form. It is provided by `hyperref` or the `url` package.\n\n```latex\n\\url{https://example.org/resources}\n```"
  ),
  usepackage: command(
    "usepackage",
    "Loads one or more LaTeX packages in the preamble. Its syntax is `\\usepackage[options]{package}`; package options are defined by that package.\n\n```latex\n\\usepackage{graphicx}\n```\n\nPackages can be listed together only when they share the same options. Avoid loading a package twice or guessing its options; package loading order can matter, especially for hyperlink and language packages."
  ),
  value: command(
    "value",
    "Expands to the current numeric value of a counter. Use it where TeX expects an integer, not as ordinary formatted prose."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
