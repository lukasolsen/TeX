import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsStructure = {
  author: entry(
    "\\author",
    "Sets author metadata for `\\maketitle` in the preamble. Classes decide how multiple authors and affiliations are formatted.\n\n```latex\n\\author{Ada Lovelace}\n```\n\nIt produces no text until `\\maketitle` is used. [LaTeX reference](https://latexref.xyz/_005cauthor.html)"
  ),
  begin: entry(
    "\\begin",
    "Starts a named environment in the document body or wherever that environment is permitted. Every environment has a matching `\\end` with the same name.\n\n```latex\n\\begin{itemize}\n  \\item First point\n\\end{itemize}\n```\n\nNested environments must close in reverse order. [LaTeX environments](https://latexref.xyz/Environments.html)"
  ),
  chapter: entry(
    "\\chapter",
    "Creates a top-level numbered division in classes that support chapters, including `book` and `report`. Use it in the document body.\n\n```latex\n\\chapter{Method}\n```\n\nThe `article` class has no chapters; begin with `\\section` there. [LaTeX sectioning](https://latexref.xyz/Sectioning.html)"
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
  input: entry(
    "\\input",
    "Inserts another source file at this location, which keeps a large document split into focused files.\n\n```latex\n\\input{chapters/introduction}\n```\n\nThe path is relative to this file; an input file normally has no second preamble. [LaTeX input](https://latexref.xyz/_005cinput.html)"
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
} as const satisfies Readonly<Record<string, LatexDocumentation>>
