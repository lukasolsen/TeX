import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsMath = {} as const satisfies Readonly<
  Record<string, LatexDocumentation>
>
