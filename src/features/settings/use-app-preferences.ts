import { useCallback, useEffect, useRef, useState } from "react"

import type { AppPreferences, ColorTheme } from "@/domain/project"
import {
  loadAppPreferences,
  saveAppPreferences,
} from "@/services/project-service"
import { createSerialTaskQueue } from "@/lib/serial-task-queue"

const defaultPreferences: AppPreferences = {
  colorTheme: "system",
  accentColor: "#2563eb",
}

export type AppPreferencesController = Readonly<{
  preferences: AppPreferences
  saveError: string | null
  setAccentColor: (accentColor: string) => void
  setColorTheme: (colorTheme: ColorTheme) => void
}>

function useResolvedTheme(theme: ColorTheme, accentColor: string): void {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const applyTheme = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.documentElement.style.setProperty(
        "--primary",
        theme === "custom" ? accentColor : ""
      )
      document.documentElement.style.setProperty(
        "--ring",
        theme === "custom" ? accentColor : ""
      )
    }
    applyTheme()
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [accentColor, theme])
}

/** Coordinates persisted visual preferences and applies their document-level effect. */
export function useAppPreferences(): AppPreferencesController {
  const [preferences, setPreferences] =
    useState<AppPreferences>(defaultPreferences)
  const [saveError, setSaveError] = useState<string | null>(null)
  const preferencesRef = useRef(preferences)
  const saveRevision = useRef(0)
  const saveQueue = useRef(createSerialTaskQueue())

  useResolvedTheme(preferences.colorTheme, preferences.accentColor)

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
          setSaveError("TeX could not load your appearance preference.")
        }
      })
    return () => {
      active = false
    }
  }, [])

  const updatePreferences = useCallback((next: AppPreferences): void => {
    preferencesRef.current = next
    setPreferences(next)
    setSaveError(null)
    const revision = ++saveRevision.current
    void saveQueue.current
      .enqueue(() => saveAppPreferences(next).then(() => undefined))
      .catch(() => {
        if (revision === saveRevision.current) {
          setSaveError(
            "TeX could not save this preference. It may reset on restart."
          )
        }
      })
  }, [])

  const setColorTheme = useCallback(
    (colorTheme: ColorTheme): void => {
      updatePreferences({ ...preferencesRef.current, colorTheme })
    },
    [updatePreferences]
  )

  const setAccentColor = useCallback(
    (accentColor: string): void => {
      updatePreferences({
        ...preferencesRef.current,
        accentColor,
        colorTheme: "custom",
      })
    },
    [updatePreferences]
  )

  return { preferences, saveError, setAccentColor, setColorTheme }
}
