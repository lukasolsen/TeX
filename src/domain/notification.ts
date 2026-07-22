const notificationIdBrand: unique symbol = Symbol("NotificationId")

export type NotificationId = string & { readonly [notificationIdBrand]: true }

/**
 * Outcome classes for a completed action. `success` and `info` describe a
 * settled state and retire themselves; `warning` and `error` describe an
 * unresolved condition and persist until the user acknowledges them.
 */
export type NotificationTone = "success" | "info" | "warning" | "error"

export type NotificationAction = Readonly<{
  label: string
  run: () => void
}>

export type NotificationRequest = Readonly<{
  tone: NotificationTone
  title: string
  detail?: string | null
  action?: NotificationAction | null
  /**
   * Collapses repeats of the same recurring condition onto one entry. A request
   * carrying a key replaces the queued entry sharing it instead of stacking.
   */
  key?: string | null
}>

export type Notification = Readonly<{
  id: NotificationId
  tone: NotificationTone
  title: string
  detail: string | null
  action: NotificationAction | null
  key: string | null
}>

/** The visible stack is capped so notifications never dominate the workspace. */
export const NOTIFICATION_CAPACITY = 3

const AUTO_DISMISS_MS: Readonly<Record<NotificationTone, number | null>> = {
  success: 6_000,
  info: 4_000,
  warning: null,
  error: null,
}

/** Milliseconds after which a tone retires itself, or null when it must be acknowledged. */
export function autoDismissMs(tone: NotificationTone): number | null {
  return AUTO_DISMISS_MS[tone]
}

/** Screen readers interrupt only for an error; everything else waits its turn. */
export function notificationLiveness(
  tone: NotificationTone
): Readonly<{ role: "alert" | "status"; live: "assertive" | "polite" }> {
  return tone === "error"
    ? { role: "alert", live: "assertive" }
    : { role: "status", live: "polite" }
}

export function notificationId(value: string): NotificationId {
  if (value.length === 0) throw new TypeError("Notification ID is empty")
  return value as NotificationId
}

export function createNotification(
  id: NotificationId,
  request: NotificationRequest
): Notification {
  return {
    id,
    tone: request.tone,
    title: request.title,
    detail: request.detail ?? null,
    action: request.action ?? null,
    key: request.key ?? null,
  }
}

/**
 * Places one notification into the visible stack. A keyed notification replaces
 * its predecessor in place so a repeating condition cannot flood the stack;
 * otherwise the newest entry displaces the oldest once capacity is reached.
 */
export function admitNotification(
  queue: ReadonlyArray<Notification>,
  next: Notification
): ReadonlyArray<Notification> {
  if (next.key !== null) {
    const index = queue.findIndex((entry) => entry.key === next.key)
    if (index !== -1) {
      return queue.map((entry, position) => (position === index ? next : entry))
    }
  }
  const admitted = [...queue, next]
  return admitted.length > NOTIFICATION_CAPACITY
    ? admitted.slice(admitted.length - NOTIFICATION_CAPACITY)
    : admitted
}

export function dismissNotification(
  queue: ReadonlyArray<Notification>,
  id: NotificationId
): ReadonlyArray<Notification> {
  return queue.filter((entry) => entry.id !== id)
}
