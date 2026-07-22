import {
  useMemo,
  useState,
  type ReactElement,
  type SyntheticEvent,
} from "react"
import { EyeOff, FileType, Hash, Plus, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { HiddenFileRule, HiddenFileRuleKind } from "@/domain/project"
import {
  hiddenFileRuleKey,
  hiddenFileRuleLabel,
  MAX_HIDDEN_FILE_RULES,
  MAX_HIDDEN_FILE_RULE_LENGTH,
  normalizeHiddenFileRule,
} from "@/domain/file-visibility"
import { SegmentedChoice } from "@/features/settings/settings-controls"
import type { AddHiddenFileRuleResult } from "@/features/settings/use-app-preferences"
import { cn } from "@/lib/utils"

const kindOptions: ReadonlyArray<{
  value: HiddenFileRuleKind
  label: string
  hint: string
  icon: typeof Hash
  placeholder: string
}> = [
  {
    value: "extension",
    label: "Extension",
    hint: "Hides every file ending in this extension.",
    icon: Hash,
    placeholder: "log",
  },
  {
    value: "name",
    label: "Exact name",
    hint: "Hides only files or folders with this exact name.",
    icon: FileType,
    placeholder: "main.aux",
  },
]

function RuleChip({
  onRemove,
  rule,
}: {
  onRemove: () => void
  rule: HiddenFileRule
}): ReactElement {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-sm border bg-background pr-0.5 pl-2 font-mono text-xs">
      {hiddenFileRuleLabel(rule)}
      <button
        aria-label={`Stop hiding ${hiddenFileRuleLabel(rule)}`}
        className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onRemove}
        type="button"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  )
}

/**
 * Editor for the project-tree visibility rules. Deliberately phrased around
 * *showing and hiding* rather than deleting: nothing here touches disk, and the
 * copy has to make that unmistakable.
 */
export function FileFilterSettings({
  hiddenInProject,
  onAddRule,
  onRemoveRule,
  onReset,
  rules,
}: {
  hiddenInProject: number | null
  onAddRule: (rule: HiddenFileRule) => AddHiddenFileRuleResult
  onRemoveRule: (rule: HiddenFileRule) => void
  onReset: () => void
  rules: ReadonlyArray<HiddenFileRule>
}): ReactElement {
  const [kind, setKind] = useState<HiddenFileRuleKind>("extension")
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const activeKind = kindOptions.find((option) => option.value === kind)
  const extensions = useMemo(
    () => rules.filter((rule) => rule.kind === "extension"),
    [rules]
  )
  const names = useMemo(
    () => rules.filter((rule) => rule.kind === "name"),
    [rules]
  )

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const rule = normalizeHiddenFileRule(kind, draft)
    if (rule === null) {
      setError(
        draft.trim() === ""
          ? "Enter a value to add a rule."
          : "A rule cannot be empty, contain a slash, or exceed " +
              `${MAX_HIDDEN_FILE_RULE_LENGTH} characters.`
      )
      return
    }
    const result = onAddRule(rule)
    if (result === "duplicate") {
      setError(`${hiddenFileRuleLabel(rule)} is already in the list.`)
      return
    }
    if (result === "full") {
      setError(`You can keep up to ${MAX_HIDDEN_FILE_RULES} rules.`)
      return
    }
    setDraft("")
    setError(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-col gap-1.5" onSubmit={submit}>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedChoice
            label="Rule type"
            onChange={(value) => {
              setKind(value)
              setError(null)
            }}
            options={kindOptions}
            value={kind}
          />
          <div className="relative min-w-36 flex-1">
            {kind === "extension" ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground"
              >
                .
              </span>
            ) : null}
            <Input
              aria-label={
                kind === "extension" ? "File extension" : "Exact file name"
              }
              className={cn(
                "h-7 bg-background font-mono text-xs",
                kind === "extension" && "pl-5"
              )}
              maxLength={MAX_HIDDEN_FILE_RULE_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value)
                setError(null)
              }}
              placeholder={activeKind?.placeholder}
              spellCheck={false}
              value={draft}
            />
          </div>
          <Button size="sm" type="submit" variant="outline">
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </div>
        <p
          className={cn(
            "text-xs",
            error === null ? "text-muted-foreground" : "text-destructive"
          )}
          role={error === null ? undefined : "alert"}
        >
          {error ?? activeKind?.hint}
        </p>
      </form>

      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No rules yet — every file in your projects is listed.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {[
            { label: "Extensions", items: extensions },
            { label: "Exact names", items: names },
          ].map((bucket) =>
            bucket.items.length === 0 ? null : (
              <div key={bucket.label}>
                <p className="mb-1.5 text-meta tracking-wide text-muted-foreground uppercase">
                  {bucket.label} · {bucket.items.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  {bucket.items.map((rule) => (
                    <RuleChip
                      key={hiddenFileRuleKey(rule)}
                      onRemove={() => onRemoveRule(rule)}
                      rule={rule}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {hiddenInProject !== null ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <EyeOff aria-hidden="true" className="size-3.5" />
            {hiddenInProject === 0
              ? "Nothing is hidden in the open project."
              : hiddenInProject === 1
                ? "Hiding 1 item in the open project."
                : `Hiding ${hiddenInProject} items in the open project.`}
          </p>
        ) : null}
        <Button className="ml-auto" onClick={onReset} size="sm" variant="ghost">
          <RotateCcw data-icon="inline-start" />
          Restore default rules
        </Button>
      </div>
    </div>
  )
}
