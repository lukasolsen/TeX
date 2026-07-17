import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const packageEntry = (name: string, purpose: string, note = "") =>
  entry(
    name,
    `${purpose}\n\n\`\`\`latex\n\\usepackage{${name}}\n\`\`\`${note}\n\n[${name} on CTAN](https://ctan.org/pkg/${name})`
  )

export const packagesPresentation = {
  appendixnumberbeamer: packageEntry(
    "appendixnumberbeamer",
    "Excludes appendix frames from Beamer’s main frame count."
  ),
  beamerarticle: packageEntry(
    "beamerarticle",
    "Renders Beamer presentation material as an article."
  ),
  beamerposter: packageEntry(
    "beamerposter",
    "Adds poster layouts and sizing options for the Beamer class."
  ),
  multimedia: packageEntry(
    "multimedia",
    "Embeds audio and video controls in supported PDF viewers."
  ),
  pdfcomment: packageEntry(
    "pdfcomment",
    "Adds PDF annotations, comments, and markup."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
