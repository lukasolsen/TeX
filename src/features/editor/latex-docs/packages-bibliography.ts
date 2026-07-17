import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesBibliography = {
  biblatex: entry(
    "biblatex",
    "Provides a modern bibliography and citation interface, usually with Biber as backend.\n\n```latex\n\\usepackage[backend=biber]{biblatex}\n```\n\nUse `\\addbibresource` and `\\printbibliography`, not BibTeX’s `\\bibliography`. [biblatex on CTAN](https://ctan.org/pkg/biblatex)"
  ),
  cleveref: entry(
    "cleveref",
    "Formats cross-references with their type, such as “Figure 1”, and handles multiple references.\n\n```latex\n\\usepackage{cleveref}\n```\n\nLoad it late because it integrates with labels and hyperlinks. [cleveref on CTAN](https://ctan.org/pkg/cleveref)"
  ),
  csquotes: entry(
    "csquotes",
    "Supplies context-sensitive quotation commands, especially useful with `biblatex`.\n\n```latex\n\\usepackage{csquotes}\n```\n\nConfigure language support first so quotation styles match the document language. [csquotes on CTAN](https://ctan.org/pkg/csquotes)"
  ),
  natbib: entry(
    "natbib",
    "Extends BibTeX citation commands with author-year and numeric citation styles.\n\n```latex\n\\usepackage[round]{natbib}\n```\n\nUse it with a BibTeX workflow, not together with `biblatex`. [natbib on CTAN](https://ctan.org/pkg/natbib)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
