import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesMath = {
  amsmath: entry(
    "amsmath",
    "Adds professional mathematical environments such as `align`, `gather`, and `cases`.\n\n```latex\n\\usepackage{amsmath}\n```\n\nPrefer its structured environments over manual alignment with spaces. [amsmath on CTAN](https://ctan.org/pkg/amsmath)"
  ),
  amssymb: entry(
    "amssymb",
    "Adds many mathematical symbols, including blackboard-bold and relation symbols.\n\n```latex\n\\usepackage{amssymb}\n```\n\nIt complements `amsmath`; use a symbol’s documented math mode. [amssymb on CTAN](https://ctan.org/pkg/amsfonts)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
