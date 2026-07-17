import { describe, expect, it, vi } from "vitest"

import {
  parseTerminalDescriptor,
  parseTerminalEvent,
} from "@/services/terminal-contract"
import { acceptEvent } from "@/services/ipc-contract"

describe("terminal IPC contracts", () => {
  it("parses a descriptor with a scrollback snapshot", () => {
    expect(
      parseTerminalDescriptor({
        terminalId: "terminal-1",
        base64Snapshot: "aGk=",
        running: true,
      })
    ).toMatchObject({ terminalId: "terminal-1", running: true })
  })

  it("accepts data and exit events", () => {
    expect(
      parseTerminalEvent({
        kind: "data",
        terminalId: "terminal-1",
        base64: "aGk=",
      })
    ).toMatchObject({ kind: "data", base64: "aGk=" })
    expect(
      parseTerminalEvent({
        kind: "exit",
        terminalId: "terminal-1",
        exitCode: 0,
      })
    ).toMatchObject({ kind: "exit", exitCode: 0 })
  })

  it("rejects unknown terminal event variants", () => {
    expect(() =>
      parseTerminalEvent({ kind: "progress", terminalId: "terminal-1" })
    ).toThrow("terminal event")
  })

  it("swallows malformed events without dispatching them", () => {
    const handler = vi.fn<(event: unknown) => void>()

    expect(acceptEvent({ kind: "forged" }, parseTerminalEvent, handler)).toBe(
      false
    )
    expect(handler).not.toHaveBeenCalled()
  })
})
