import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"
import { mergeRecords } from "@/features/editor/latex-docs/merge"
import { commandsStructure } from "@/features/editor/latex-docs/commands-structure"
import { commandsText } from "@/features/editor/latex-docs/commands-text"
import { commandsMath } from "@/features/editor/latex-docs/commands-math"
import { commandsFloats } from "@/features/editor/latex-docs/commands-floats"
import { commandsBibliography } from "@/features/editor/latex-docs/commands-bibliography"
import { commandsBeamer } from "@/features/editor/latex-docs/commands-beamer"
import { documentClasses } from "@/features/editor/latex-docs/document-classes"
import { packagesCore } from "@/features/editor/latex-docs/packages-core"
import { packagesMath } from "@/features/editor/latex-docs/packages-math"
import { packagesBibliography } from "@/features/editor/latex-docs/packages-bibliography"
import { packagesLayout } from "@/features/editor/latex-docs/packages-layout"
import { packagesLanguages } from "@/features/editor/latex-docs/packages-languages"
import { packagesScience } from "@/features/editor/latex-docs/packages-science"
import { packagesPresentation } from "@/features/editor/latex-docs/packages-presentation"

export type { LatexDocumentation }

type DocumentationCatalog = Readonly<{
  commands: Readonly<Record<string, LatexDocumentation>>
  documentClasses: Readonly<Record<string, LatexDocumentation>>
  packages: Readonly<Record<string, LatexDocumentation>>
}>

const commands = mergeRecords(
  commandsStructure,
  commandsText,
  commandsMath,
  commandsFloats,
  commandsBibliography,
  commandsBeamer
)

const packages = mergeRecords(
  packagesCore,
  packagesMath,
  packagesBibliography,
  packagesLayout,
  packagesLanguages,
  packagesScience,
  packagesPresentation
)

export const latexDocumentation: DocumentationCatalog = Object.freeze({
  commands: Object.freeze(commands),
  documentClasses: Object.freeze(mergeRecords(documentClasses)),
  packages: Object.freeze(packages),
})

export function commandDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.commands[name]
}

export function documentClassDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.documentClasses[name]
}

export function packageDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.packages[name]
}
