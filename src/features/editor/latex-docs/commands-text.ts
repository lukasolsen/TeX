import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsText = {
  item: entry(
    "\\item",
    "Adds an entry to a list-like environment such as `itemize`, `enumerate`, or `description`.\n\n```latex\n\\begin{enumerate}\n  \\item First step\n\\end{enumerate}\n```\n\nUsing it outside a compatible environment causes an error. [LaTeX lists](https://latexref.xyz/Lists.html)"
  ),
  setmainfont: entry(
    "\\setmainfont",
    "Selects the main text font when compiling with XeLaTeX or LuaLaTeX. It is supplied by the `fontspec` package.\n\n```latex\n\\usepackage{fontspec}\n\\setmainfont{Times New Roman}\n```\n\nDo not use it with pdfLaTeX; choose an engine before setting fonts. [fontspec on CTAN](https://ctan.org/pkg/fontspec)"
  ),
  setlength: entry(
    "\\setlength",
    "Sets the value of a length parameter, which controls spacing and sizing in LaTeX.\n\n```latex\n\\setlength{\\parindent}{0pt}\n```\n\nUse it in the preamble or document body; some lengths are class-specific. [LaTeX lengths](https://latexref.xyz/_005csetlength.html)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
