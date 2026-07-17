import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsBibliography = {
  addbibresource: entry(
    "\\addbibresource",
    "Registers a `.bib` file for **biblatex**. Use it in the preamble after loading `biblatex`.\n\n```latex\n\\usepackage[backend=biber]{biblatex}\n\\addbibresource{references.bib}\n```\n\nPrint entries with `\\printbibliography`; do not combine this workflow with `\\bibliography`. [biblatex on CTAN](https://ctan.org/pkg/biblatex)"
  ),
  bibliography: entry(
    "\\bibliography",
    "Selects BibTeX database files, normally near the end of a document using a BibTeX bibliography style.\n\n```latex\n\\bibliographystyle{plain}\n\\bibliography{references}\n```\n\nUse `\\addbibresource` instead when the project uses `biblatex`. [LaTeX bibliography](https://latexref.xyz/Bibliographies.html)"
  ),
  cite: entry(
    "\\cite",
    "Inserts a citation for one or more bibliography keys in the document body. Its exact output is determined by the bibliography package and style.\n\n```latex\nAs shown by \\cite{knuth1984}, typography matters.\n```\n\nThe key must exist in the configured bibliography database. [LaTeX citations](https://latexref.xyz/Citations.html)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
