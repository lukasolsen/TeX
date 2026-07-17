import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const packagesPresentation = {} as const satisfies Readonly<
  Record<string, LatexDocumentation>
>
