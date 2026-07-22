import { createContext, useContext } from "react"

import type { NotificationId, NotificationRequest } from "@/domain/notification"

export type Notifier = Readonly<{
  /** Reports one completed action. Returns the identity needed to retire it early. */
  notify: (request: NotificationRequest) => NotificationId
  dismiss: (id: NotificationId) => void
}>

export const NotifierContext = createContext<Notifier | null>(null)

/** Requires a `NotificationProvider` ancestor; the window mounts exactly one. */
export function useNotifier(): Notifier {
  const notifier = useContext(NotifierContext)
  if (notifier === null) {
    throw new Error("useNotifier requires a NotificationProvider ancestor")
  }
  return notifier
}
