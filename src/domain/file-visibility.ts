import type { HiddenFileRule, HiddenFileRuleKind } from "@/domain/project"

export const MAX_HIDDEN_FILE_RULES = 128
export const MAX_HIDDEN_FILE_RULE_LENGTH = 64

/**
 * The build artifacts TeX hides out of the box. These are only a default: every
 * rule is listed in Settings and can be removed, so nothing on disk is ever
 * permanently invisible.
 */
export const defaultHiddenFileRules: ReadonlyArray<HiddenFileRule> = [
  "aux",
  "bbl",
  "bcf",
  "blg",
  "fdb_latexmk",
  "fls",
  "glg",
  "glo",
  "gls",
  "idx",
  "ilg",
  "ind",
  "lof",
  "log",
  "lot",
  "nav",
  "out",
  "run.xml",
  "snm",
  "synctex",
  "synctex.gz",
  "toc",
].map((value) => ({ kind: "extension", value }) as const)

/** Identifies a rule for de-duplication; kind and value together are the identity. */
export function hiddenFileRuleKey(rule: HiddenFileRule): string {
  return `${rule.kind}:${rule.value.toLowerCase()}`
}

/** Renders a rule the way a user would recognise it in a file listing. */
export function hiddenFileRuleLabel(rule: HiddenFileRule): string {
  return rule.kind === "extension" ? `.${rule.value}` : rule.value
}

/**
 * Accepts the shapes people actually type — `.log`, `*.log`, `log` — and reduces
 * them to one canonical form so the same rule cannot be added twice. Returns
 * null when the input cannot become a usable rule.
 */
export function normalizeHiddenFileRule(
  kind: HiddenFileRuleKind,
  value: string
): HiddenFileRule | null {
  const trimmed =
    kind === "extension"
      ? value
          .trim()
          .replace(/^\*?\./, "")
          .toLowerCase()
      : value.trim()
  if (
    trimmed === "" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.length > MAX_HIDDEN_FILE_RULE_LENGTH ||
    /[/\\]/.test(trimmed)
  ) {
    return null
  }
  return { kind, value: trimmed }
}

/** Drops duplicates and anything that no longer normalizes, preserving order. */
export function normalizeHiddenFileRules(
  rules: ReadonlyArray<HiddenFileRule>
): HiddenFileRule[] {
  const seen = new Set<string>()
  const normalized: HiddenFileRule[] = []
  for (const rule of rules) {
    const candidate = normalizeHiddenFileRule(rule.kind, rule.value)
    if (candidate === null) continue
    const key = hiddenFileRuleKey(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(candidate)
    if (normalized.length === MAX_HIDDEN_FILE_RULES) break
  }
  return normalized
}

export type HiddenEntryPredicate = (name: string) => boolean

/**
 * Builds the predicate the project tree uses to decide what to leave out. Rules
 * are pre-bucketed so matching each entry costs one set lookup plus one pass
 * over the extension rules rather than a scan of the whole rule list.
 */
export function createHiddenEntryPredicate(
  rules: ReadonlyArray<HiddenFileRule>,
  enabled: boolean
): HiddenEntryPredicate {
  if (!enabled || rules.length === 0) return () => false
  const names = new Set<string>()
  const suffixes: string[] = []
  for (const rule of rules) {
    if (rule.kind === "name") names.add(rule.value.toLowerCase())
    else suffixes.push(`.${rule.value.toLowerCase()}`)
  }
  return (name: string): boolean => {
    const lowered = name.toLowerCase()
    if (names.has(lowered)) return true
    return suffixes.some(
      (suffix) => lowered.length > suffix.length && lowered.endsWith(suffix)
    )
  }
}
