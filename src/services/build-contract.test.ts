import { describe, expect, it, vi } from "vitest"

import {
  parseBuildEvent,
  parseBuildHistory,
  parseWatchEvent,
} from "@/services/build-contract"
import { acceptEvent } from "@/services/ipc-contract"

describe("build IPC contracts", () => {
  it("accepts a bounded terminal build event", () => {
    expect(
      parseBuildEvent({
        kind: "finished",
        projectPath: "/project",
        runId: "42-1",
        status: "succeeded",
        reason: "main.pdf is up to date.",
        pdfFresh: true,
        finishedAt: 42,
        exitCode: 0,
        diagnostics: [],
      })
    ).toMatchObject({ kind: "finished", status: "succeeded" })
  })

  it("rejects unknown event variants before reducer dispatch", () => {
    expect(() =>
      parseBuildEvent({
        kind: "progress",
        projectPath: "/project",
        runId: "run-1",
      })
    ).toThrow("invalid build event kind")
  })

  it("owns malformed event rejection without dispatching payload data", () => {
    const handler = vi.fn<(event: unknown) => void>()

    expect(acceptEvent({ kind: "forged" }, parseBuildEvent, handler)).toBe(
      false
    )
    expect(handler).not.toHaveBeenCalled()
  })

  it("rejects unbounded history and incomplete watcher overflow data", () => {
    expect(() => parseBuildHistory(Array.from({ length: 11 }))).toThrow(
      "invalid build history"
    )
    expect(() =>
      parseWatchEvent({
        kind: "changed",
        projectPath: "/project",
        changes: ["modify"],
        paths: [],
      })
    ).toThrow("invalid watch truncation")
  })
})
