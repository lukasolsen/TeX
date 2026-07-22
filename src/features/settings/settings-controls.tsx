import { useId, type ReactElement, type ReactNode } from "react"
import { Check, Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  isSectionModified,
  sectionOf,
  type SettingsSectionId,
} from "@/features/settings/settings-catalog"
import type { AppPreferences } from "@/domain/preferences"

/**
 * A heading inside the settings pane. Sections are separated by their heading
 * and spacing alone: no card, no border, so the pane reads as one document.
 */
export function SettingsHeading({
  children,
  onReset,
  preferences,
  section,
}: {
  children: string
  onReset?: () => void
  preferences: AppPreferences
  section: SettingsSectionId
}): ReactElement {
  const definition = sectionOf(section)
  const canReset = onReset !== undefined && definition.resets !== null
  return (
    <div className="flex h-8 items-center justify-between gap-3 pt-6 first:pt-0">
      <h2
        className="text-base font-semibold"
        id={`settings-heading-${section}`}
      >
        {children}
      </h2>
      {canReset && isSectionModified(section, preferences) ? (
        <Button onClick={onReset} size="sm" variant="ghost">
          Restore defaults
        </Button>
      ) : null}
    </div>
  )
}

/**
 * One setting.
 *
 * `inline` puts the control on the right of the label, the way a short choice
 * or a switch reads best; `stacked` puts a wide control underneath. Rows are
 * separated by a hairline rule rather than by boxes.
 */
export function SettingRow({
  children,
  description,
  footer,
  layout = "inline",
  title,
}: {
  children: ReactNode
  description?: ReactNode
  /** Full-width content beneath the row, such as a preview of the choice. */
  footer?: ReactNode
  layout?: "inline" | "stacked"
  title: string
}): ReactElement {
  return (
    <div className="border-b border-border/60 py-4 last:border-b-0">
      <div
        className={cn(
          "flex gap-4",
          layout === "inline"
            ? "items-center justify-between"
            : "flex-col items-stretch"
        )}
      >
        <div className="min-w-0">
          <h3 className="text-sm">{title}</h3>
          {description !== undefined ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "shrink-0",
            layout === "stacked" && "w-full min-w-0 shrink"
          )}
        >
          {children}
        </div>
      </div>
      {footer === undefined ? null : <div className="mt-3">{footer}</div>}
    </div>
  )
}

/**
 * An on/off switch. A native checkbox keeps keyboard and screen-reader
 * behaviour correct; the track and thumb are decoration over it.
 */
export function Toggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <label
      className={cn(
        "relative inline-flex shrink-0 items-center",
        disabled ? "opacity-50" : "cursor-pointer"
      )}
    >
      <input
        aria-label={label}
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors duration-100 motion-reduce:transition-none",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          checked ? "border-primary bg-primary" : "border-transparent bg-muted"
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-background shadow-raised transition-transform duration-100 motion-reduce:transition-none",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
    </label>
  )
}

export type ChoiceOption<T extends string> = Readonly<{
  value: T
  label: string
  hint?: string
  icon?: typeof Check
}>

/**
 * A compact segmented control. Options that are self-evident show only their
 * icon, with the name carried by the accessible label and the tooltip.
 */
export function SegmentedChoice<T extends string>({
  compact = false,
  label,
  onChange,
  options,
  value,
}: {
  compact?: boolean
  label: string
  onChange: (value: T) => void
  options: ReadonlyArray<ChoiceOption<T>>
  value: T
}): ReactElement {
  return (
    <div
      aria-label={label}
      className="inline-flex rounded-md border bg-background p-0.5"
      role="group"
    >
      {options.map((option) => {
        const Icon = option.icon
        const selected = value === option.value
        return (
          <button
            aria-label={compact ? option.label : undefined}
            aria-pressed={selected}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-sm text-xs transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              compact ? "w-7 justify-center" : "px-2.5",
              selected
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={compact ? option.label : undefined}
            type="button"
          >
            {Icon === undefined ? null : (
              <Icon aria-hidden="true" className="size-3.5" />
            )}
            {compact ? null : option.label}
          </button>
        )
      })}
    </div>
  )
}

/** A bounded numeric setting with keyboard-operable step buttons. */
export function Stepper({
  disabled = false,
  format,
  label,
  maximum,
  minimum,
  onChange,
  step = 1,
  value,
}: {
  disabled?: boolean
  format: (value: number) => string
  label: string
  maximum: number
  minimum: number
  onChange: (value: number) => void
  step?: number
  value: number
}): ReactElement {
  const bounded = (next: number) =>
    Math.round(Math.min(maximum, Math.max(minimum, next)) * 100) / 100
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background p-0.5">
      <Button
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= minimum}
        onClick={() => onChange(bounded(value - step))}
        size="icon-xs"
        variant="ghost"
      >
        <Minus aria-hidden="true" />
      </Button>
      <output
        aria-label={label}
        className="min-w-14 text-center text-xs tabular-nums"
      >
        {format(value)}
      </output>
      <Button
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= maximum}
        onClick={() => onChange(bounded(value + step))}
        size="icon-xs"
        variant="ghost"
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}

/** A short labelled field, used where a value is typed rather than chosen. */
export function LabelledField({
  children,
  hint,
  label,
}: {
  children: (id: string) => ReactNode
  hint?: string
  label: string
}): ReactElement {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
