import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import {
  arrayValue,
  enumValue,
  integer,
  nonEmptyString,
  nullableString,
  record,
  stringValue,
} from "@/services/ipc-contract"

export type LatexCompletionKind = "command" | "environment" | "snippet"
export type LatexCompletionProvenance = "core" | "package" | "local"

export type LatexCompletionRequest = Readonly<{
  projectPath: CanonicalProjectPath
  relativePath: ProjectRelativePath
  content: string
  position: number
}>

export type LatexCompletionItem = Readonly<{
  label: string
  detail: string
  kind: LatexCompletionKind
  provenance: LatexCompletionProvenance
  requires: string | null
  from: number
  to: number
  insertText: string
}>

export type LatexCompletionResponse = Readonly<{
  items: ReadonlyArray<LatexCompletionItem>
}>

export function parseLatexCompletionResponse(
  value: unknown
): LatexCompletionResponse {
  const input = record(value, "LaTeX completion response")
  return {
    items: arrayValue(input.items, "LaTeX completion items", 64, (value) => {
      const item = record(value, "LaTeX completion item")
      const from = integer(item.from, "LaTeX completion start", 0, 2 * 1024 * 1024)
      const to = integer(item.to, "LaTeX completion end", from, 2 * 1024 * 1024)
      return {
        label: nonEmptyString(item.label, "LaTeX completion label", 512),
        detail: stringValue(item.detail, "LaTeX completion detail", 4_096),
        kind: enumValue(item.kind, "LaTeX completion kind", [
          "command",
          "environment",
          "snippet",
        ]),
        provenance: enumValue(item.provenance, "LaTeX completion provenance", [
          "core",
          "package",
          "local",
        ]),
        requires: nullableString(item.requires, "LaTeX completion requirement", 128),
        from,
        to,
        insertText: nonEmptyString(item.insertText, "LaTeX completion insertion", 16_384),
      }
    }),
  }
}
