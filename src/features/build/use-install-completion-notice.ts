import { useEffect, useRef } from "react"

import { useNotifier } from "@/components/feedback/notifier-context"
import type { InstallNotice } from "@/domain/latex-install"

/**
 * Hands one finished installation to the window's notification stack and
 * acknowledges it, so the installer state and the reported outcome cannot drift
 * apart. While the installer dialog is open the dialog is the report; the
 * notice waits and is raised once the user leaves it.
 */
export function useInstallCompletionNotice({
  acknowledge,
  notice,
  onOpenDetails,
  suppressed,
}: {
  acknowledge: () => void
  notice: InstallNotice | null
  onOpenDetails: () => void
  suppressed: boolean
}): void {
  const { notify } = useNotifier()
  const openDetails = useRef(onOpenDetails)
  openDetails.current = onOpenDetails

  useEffect(() => {
    if (notice === null || suppressed) return
    notify({
      tone: notice.tone,
      title: notice.title,
      detail: notice.detail,
      action: {
        label: "View installation details",
        run: () => openDetails.current(),
      },
      key: "latex-install",
    })
    acknowledge()
  }, [acknowledge, notice, notify, suppressed])
}
