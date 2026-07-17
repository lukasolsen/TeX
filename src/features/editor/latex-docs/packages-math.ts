import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesMath = {
  "aligned-overset": packageEntry(
    "aligned-overset",
    "Aligns overset and underset annotations in aligned mathematics."
  ),
  amsfonts: packageEntry(
    "amsfonts",
    "Provides AMS mathematical fonts, including blackboard-bold symbols."
  ),
  amsmath: packageEntry(
    "amsmath",
    "Adds structured mathematical environments such as `align`, `gather`, and `cases`."
  ),
  amssymb: packageEntry(
    "amssymb",
    "Adds AMS mathematical symbols.",
    "\n\nIt complements `amsmath` and `amsfonts`."
  ),
  amsthm: packageEntry(
    "amsthm",
    "Defines theorem-like environments and proof formatting."
  ),
  bbold: packageEntry("bbold", "Provides blackboard-bold digits and symbols."),
  bm: packageEntry(
    "bm",
    "Makes bold mathematical symbols, including complex expressions."
  ),
  breqn: packageEntry(
    "breqn",
    "Automatically breaks displayed equations across lines."
  ),
  cancel: packageEntry(
    "cancel",
    "Draws cancellation marks through mathematical expressions."
  ),
  diffcoeff: packageEntry(
    "diffcoeff",
    "Formats derivatives and differential coefficients consistently."
  ),
  doublestroke: entry(
    "doublestroke",
    "Provides double-stroked mathematical symbols.\n\nThe `doublestroke` distribution provides `dsfont.sty`; load that package instead:\n\n```latex\n\\usepackage{dsfont}\n```\n\n[doublestroke on CTAN](https://ctan.org/pkg/doublestroke)"
  ),
  dsfont: packageEntry(
    "dsfont",
    "Provides doubled-stroke fonts for mathematical notation."
  ),
  empheq: packageEntry(
    "empheq",
    "Emphasizes and decorates equations built on `amsmath`."
  ),
  esint: packageEntry("esint", "Adds extended integral symbols."),
  extarrows: packageEntry(
    "extarrows",
    "Provides extensible arrows for mathematical displays."
  ),
  gensymb: packageEntry(
    "gensymb",
    "Supplies generic symbols such as degree and ohm."
  ),
  mathabx: packageEntry(
    "mathabx",
    "Adds a large collection of mathematical symbols."
  ),
  mathrsfs: packageEntry("mathrsfs", "Provides a formal script math alphabet."),
  mathtools: packageEntry(
    "mathtools",
    "Extends `amsmath` with equation-layout and notation improvements."
  ),
  nicematrix: packageEntry(
    "nicematrix",
    "Creates matrices and arrays with advanced drawing and alignment features."
  ),
  physics: packageEntry(
    "physics",
    "Defines shorthand macros for common physics notation."
  ),
  rsfso: packageEntry("rsfso", "Provides an alternate script math alphabet."),
  stmaryrd: packageEntry(
    "stmaryrd",
    "Adds specialized symbols, including brackets and relations."
  ),
  tensor: packageEntry(
    "tensor",
    "Typesets tensor indices in a consistent position."
  ),
  textcomp: packageEntry(
    "textcomp",
    "Provides text companion symbols in text and math contexts."
  ),
  "unicode-math": packageEntry(
    "unicode-math",
    "Selects Unicode OpenType math fonts with XeLaTeX or LuaLaTeX.",
    "\n\nDo not use it with pdfLaTeX; load it after `fontspec` when both are needed."
  ),
  wasysym: packageEntry(
    "wasysym",
    "Adds Wasysym symbols for text and mathematics."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
