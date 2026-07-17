import type { CanonicalProjectPath } from "@/domain/identifiers"

/** The Rust-owned identity of one PTY-backed shell session. */
export type TerminalId = string

/** The result of opening (or reattaching to) a project terminal session. */
export type TerminalDescriptor = Readonly<{
  terminalId: TerminalId
  /** Base64 of the retained scrollback so a remounted view restores its output. */
  base64Snapshot: string
  running: boolean
}>

export type TerminalDataEvent = Readonly<{
  kind: "data"
  terminalId: TerminalId
  base64: string
}>

export type TerminalExitEvent = Readonly<{
  kind: "exit"
  terminalId: TerminalId
  exitCode: number | null
}>

export type TerminalEvent = TerminalDataEvent | TerminalExitEvent

export type OpenTerminalRequest = Readonly<{
  projectPath: CanonicalProjectPath
  cols: number
  rows: number
}>
