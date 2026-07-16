import { useEffect, useState } from "react"

import type { AppPreferences, ColorTheme } from "@/domain/project"
import {
  loadAppPreferences,
  saveAppPreferences,
} from "@/services/project-service"

const defaultPreferences: AppPreferences = {
  colorTheme: "system",
  accentColor: "#2563eb",
}

function useResolvedTheme(theme: ColorTheme, accentColor: string) {
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
export function useAppPreferences() {
  const [preferences, setPreferences] =
    useState<AppPreferences>(defaultPreferences)
  const [saveError, setSaveError] = useState<string | null>(null)

  useResolvedTheme(preferences.colorTheme, preferences.accentColor)

  useEffect(() => {
    let active = true
    void loadAppPreferences()
      .then((saved) => {
        if (active) setPreferences(saved)
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

  const updatePreferences = (next: AppPreferences) => {
    setPreferences(next)
    setSaveError(null)
    void saveAppPreferences(next).catch(() => {
      setSaveError(
        "TeX could not save this preference. It may reset on restart."
      )
    })
  }

  const setColorTheme = (colorTheme: ColorTheme) => {
    updatePreferences({ ...preferences, colorTheme })
  }

  const setAccentColor = (accentColor: string) => {
    updatePreferences({ ...preferences, accentColor, colorTheme: "custom" })
  }

  return { preferences, saveError, setAccentColor, setColorTheme }
}
