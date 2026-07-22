import type { TerminalDescriptor, TerminalEvent } from "@/domain/terminal"
import {
  IpcContractError,
  nonEmptyString,
  nullableInteger,
  record,
  stringValue,
} from "@/services/ipc-contract"

const ID_LIMIT = 256
const BASE64_LIMIT = 512 * 1024

export function parseTerminalDescriptor(value: unknown): TerminalDescriptor {
  const input = record(value, "terminal descriptor")
  return {
    terminalId: nonEmptyString(input.terminalId, "terminal id", ID_LIMIT),
    base64Snapshot: stringValue(
      input.base64Snapshot,
      "terminal snapshot",
      BASE64_LIMIT
    ),
    running: input.running === true,
  }
}

export function parseTerminalEvent(value: unknown): TerminalEvent {
  const input = record(value, "terminal event")
  const terminalId = nonEmptyString(input.terminalId, "terminal id", ID_LIMIT)
  if (input.kind === "data") {
    return {
      kind: "data",
      terminalId,
      base64: stringValue(input.base64, "terminal data", BASE64_LIMIT),
    }
  }
  if (input.kind === "exit") {
    return {
      kind: "exit",
      terminalId,
      exitCode: nullableInteger(input.exitCode, "terminal exit code", -1, 255),
    }
  }
  throw new IpcContractError("terminal event")
}
