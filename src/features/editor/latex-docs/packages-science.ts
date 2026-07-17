import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesScience = {
  siunitx: entry(
    "siunitx",
    "Formats numbers, units, and quantities consistently according to SI conventions.\n\n```latex\n\\usepackage{siunitx}\n```\n\nUse `\\qty{10}{\\metre\\per\\second}` rather than manually spacing units. [siunitx on CTAN](https://ctan.org/pkg/siunitx)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
