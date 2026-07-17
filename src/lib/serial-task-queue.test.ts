import { describe, expect, it } from "vitest"

import { createSerialTaskQueue } from "@/lib/serial-task-queue"

function deferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (error: Error) => void
} {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("createSerialTaskQueue", () => {
  it("does not begin a later mutation before the preceding mutation settles", async () => {
    const queue = createSerialTaskQueue()
    const first = deferred()
    const firstStarted = deferred()
    const order: string[] = []

    const firstRun = queue.enqueue(async () => {
      order.push("first:start")
      firstStarted.resolve()
      await first.promise
      order.push("first:end")
    })
    const secondRun = queue.enqueue(async () => {
      order.push("second")
    })

    await firstStarted.promise
    expect(order).toEqual(["first:start"])
    first.resolve()
    await Promise.all([firstRun, secondRun])
    expect(order).toEqual(["first:start", "first:end", "second"])
  })

  it("continues processing after a rejected mutation", async () => {
    const queue = createSerialTaskQueue()
    const failure = new Error("expected")
    const firstRun = queue.enqueue(() => Promise.reject(failure))
    const secondRun = queue.enqueue(() => Promise.resolve())

    await expect(firstRun).rejects.toBe(failure)
    await expect(secondRun).resolves.toBeUndefined()
  })
})
