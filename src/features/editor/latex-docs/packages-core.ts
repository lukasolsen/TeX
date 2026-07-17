import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesCore = {
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
  microtype: entry(
    "microtype",
    "Improves justification through character protrusion and font expansion where supported.\n\n```latex\n\\usepackage{microtype}\n```\n\nIt is usually safe, but check publisher templates that tightly control typography. [microtype on CTAN](https://ctan.org/pkg/microtype)"
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
