import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesScience = {
  acro: packageEntry(
    "acro",
    "Defines and manages acronyms with configurable output styles."
  ),
  acronym: packageEntry(
    "acronym",
    "Defines acronym lists and first-use expansion."
  ),
  algorithm: packageEntry(
    "algorithm",
    "Provides a floating environment for algorithms."
  ),
  algorithm2e: packageEntry(
    "algorithm2e",
    "Typesets algorithms with a configurable pseudocode interface."
  ),
  algorithmicx: packageEntry(
    "algorithmicx",
    "Provides a flexible framework for algorithmic pseudocode layouts."
  ),
  algpseudocode: packageEntry(
    "algpseudocode",
    "Supplies an `algorithmicx` pseudocode layout."
  ),
  bytefield: packageEntry(
    "bytefield",
    "Draws bit fields and protocol packet diagrams."
  ),
  catchfile: packageEntry("catchfile", "Reads file contents into macros."),
  chemfig: packageEntry(
    "chemfig",
    "Draws chemical structures and reaction schemes."
  ),
  chemformula: packageEntry(
    "chemformula",
    "Typesets chemical formulae and reactions."
  ),
  circuitikz: packageEntry(
    "circuitikz",
    "Draws electrical circuits using TikZ."
  ),
  csvsimple: packageEntry(
    "csvsimple",
    "Reads CSV data for tabular and document output."
  ),
  datatool: packageEntry(
    "datatool",
    "Stores, queries, and displays structured data in LaTeX."
  ),
  elements: packageEntry(
    "elements",
    "Typesets chemical elements and related data."
  ),
  filecontents: packageEntry(
    "filecontents",
    "Creates external files from document content."
  ),
  forest: packageEntry(
    "forest",
    "Draws trees and related hierarchical diagrams."
  ),
  fvextra: packageEntry(
    "fvextra",
    "Extends FancyVerb verbatim environments and options."
  ),
  gb4e: packageEntry("gb4e", "Typesets linguistic examples and glosses."),
  glossaries: packageEntry(
    "glossaries",
    "Creates glossaries, acronyms, and symbol lists.",
    "\n\nIt requires an external indexing step for most workflows."
  ),
  "glossaries-extra": packageEntry(
    "glossaries-extra",
    "Extends `glossaries` with additional styles and commands."
  ),
  imakeidx: packageEntry(
    "imakeidx",
    "Automates index generation from a LaTeX document."
  ),
  linguex: packageEntry("linguex", "Typesets numbered linguistic examples."),
  listings: packageEntry(
    "listings",
    "Typesets source-code listings without executing code."
  ),
  listingsutf8: packageEntry(
    "listingsutf8",
    "Adds UTF-8 input support to `listings`."
  ),
  makeidx: packageEntry("makeidx", "Provides basic index-entry commands."),
  mhchem: packageEntry(
    "mhchem",
    "Typesets chemical formulae and equations with `\\ce`."
  ),
  minted: packageEntry(
    "minted",
    "Typesets syntax-highlighted code using Pygments.",
    "\n\nIt needs shell escape and a local Pygments installation; enable it only for trusted projects."
  ),
  nameref: packageEntry(
    "nameref",
    "References the title text associated with a label."
  ),
  nomencl: packageEntry("nomencl", "Creates a nomenclature or symbol list."),
  "pgf-pie": packageEntry("pgf-pie", "Draws pie charts using PGF/TikZ."),
  pgfplots: packageEntry(
    "pgfplots",
    "Creates function plots and data visualisations using PGF/TikZ."
  ),
  pgfplotstable: packageEntry(
    "pgfplotstable",
    "Reads, formats, and plots tabular data with PGFPlots."
  ),
  pythontex: packageEntry(
    "pythontex",
    "Runs Python and other code to generate document content.",
    "\n\nIt requires an external execution step; use only in trusted projects."
  ),
  siunitx: packageEntry(
    "siunitx",
    "Formats numbers, units, and quantities consistently according to SI conventions."
  ),
  smartdiagram: packageEntry(
    "smartdiagram",
    "Creates common diagram layouts from concise input."
  ),
  tikz: packageEntry("tikz", "Draws vector graphics and diagrams in LaTeX."),
  "tikz-cd": packageEntry("tikz-cd", "Draws commutative diagrams using TikZ."),
  tipa: packageEntry(
    "tipa",
    "Provides phonetic symbols and fonts for linguistics."
  ),
  varioref: packageEntry(
    "varioref",
    "Adds context-aware page references such as “on the next page”."
  ),
  xr: packageEntry("xr", "Imports labels from external LaTeX documents."),
  "xr-hyper": packageEntry(
    "xr-hyper",
    "Combines external-document references with Hyperref links."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
