import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesLayout = {
  booktabs: entry(
    "booktabs",
    "Provides well-spaced table rules such as `\\toprule`, `\\midrule`, and `\\bottomrule`.\n\n```latex\n\\usepackage{booktabs}\n```\n\nAvoid vertical rules and double rules when following its typography guidance. [booktabs on CTAN](https://ctan.org/pkg/booktabs)"
  ),
  subcaption: entry(
    "subcaption",
    "Creates subfigures and subcaptions within figure or table floats.\n\n```latex\n\\usepackage{subcaption}\n```\n\nIt replaces older subfigure packages; check class compatibility for caption styling. [subcaption on CTAN](https://ctan.org/pkg/subcaption)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
