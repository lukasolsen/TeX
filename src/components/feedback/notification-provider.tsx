import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  admitNotification,
  autoDismissMs,
  createNotification,
  dismissNotification,
  notificationId,
  type Notification,
  type NotificationId,
  type NotificationRequest,
  type NotificationTone,
} from "@/domain/notification"
import { cn } from "@/lib/utils"

import { NotifierContext, type Notifier } from "./notifier-context"

/**
 * Owns the single notification stack for the window. It is mounted above the
 * page switch so a notification survives moving between home, workspace, and
 * settings — the action that raised it does not always finish on the surface
 * that started it.
 */
export function NotificationProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [queue, setQueue] = useState<ReadonlyArray<Notification>>([])
  const sequence = useRef(0)
  const timers = useRef(new Map<NotificationId, number>())

  const dismiss = useCallback((id: NotificationId): void => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setQueue((current) => dismissNotification(current, id))
  }, [])

  const notify = useCallback(
    (request: NotificationRequest): NotificationId => {
      sequence.current += 1
      const id = notificationId(`notification-${sequence.current}`)
      const next = createNotification(id, request)
      setQueue((current) => {
        // A keyed replacement retires the timer of the entry it displaces.
        if (next.key !== null) {
          for (const entry of current) {
            if (entry.key === next.key && entry.id !== id) {
              const timer = timers.current.get(entry.id)
              if (timer !== undefined) window.clearTimeout(timer)
              timers.current.delete(entry.id)
            }
          }
        }
        return admitNotification(current, next)
      })
      const lifetime = autoDismissMs(next.tone)
      if (lifetime !== null) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), lifetime)
        )
      }
      return id
    },
    [dismiss]
  )

  const timersOnUnmount = timers.current
  useEffect(
    () => () => {
      for (const timer of timersOnUnmount.values()) window.clearTimeout(timer)
      timersOnUnmount.clear()
    },
    [timersOnUnmount]
  )

  const notifier = useMemo<Notifier>(
    () => ({ notify, dismiss }),
    [dismiss, notify]
  )

  return (
    <NotifierContext.Provider value={notifier}>
      {children}
      <NotificationRegion notifications={queue} onDismiss={dismiss} />
    </NotifierContext.Provider>
  )
}

/**
 * Both lists stay mounted for the lifetime of the window so an inserted
 * notification is announced. Assertive entries sit closest to the content the
 * user is reading because they are the ones still awaiting a decision.
 */
function NotificationRegion({
  notifications,
  onDismiss,
}: {
  notifications: ReadonlyArray<Notification>
  onDismiss: (id: NotificationId) => void
}): ReactElement {
  const assertive = notifications.filter((entry) => entry.tone === "error")
  const polite = notifications.filter((entry) => entry.tone !== "error")

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed right-3 bottom-3 z-40 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col"
      role="region"
    >
      <ol aria-live="polite" className="flex flex-col">
        {polite.map((entry) => (
          <NotificationItem
            key={entry.id}
            notification={entry}
            onDismiss={onDismiss}
          />
        ))}
      </ol>
      <ol aria-live="assertive" className="flex flex-col">
        {assertive.map((entry) => (
          <NotificationItem
            key={entry.id}
            notification={entry}
            onDismiss={onDismiss}
          />
        ))}
      </ol>
    </div>
  )
}

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: (id: NotificationId) => void
}): ReactElement {
  const { action, detail, id, title, tone } = notification
  return (
    <li
      className={cn(
        // The margin, rather than a parent gap, keeps an empty live region
        // from adding spacing while it waits to be announced into.
        "pointer-events-auto mt-2 flex items-start gap-2 rounded-lg border bg-popover p-3",
        "text-popover-foreground shadow-popover",
        "animate-in duration-150 fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
      )}
    >
      <ToneIcon tone={tone} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {detail === null ? null : (
          <p className="text-xs text-muted-foreground">{detail}</p>
        )}
        {action === null ? null : (
          <Button
            className="h-auto w-fit p-0 text-xs"
            onClick={action.run}
            variant="link"
          >
            {action.label}
          </Button>
        )}
      </div>
      <Button
        aria-label={`Dismiss notification: ${title}`}
        className="-mt-1 -mr-1 shrink-0"
        onClick={() => onDismiss(id)}
        size="icon-sm"
        variant="ghost"
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  )
}

function ToneIcon({ tone }: { tone: NotificationTone }): ReactElement {
  const className = "mt-0.5 size-4 shrink-0"
  if (tone === "success")
    return <CheckCircle2 aria-hidden="true" className={className} />
  if (tone === "info")
    return (
      <Info
        aria-hidden="true"
        className={cn(className, "text-muted-foreground")}
      />
    )
  if (tone === "warning")
    return (
      <TriangleAlert
        aria-hidden="true"
        className={cn(className, "text-muted-foreground")}
      />
    )
  return (
    <AlertCircle
      aria-hidden="true"
      className={cn(className, "text-destructive")}
    />
  )
}
