import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesLanguages = {
  babel: entry(
    "babel",
    "Configures language-aware hyphenation, captions, and typography for pdfLaTeX and many other workflows.\n\n```latex\n\\usepackage[english]{babel}\n```\n\nChoose languages and engine-specific guidance from its manual. [babel on CTAN](https://ctan.org/pkg/babel)"
  ),
  fontspec: entry(
    "fontspec",
    "Selects system and OpenType fonts when compiling with XeLaTeX or LuaLaTeX.\n\n```latex\n\\usepackage{fontspec}\n```\n\nDo not use it with pdfLaTeX; choose an engine before setting fonts. [fontspec on CTAN](https://ctan.org/pkg/fontspec)"
  ),
  inputenc: entry(
    "inputenc",
    "Configures input encoding for legacy pdfLaTeX documents.\n\n```latex\n\\usepackage[utf8]{inputenc}\n```\n\nModern LaTeX defaults to UTF-8, and XeLaTeX/LuaLaTeX do not use this package. [inputenc on CTAN](https://ctan.org/pkg/inputenc)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
