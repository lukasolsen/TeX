import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsFloats = {
  captionsetup: entry(
    "\\captionsetup",
    "Configures caption formatting for figures, tables, and other floats. It is supplied by the `caption` package.\n\n```latex\n\\usepackage{caption}\n\\captionsetup{font=small,labelfont=bf}\n```\n\nLoad it after the document class and before any floats. [caption on CTAN](https://ctan.org/pkg/caption)"
  ),
  includegraphics: entry(
    "\\includegraphics",
    "Places an image asset; it is supplied by the `graphicx` package and is normally used in the document body.\n\n```latex\n\\includegraphics[width=0.8\\linewidth]{figures/result.pdf}\n```\n\nLoad `graphicx` and keep paths relative to the source file. [graphicx on CTAN](https://ctan.org/pkg/graphicx)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
