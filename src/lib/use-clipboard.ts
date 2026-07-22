import { useCallback, useEffect, useRef, useState } from "react"

import { useNotifier } from "@/components/feedback/notifier-context"
import { createLatestRequest } from "@/lib/latest-request"

/** How long a successful copy stays acknowledged in place before it retires. */
const CONFIRMATION_MS = 2_000

export type ClipboardController = Readonly<{
  copyText: (text: string) => Promise<void>
  status: "copied" | null
}>

/**
 * Copies text and acknowledges the result. Success is confirmed quietly and in
 * place, because the user can already see what they copied; a rejection is
 * raised to the window's notification stack, because it leaves them without the
 * value they asked for and needs a decision.
 */
export function useClipboard(): ClipboardController {
  const [status, setStatus] = useState<ClipboardController["status"]>(null)
  const { notify } = useNotifier()
  const requests = useRef(createLatestRequest()).current
  const confirmation = useRef<number | null>(null)

  useEffect(
    () => () => {
      requests.invalidate()
      if (confirmation.current !== null)
        window.clearTimeout(confirmation.current)
    },
    [requests]
  )

  const copyText = useCallback(
    async (text: string): Promise<void> => {
      const request = requests.begin()
      try {
        await navigator.clipboard.writeText(text)
        if (!requests.isCurrent(request)) return
        setStatus("copied")
        if (confirmation.current !== null)
          window.clearTimeout(confirmation.current)
        confirmation.current = window.setTimeout(() => {
          confirmation.current = null
          setStatus(null)
        }, CONFIRMATION_MS)
      } catch {
        if (!requests.isCurrent(request)) return
        setStatus(null)
        notify({
          tone: "error",
          title: "Could not copy to the clipboard",
          detail: "Your system denied clipboard access to TeX.",
          key: "clipboard",
        })
      }
    },
    [notify, requests]
  )

  return { copyText, status }
}
