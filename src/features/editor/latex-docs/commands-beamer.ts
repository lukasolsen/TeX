import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsBeamer = {} as const satisfies Readonly<
  Record<string, LatexDocumentation>
>
