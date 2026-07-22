import { describe, expect, it } from "vitest"

import {
  admitNotification,
  autoDismissMs,
  createNotification,
  dismissNotification,
  notificationId,
  notificationLiveness,
  NOTIFICATION_CAPACITY,
  type Notification,
  type NotificationRequest,
} from "./notification"

function entry(id: string, request: NotificationRequest): Notification {
  return createNotification(notificationId(id), request)
}

const info: NotificationRequest = { tone: "info", title: "Copied" }

describe("autoDismissMs", () => {
  it("retires settled tones and keeps unresolved ones", () => {
    expect(autoDismissMs("success")).toBeGreaterThan(0)
    expect(autoDismissMs("info")).toBeGreaterThan(0)
    expect(autoDismissMs("warning")).toBeNull()
    expect(autoDismissMs("error")).toBeNull()
  })
})

describe("notificationLiveness", () => {
  it("interrupts only for an error", () => {
    expect(notificationLiveness("error")).toEqual({
      role: "alert",
      live: "assertive",
    })
    for (const tone of ["success", "info", "warning"] as const) {
      expect(notificationLiveness(tone)).toEqual({
        role: "status",
        live: "polite",
      })
    }
  })
})

describe("createNotification", () => {
  it("normalizes the optional fields to null", () => {
    expect(entry("a", info)).toEqual({
      id: "a",
      tone: "info",
      title: "Copied",
      detail: null,
      action: null,
      key: null,
    })
  })

  it("rejects an empty identifier", () => {
    expect(() => notificationId("")).toThrow(TypeError)
  })
})

describe("admitNotification", () => {
  it("drops the oldest entry once capacity is reached", () => {
    let queue: ReadonlyArray<Notification> = []
    for (let index = 0; index <= NOTIFICATION_CAPACITY; index += 1) {
      queue = admitNotification(queue, entry(`n${index}`, info))
    }
    expect(queue).toHaveLength(NOTIFICATION_CAPACITY)
    expect(queue.map((item) => item.id)).toEqual(["n1", "n2", "n3"])
  })

  it("replaces a keyed entry in place instead of stacking", () => {
    const first = entry("a", { ...info, key: "clipboard", title: "First" })
    const second = entry("b", { ...info, key: "clipboard", title: "Second" })
    const queue = admitNotification(admitNotification([], first), second)
    expect(queue).toHaveLength(1)
    expect(queue[0]?.title).toBe("Second")
  })

  it("keeps a keyed entry at its position", () => {
    const older = entry("a", { ...info, key: "clipboard" })
    const other = entry("b", info)
    const replacement = entry("c", { ...info, key: "clipboard" })
    const queue = admitNotification(
      admitNotification(admitNotification([], older), other),
      replacement
    )
    expect(queue.map((item) => item.id)).toEqual(["c", "b"])
  })
})

describe("dismissNotification", () => {
  it("removes only the requested entry", () => {
    const queue = admitNotification(
      admitNotification([], entry("a", info)),
      entry("b", info)
    )
    expect(
      dismissNotification(queue, notificationId("a")).map((item) => item.id)
    ).toEqual(["b"])
  })
})
