import { useId, useState, type ReactElement } from "react"
import { Search } from "lucide-react"

import {
  highlightMatch,
  searchSettings,
  type SettingsSectionId,
} from "@/features/settings/settings-catalog"
import { cn } from "@/lib/utils"

/**
 * The sidebar search. Matching does not filter the settings pane; it offers the
 * sections that hold a match, so choosing one lands the user on the real
 * control rather than on a stripped-down view of it.
 */
export function SettingsSearch({
  onSelect,
}: {
  onSelect: (section: SettingsSectionId) => void
}): ReactElement {
  const listId = useId()
  const optionId = useId()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const results = searchSettings(query)
  const open = query.trim() !== ""
  const highlighted = Math.min(active, Math.max(0, results.length - 1))

  const choose = (index: number): void => {
    const result = results[index]
    if (result === undefined) return
    onSelect(result.section.id)
    setQuery("")
    setActive(0)
  }

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        aria-activedescendant={
          open && results.length > 0 ? `${optionId}-${highlighted}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-label="Search settings"
        autoComplete="off"
        className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          if (!open) return
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive((index) => (index + 1) % Math.max(1, results.length))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive(
              (index) =>
                (index - 1 + Math.max(1, results.length)) %
                Math.max(1, results.length)
            )
          } else if (event.key === "Enter") {
            event.preventDefault()
            choose(highlighted)
          } else if (event.key === "Escape") {
            // Clears the search without closing the settings dialog behind it.
            event.stopPropagation()
            setQuery("")
          }
        }}
        placeholder="Search"
        role="combobox"
        type="text"
        value={query}
      />

      {open ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-popover">
          {results.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No settings match “{query.trim()}”.
            </p>
          ) : (
            <div aria-label="Search results" id={listId} role="listbox">
              {results.map((result, index) => {
                const Icon = result.section.icon
                const label = highlightMatch(result.section.label, query)
                return (
                  <div
                    aria-selected={index === highlighted}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5",
                      index === highlighted &&
                        "bg-accent text-accent-foreground"
                    )}
                    id={`${optionId}-${index}`}
                    key={result.section.id}
                    onClick={() => choose(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        choose(index)
                      }
                    }}
                    onMouseEnter={() => setActive(index)}
                    role="option"
                    tabIndex={-1}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {label.before}
                        <span className="font-semibold text-primary">
                          {label.match}
                        </span>
                        {label.after}
                      </span>
                      {result.setting !== null ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {result.setting.title}
                        </span>
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
