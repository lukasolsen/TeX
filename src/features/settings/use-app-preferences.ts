import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { HiddenFileRule } from "@/domain/project"
import {
  defaultAppPreferences,
  interfaceScaleFactor,
  normalizeAppPreferences,
  resetPreferenceSection,
  type AppPreferences,
  type AppearancePreferences,
  type InterfaceScale,
  type PreferenceSection,
} from "@/domain/preferences"
import {
  createHiddenEntryPredicate,
  hiddenFileRuleKey,
  MAX_HIDDEN_FILE_RULES,
  normalizeHiddenFileRules,
  type HiddenEntryPredicate,
} from "@/domain/file-visibility"
import {
  loadAppPreferences,
  saveAppPreferences,
} from "@/services/project-service"
import { createSerialTaskQueue } from "@/lib/serial-task-queue"

export type AddHiddenFileRuleResult = "added" | "duplicate" | "full"

/** A patch for one preference group; the other groups are untouched. */
export type PreferencePatch = {
  [Section in PreferenceSection]?: Partial<AppPreferences[Section]>
}

export type AppPreferencesController = Readonly<{
  preferences: AppPreferences
  isHidden: HiddenEntryPredicate
  saveError: string | null
  update: (patch: PreferencePatch) => void
  resetSection: (section: PreferenceSection) => void
  addHiddenFileRule: (rule: HiddenFileRule) => AddHiddenFileRuleResult
  removeHiddenFileRule: (rule: HiddenFileRule) => void
}>

/**
 * Applies the appearance preferences to the document. The colour scheme follows
 * the system when asked to, the accent applies on top of whichever scheme is in
 * force, and the interface scale moves the root font size so every rem-based
 * control resizes together rather than one surface at a time.
 */
function useAppliedAppearance(appearance: AppearancePreferences): void {
  const { accentColor, colorTheme, interfaceScale } = appearance
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const applyScheme = () => {
      const dark =
        colorTheme === "dark" || (colorTheme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
    }
    applyScheme()
    media.addEventListener("change", applyScheme)
    return () => media.removeEventListener("change", applyScheme)
  }, [colorTheme])

  useEffect(() => {
    const custom = accentColor !== defaultAppPreferences.appearance.accentColor
    document.documentElement.style.setProperty(
      "--primary",
      custom ? accentColor : ""
    )
    document.documentElement.style.setProperty(
      "--ring",
      custom ? accentColor : ""
    )
  }, [accentColor])

  useEffect(() => {
    document.documentElement.style.fontSize =
      interfaceScale === "default"
        ? ""
        : `${16 * interfaceScaleFactor[interfaceScale satisfies InterfaceScale]}px`
  }, [interfaceScale])
}

/** Coordinates persisted application preferences and their document-level effect. */
export function useAppPreferences(): AppPreferencesController {
  const [preferences, setPreferences] = useState<AppPreferences>(
    defaultAppPreferences
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const preferencesRef = useRef(preferences)
  const saveRevision = useRef(0)
  const saveQueue = useRef(createSerialTaskQueue())

  useAppliedAppearance(preferences.appearance)

  useEffect(() => {
    let active = true
    const revision = saveRevision.current
    void loadAppPreferences()
      .then((saved) => {
        if (active && revision === saveRevision.current) {
          preferencesRef.current = saved
          setPreferences(saved)
        }
      })
      .catch(() => {
        if (active) {
          setSaveError(
            "TeX could not load your saved settings and is using defaults."
          )
        }
      })
    return () => {
      active = false
    }
  }, [])

  const commit = useCallback((next: AppPreferences): void => {
    const normalized = normalizeAppPreferences(next)
    preferencesRef.current = normalized
    setPreferences(normalized)
    setSaveError(null)
    saveRevision.current += 1
    const revision = saveRevision.current
    void saveQueue.current
      .enqueue(() => saveAppPreferences(normalized).then(() => {}))
      .catch(() => {
        if (revision === saveRevision.current) {
          setSaveError(
            "TeX could not save this setting. It may reset on restart."
          )
        }
      })
  }, [])

  const update = useCallback(
    (patch: PreferencePatch): void => {
      const current = preferencesRef.current
      const next = { ...current }
      for (const section of Object.keys(patch) as PreferenceSection[]) {
        Object.assign(next, {
          [section]: { ...current[section], ...patch[section] },
        })
      }
      commit(next)
    },
    [commit]
  )

  const resetSection = useCallback(
    (section: PreferenceSection): void => {
      commit(resetPreferenceSection(preferencesRef.current, section))
    },
    [commit]
  )

  const addHiddenFileRule = useCallback(
    (rule: HiddenFileRule): AddHiddenFileRuleResult => {
      const current = preferencesRef.current.files.hiddenFileRules
      if (current.length >= MAX_HIDDEN_FILE_RULES) return "full"
      const key = hiddenFileRuleKey(rule)
      if (current.some((existing) => hiddenFileRuleKey(existing) === key))
        return "duplicate"
      update({
        files: {
          hiddenFileRules: normalizeHiddenFileRules([...current, rule]),
        },
      })
      return "added"
    },
    [update]
  )

  const removeHiddenFileRule = useCallback(
    (rule: HiddenFileRule): void => {
      const key = hiddenFileRuleKey(rule)
      update({
        files: {
          hiddenFileRules: preferencesRef.current.files.hiddenFileRules.filter(
            (existing) => hiddenFileRuleKey(existing) !== key
          ),
        },
      })
    },
    [update]
  )

  // Memoised on the two inputs that define it so the project tree does not
  // recount hidden entries on every unrelated preference change.
  const isHidden = useMemo(
    () =>
      createHiddenEntryPredicate(
        preferences.files.hiddenFileRules,
        preferences.files.hideFilteredFiles
      ),
    [preferences.files.hiddenFileRules, preferences.files.hideFilteredFiles]
  )

  return {
    preferences,
    isHidden,
    saveError,
    update,
    resetSection,
    addHiddenFileRule,
    removeHiddenFileRule,
  }
}
