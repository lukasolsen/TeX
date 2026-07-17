import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesLayout = {
  appendix: packageEntry(
    "appendix",
    "Provides tools for formatting appendices."
  ),
  array: packageEntry(
    "array",
    "Extends column definitions and alignment in tabular environments."
  ),
  bigfoot: packageEntry(
    "bigfoot",
    "Improves handling of critical footnotes and multiple footnote apparatuses."
  ),
  booktabs: packageEntry(
    "booktabs",
    "Provides well-spaced table rules such as `\\toprule` and `\\midrule`."
  ),
  caption: packageEntry(
    "caption",
    "Customizes caption layout, fonts, and labels."
  ),
  changepage: packageEntry(
    "changepage",
    "Temporarily changes page layout and paragraph margins."
  ),
  chngcntr: packageEntry(
    "chngcntr",
    "Changes whether counters reset within other counters."
  ),
  colortbl: packageEntry(
    "colortbl",
    "Adds background colours to table cells, rows, and columns."
  ),
  diagbox: packageEntry(
    "diagbox",
    "Creates diagonal splits and slash boxes in table headers."
  ),
  endnotes: packageEntry(
    "endnotes",
    "Collects notes for printing at the end of a document or section."
  ),
  fancybox: packageEntry(
    "fancybox",
    "Provides decorative box styles and commands."
  ),
  fancyhdr: packageEntry("fancyhdr", "Customizes headers and footers."),
  flafter: packageEntry(
    "flafter",
    "Prevents floats from appearing before their textual reference."
  ),
  float: packageEntry(
    "float",
    "Adds float-placement controls and new float types."
  ),
  floatrow: packageEntry(
    "floatrow",
    "Controls float layouts, captions, and object alignment."
  ),
  footmisc: packageEntry(
    "footmisc",
    "Customizes footnote layout, numbering, and placement."
  ),
  footnotebackref: packageEntry(
    "footnotebackref",
    "Adds hyperlinks from footnotes back to their references."
  ),
  framed: packageEntry(
    "framed",
    "Creates framed, shaded, and left-bar environments that can break across pages."
  ),
  gettitlestring: packageEntry(
    "gettitlestring",
    "Extracts title text for use in marks and PDF metadata."
  ),
  hanging: packageEntry(
    "hanging",
    "Provides hanging paragraphs and hanging lists."
  ),
  hhline: packageEntry(
    "hhline",
    "Draws horizontal table rules that respect vertical rules."
  ),
  indentfirst: packageEntry(
    "indentfirst",
    "Indents the first paragraph after section headings."
  ),
  lastpage: packageEntry(
    "lastpage",
    "Labels the final page for total-page references."
  ),
  lettrine: packageEntry(
    "lettrine",
    "Creates dropped capitals at the start of paragraphs."
  ),
  longtable: packageEntry(
    "longtable",
    "Creates tables that may continue across page breaks."
  ),
  makecell: packageEntry(
    "makecell",
    "Simplifies multi-line cells and common table formatting."
  ),
  manyfoot: packageEntry(
    "manyfoot",
    "Defines multiple independent footnote levels."
  ),
  marginnote: packageEntry(
    "marginnote",
    "Places notes in the margin without float restrictions."
  ),
  mdframed: packageEntry(
    "mdframed",
    "Creates customizable framed environments that may break across pages."
  ),
  multicol: packageEntry("multicol", "Typesets balanced multi-column text."),
  multirow: packageEntry(
    "multirow",
    "Creates table cells spanning multiple rows."
  ),
  needspace: packageEntry(
    "needspace",
    "Reserves vertical space before content to avoid awkward page breaks."
  ),
  pageslts: packageEntry(
    "pageslts",
    "Provides labels and counters for page-numbering schemes."
  ),
  parskip: packageEntry(
    "parskip",
    "Adjusts paragraph spacing and indentation for block-style paragraphs."
  ),
  perpage: packageEntry("perpage", "Resets or sorts counters on each page."),
  placeins: packageEntry(
    "placeins",
    "Provides barriers that keep floats within document sections."
  ),
  quoting: packageEntry(
    "quoting",
    "Provides configurable display quotation environments."
  ),
  ragged2e: packageEntry(
    "ragged2e",
    "Offers improved ragged text alignment commands and environments."
  ),
  refcount: packageEntry(
    "refcount",
    "Extracts numeric values from LaTeX references."
  ),
  "scrlayer-scrpage": packageEntry(
    "scrlayer-scrpage",
    "Provides KOMA-Script header and footer layers."
  ),
  sidecap: packageEntry("sidecap", "Places captions beside figures or tables."),
  soul: packageEntry(
    "soul",
    "Provides letter-spaced, underlined, and highlighted text."
  ),
  subcaption: packageEntry(
    "subcaption",
    "Creates subfigures and subcaptions within floats."
  ),
  subfig: packageEntry("subfig", "Provides subfigure and subtable captions."),
  tabularx: packageEntry(
    "tabularx",
    "Creates tables with columns that stretch to a specified width."
  ),
  tabulary: packageEntry(
    "tabulary",
    "Creates width-constrained tables using natural column widths."
  ),
  tcolorbox: packageEntry(
    "tcolorbox",
    "Creates styled, breakable boxes for examples, theorems, and listings."
  ),
  titlesec: packageEntry(
    "titlesec",
    "Customizes section-heading format and spacing."
  ),
  titletoc: packageEntry(
    "titletoc",
    "Customizes table-of-contents entry formatting."
  ),
  tocbibind: packageEntry(
    "tocbibind",
    "Adds bibliography and other lists to the table of contents."
  ),
  tocloft: packageEntry(
    "tocloft",
    "Customizes table-of-contents and list-of-figures layout."
  ),
  todonotes: packageEntry(
    "todonotes",
    "Adds margin and inline notes for drafting."
  ),
  totalcount: packageEntry(
    "totalcount",
    "Counts occurrences of named counters across a document."
  ),
  typearea: packageEntry(
    "typearea",
    "Calculates KOMA-Script page layout and type area."
  ),
  ulem: packageEntry(
    "ulem",
    "Provides underline styles that can break across lines."
  ),
  wrapfig: packageEntry(
    "wrapfig",
    "Wraps paragraph text around figures or tables."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
