import { useCallback, useEffect, useRef, useState } from "react"

import { createLatestRequest } from "@/lib/latest-request"

export type ClipboardController = Readonly<{
  copyText: (text: string) => Promise<void>
  status: "copied" | "error" | null
}>

/** Owns clipboard rejection and exposes a state suitable for visible or live feedback. */
export function useClipboard(): ClipboardController {
  const [status, setStatus] = useState<ClipboardController["status"]>(null)
  const requests = useRef(createLatestRequest()).current
  useEffect(() => () => requests.invalidate(), [requests])
  const copyText = useCallback(
    async (text: string): Promise<void> => {
      const request = requests.begin()
      try {
        await navigator.clipboard.writeText(text)
        if (requests.isCurrent(request)) setStatus("copied")
      } catch {
        if (requests.isCurrent(request)) setStatus("error")
      }
    },
    [requests]
  )

  return { copyText, status }
}
