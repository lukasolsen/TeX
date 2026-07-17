import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"

export function mergeRecords(
  ...parts: readonly Readonly<Record<string, LatexDocumentation>>[]
): Record<string, LatexDocumentation> {
  const out: Record<string, LatexDocumentation> = {}
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (Object.hasOwn(out, key)) {
        throw new Error(`duplicate documentation key: ${key}`)
      }
      out[key] = value
    }
  }
  return out
}
