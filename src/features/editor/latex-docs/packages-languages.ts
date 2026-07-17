import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesLanguages = {
  academicons: packageEntry(
    "academicons",
    "Provides icons for academic and scholarly services."
  ),
  babel: packageEntry(
    "babel",
    "Configures language-aware hyphenation, captions, and typography.",
    "\n\nSelect languages in package options and follow its engine-specific guidance."
  ),
  beramono: packageEntry("beramono", "Provides the Bera Mono typewriter font."),
  berasans: packageEntry("berasans", "Provides the Bera Sans font."),
  cabin: packageEntry("cabin", "Provides the Cabin sans-serif font family."),
  "cfr-lm": packageEntry(
    "cfr-lm",
    "Provides extended Latin Modern font support."
  ),
  cmap: packageEntry(
    "cmap",
    "Improves character mapping for PDF copy, search, and accessibility."
  ),
  "cm-super": packageEntry(
    "cm-super",
    "Provides Type 1 versions of Computer Modern fonts."
  ),
  courier: packageEntry("courier", "Selects the Courier typewriter font."),
  dejavu: packageEntry("dejavu", "Provides DejaVu font-family support."),
  ebgaramond: packageEntry("ebgaramond", "Provides the EB Garamond text font."),
  fontawesome5: packageEntry(
    "fontawesome5",
    "Provides Font Awesome 5 icons for documents."
  ),
  fontenc: packageEntry(
    "fontenc",
    "Selects output font encodings for pdfLaTeX documents.",
    "\n\nFor example: `\\usepackage[T1]{fontenc}`."
  ),
  fontspec: packageEntry(
    "fontspec",
    "Selects system and OpenType fonts with XeLaTeX or LuaLaTeX.",
    "\n\nDo not use it with pdfLaTeX."
  ),
  fourier: packageEntry(
    "fourier",
    "Provides Utopia text fonts and matching mathematics."
  ),
  helvet: packageEntry("helvet", "Selects a Helvetica-like sans-serif font."),
  inconsolata: packageEntry(
    "inconsolata",
    "Provides the Inconsolata monospaced font."
  ),
  inputenc: packageEntry(
    "inputenc",
    "Configures input encoding for legacy pdfLaTeX documents.",
    "\n\nModern LaTeX defaults to UTF-8; XeLaTeX and LuaLaTeX do not use it."
  ),
  kpfonts: packageEntry(
    "kpfonts",
    "Provides the KP Fonts text and mathematics family."
  ),
  libertine: packageEntry(
    "libertine",
    "Provides Linux Libertine text fonts and related support."
  ),
  "libertinus-type1": packageEntry(
    "libertinus-type1",
    "Provides Type 1 Libertinus fonts for pdfLaTeX."
  ),
  lmodern: packageEntry("lmodern", "Selects the Latin Modern font family."),
  mathptmx: packageEntry(
    "mathptmx",
    "Selects Times-like text and mathematics fonts."
  ),
  newpxmath: packageEntry(
    "newpxmath",
    "Provides Palatino-like mathematics designed for `newpxtext`."
  ),
  newpxtext: packageEntry(
    "newpxtext",
    "Provides a Palatino-like text font family."
  ),
  newtxmath: packageEntry(
    "newtxmath",
    "Provides Times-like mathematics designed for `newtxtext`."
  ),
  newtxtext: packageEntry(
    "newtxtext",
    "Provides a Times-like text font family."
  ),
  noto: packageEntry("noto", "Provides Noto font-family support."),
  polyglossia: packageEntry(
    "polyglossia",
    "Configures multilingual typography for XeLaTeX and LuaLaTeX.",
    "\n\nUse it instead of `babel` where its engine-specific workflow is required."
  ),
  roboto: packageEntry("roboto", "Provides the Roboto font family."),
  selnolig: packageEntry(
    "selnolig",
    "Suppresses selected typographic ligatures in text."
  ),
  sourcecodepro: packageEntry(
    "sourcecodepro",
    "Provides the Source Code Pro monospaced font."
  ),
  sourcesanspro: packageEntry(
    "sourcesanspro",
    "Provides the Source Sans Pro font family."
  ),
  times: packageEntry(
    "times",
    "Selects Times, Helvetica, and Courier-like legacy fonts."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
