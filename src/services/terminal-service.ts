import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

import type {
  OpenTerminalRequest,
  TerminalDescriptor,
  TerminalEvent,
  TerminalId,
} from "@/domain/terminal"
import {
  parseTerminalDescriptor,
  parseTerminalEvent,
} from "@/services/terminal-contract"
import { acceptEvent } from "@/services/ipc-contract"

const TERMINAL_EVENT = "tex://terminal-event"

export async function openTerminal(
  request: OpenTerminalRequest
): Promise<TerminalDescriptor> {
  return parseTerminalDescriptor(
    await invoke<unknown>("open_terminal", { request })
  )
}

export async function writeTerminal(
  terminalId: TerminalId,
  base64: string
): Promise<void> {
  return invoke("write_terminal", { request: { terminalId, base64 } })
}

export async function resizeTerminal(
  terminalId: TerminalId,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("resize_terminal", { request: { terminalId, cols, rows } })
}

export async function closeTerminal(terminalId: TerminalId): Promise<void> {
  return invoke("close_terminal", { terminalId })
}

export async function listenForTerminalEvents(
  handler: (event: TerminalEvent) => void
): Promise<UnlistenFn> {
  return listen<unknown>(TERMINAL_EVENT, (event) =>
    acceptEvent(event.payload, parseTerminalEvent, handler)
  )
}
