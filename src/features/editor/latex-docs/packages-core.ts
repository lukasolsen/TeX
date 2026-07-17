import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesCore = {
  adjustbox: packageEntry(
    "adjustbox",
    "Resizes, trims, clips, and otherwise adjusts boxed content."
  ),
  afterpage: packageEntry(
    "afterpage",
    "Delays material until the current page has shipped out."
  ),
  animate: packageEntry(
    "animate",
    "Embeds frame-based animations in supported PDF viewers."
  ),
  attachfile: packageEntry(
    "attachfile",
    "Attaches external files to a PDF document."
  ),
  blindtext: packageEntry(
    "blindtext",
    "Generates placeholder text and document structure for layout testing."
  ),
  bookmark: packageEntry(
    "bookmark",
    "Creates PDF bookmarks more robustly than Hyperref’s default interface.",
    "\n\nLoad it after `hyperref`."
  ),
  calc: packageEntry(
    "calc",
    "Extends LaTeX length expressions with arithmetic."
  ),
  collectbox: packageEntry(
    "collectbox",
    "Collects content into a box for reuse or transformation."
  ),
  draftwatermark: packageEntry(
    "draftwatermark",
    "Places a configurable watermark behind document pages."
  ),
  embedfile: packageEntry(
    "embedfile",
    "Embeds arbitrary files into a PDF document."
  ),
  enumitem: packageEntry(
    "enumitem",
    "Customizes list labels, spacing, and indentation."
  ),
  epstopdf: packageEntry(
    "epstopdf",
    "Converts EPS graphics to PDF when the engine and shell-escape policy permit it."
  ),
  "eso-pic": packageEntry(
    "eso-pic",
    "Adds material to every page using picture hooks."
  ),
  etoolbox: packageEntry(
    "etoolbox",
    "Provides robust programming tools and command patching helpers."
  ),
  expl3: packageEntry(
    "expl3",
    "Exposes the LaTeX3 programming layer for package authors."
  ),
  fancyvrb: packageEntry(
    "fancyvrb",
    "Provides flexible verbatim environments and customisation."
  ),
  geometry: packageEntry(
    "geometry",
    "Configures page size and margins with a key-value interface."
  ),
  graphicx: packageEntry(
    "graphicx",
    "Enables `\\includegraphics` and graphic scaling, rotation, and clipping."
  ),
  grffile: packageEntry(
    "grffile",
    "Improves graphic-file name handling in older LaTeX workflows."
  ),
  hypcap: packageEntry(
    "hypcap",
    "Makes hyperlinks to floats target their captions rather than their contents.",
    "\n\nLoad it after `hyperref`."
  ),
  hyperref: packageEntry(
    "hyperref",
    "Adds PDF hyperlinks, metadata, and link targets.",
    "\n\nLoad it near the end of the preamble unless another package requires otherwise."
  ),
  ifthen: packageEntry(
    "ifthen",
    "Adds simple conditional commands and boolean expressions."
  ),
  import: packageEntry(
    "import",
    "Imports files while managing relative input and graphic paths."
  ),
  kvoptions: packageEntry(
    "kvoptions",
    "Defines and processes package options using key-value syntax."
  ),
  l3keys2e: packageEntry(
    "l3keys2e",
    "Processes LaTeX2e package options with the LaTeX3 key system."
  ),
  lipsum: packageEntry("lipsum", "Generates Lorem Ipsum placeholder text."),
  lscape: packageEntry(
    "lscape",
    "Provides landscape pages without PDF rotation metadata."
  ),
  media9: packageEntry(
    "media9",
    "Embeds rich media annotations for compatible PDF viewers."
  ),
  microtype: packageEntry(
    "microtype",
    "Improves justification through character protrusion and font expansion where supported."
  ),
  mwe: packageEntry(
    "mwe",
    "Supplies example images and test material for document demonstrations."
  ),
  pdflscape: packageEntry(
    "pdflscape",
    "Adds landscape pages with PDF rotation metadata."
  ),
  pdfpages: packageEntry("pdfpages", "Includes pages from external PDF files."),
  rotating: packageEntry(
    "rotating",
    "Rotates floats, figures, tables, and other content."
  ),
  setspace: packageEntry(
    "setspace",
    "Sets single, one-and-a-half, or double line spacing."
  ),
  standalone: packageEntry(
    "standalone",
    "Supports independently compilable document components and cropped output."
  ),
  subfiles: packageEntry(
    "subfiles",
    "Lets component documents compile independently within a parent document."
  ),
  svg: packageEntry(
    "svg",
    "Includes SVG graphics through an external conversion workflow."
  ),
  transparent: packageEntry(
    "transparent",
    "Controls PDF transparency for text and graphics."
  ),
  trimclip: packageEntry("trimclip", "Trims and clips arbitrary TeX material."),
  url: packageEntry("url", "Typesets URLs with sensible line-break handling."),
  xcolor: packageEntry(
    "xcolor",
    "Defines colours and colour models for text, tables, and graphics."
  ),
  xparse: packageEntry(
    "xparse",
    "Provides LaTeX3 document-command argument parsing."
  ),
  xstring: packageEntry(
    "xstring",
    "Offers string testing and manipulation macros."
  ),
  xurl: packageEntry("xurl", "Permits more line-break locations in URLs."),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
