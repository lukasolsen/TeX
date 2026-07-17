import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesBibliography = {
  apacite: packageEntry(
    "apacite",
    "Formats citations and bibliographies according to APA conventions."
  ),
  backref: packageEntry(
    "backref",
    "Adds back-reference lists from bibliography entries to citing pages.",
    "\n\nLoad it through `hyperref` options or with compatible bibliography tooling."
  ),
  bibentry: packageEntry(
    "bibentry",
    "Prints complete bibliography entries inline in document text."
  ),
  biblatex: packageEntry(
    "biblatex",
    "Provides a modern bibliography and citation interface, commonly with Biber.",
    "\n\n```latex\n\\usepackage[backend=biber,style=authoryear]{biblatex}\n\\addbibresource{references.bib}\n```\n\nUse `\\addbibresource` and `\\printbibliography`; configure the build to run the selected backend. Do not combine it with `natbib` or a separate `\\bibliographystyle`/`\\bibliography` workflow."
  ),
  "biblatex-apa": entry(
    "biblatex-apa",
    "Supplies APA citation and bibliography styles for `biblatex`.\n\nLoad the style through `biblatex`:\n\n```latex\n\\usepackage[style=apa]{biblatex}\n```\n\n[biblatex-apa on CTAN](https://ctan.org/pkg/biblatex-apa)"
  ),
  "biblatex-chicago": packageEntry(
    "biblatex-chicago",
    "Supplies Chicago-style citation and bibliography styles for `biblatex`."
  ),
  "biblatex-ieee": entry(
    "biblatex-ieee",
    "Supplies IEEE bibliography styles for `biblatex`.\n\nLoad the style through `biblatex`:\n\n```latex\n\\usepackage[style=ieee]{biblatex}\n```\n\n[biblatex-ieee on CTAN](https://ctan.org/pkg/biblatex-ieee)"
  ),
  chapterbib: packageEntry(
    "chapterbib",
    "Creates separate bibliographies for included chapters."
  ),
  cleveref: packageEntry(
    "cleveref",
    "Formats cross-references with their type and handles multiple references.",
    "\n\n```latex\n\\usepackage{hyperref}\n\\usepackage{cleveref}\n% \\cref{fig:result,tab:measurements}\n```\n\nLoad it late, normally after `hyperref`, because it integrates with labels and hyperlinks. Use its `\\cref` commands consistently instead of manually writing reference types."
  ),
  csquotes: packageEntry(
    "csquotes",
    "Provides language-aware quotation commands, especially for `biblatex`."
  ),
  doi: packageEntry("doi", "Formats Digital Object Identifiers as hyperlinks."),
  harvard: packageEntry(
    "harvard",
    "Provides author-year citation commands for BibTeX workflows."
  ),
  inlinebib: packageEntry(
    "inlinebib",
    "Inserts bibliographic entries directly into document text."
  ),
  jurabib: packageEntry(
    "jurabib",
    "Provides BibTeX citation support for legal and humanities writing."
  ),
  multibib: packageEntry(
    "multibib",
    "Creates multiple bibliographies and citation command sets."
  ),
  natbib: packageEntry(
    "natbib",
    "Extends BibTeX citations with author-year and numeric styles.",
    "\n\nUse it with a BibTeX workflow, not together with `biblatex`."
  ),
  splitbib: packageEntry(
    "splitbib",
    "Groups bibliography entries into categories in the printed bibliography."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
