import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import type { ReactElement } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal, type ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

import type { CanonicalProjectPath } from "@/domain/identifiers"
import type { TerminalId } from "@/domain/terminal"
import {
  closeTerminal,
  listenForTerminalEvents,
  openTerminal,
  resizeTerminal,
  writeTerminal,
} from "@/services/terminal-service"
import { runDetached } from "@/lib/promises"

const FONT_FAMILY =
  "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', 'DejaVu Sans Mono', ui-monospace, monospace"

export type TerminalHandle = Readonly<{ kill: () => void }>

/**
 * Hosts one xterm.js view bound to a Rust-owned PTY session.
 *
 * The session lives in the backend, so this view can be unmounted (panel closed)
 * without terminating the shell; on remount it reattaches and restores the
 * retained scrollback returned by `open_terminal`.
 */
export const TerminalView = forwardRef<
  TerminalHandle,
  {
    active: boolean
    projectPath: CanonicalProjectPath
  }
>(function TerminalView({ active, projectPath }, ref): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const terminalIdRef = useRef<TerminalId | null>(null)
  const exitedRef = useRef(false)

  useImperativeHandle(ref, () => ({
    kill: () => {
      const id = terminalIdRef.current
      if (id !== null) runDetached(closeTerminal(id))
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const terminal = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.15,
      letterSpacing: 0,
      cursorBlink: true,
      scrollback: 5_000,
      theme: terminalTheme(),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminalRef.current = terminal
    fitRef.current = fit

    let disposed = false
    let teardown: (() => void) | null = null

    const fitSafely = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      try {
        fit.fit()
      } catch {
        // The host has no measurable size while hidden; skip this fit.
      }
    }

    const startSession = async () => {
      fitSafely()
      const descriptor = await openTerminal({
        projectPath,
        cols: terminal.cols,
        rows: terminal.rows,
      })
      if (disposed) return
      terminalIdRef.current = descriptor.terminalId
      exitedRef.current = false
      const snapshot = decodeBase64(descriptor.base64Snapshot)
      if (snapshot.length > 0) terminal.write(snapshot)
    }

    // Opening before the monospace font is ready makes xterm measure the wrong
    // cell width, which spreads glyphs apart. Wait for fonts, then mount.
    const initialize = () => {
      if (disposed) return
      terminal.open(host)

      const applyTheme = () => {
        terminal.options.theme = terminalTheme()
      }
      const themeObserver = new MutationObserver(applyTheme)
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      })

      const inputSubscription = terminal.onData((data) => {
        if (exitedRef.current) {
          terminal.clear()
          runDetached(startSession())
          return
        }
        const id = terminalIdRef.current
        if (id !== null) runDetached(writeTerminal(id, encodeUtf8Base64(data)))
      })

      let unlisten: (() => void) | null = null
      void listenForTerminalEvents((event) => {
        if (event.terminalId !== terminalIdRef.current) return
        if (event.kind === "data") {
          terminal.write(decodeBase64(event.base64))
          return
        }
        exitedRef.current = true
        terminal.write(
          "\r\n\x1b[90m[Process exited — press Enter to start a new shell.]\x1b[0m\r\n"
        )
      })
        .then((cleanup) => {
          if (disposed) cleanup()
          else unlisten = cleanup
        })
        .catch(() => {
          // A missing event bridge leaves the view inert rather than crashing.
        })

      runDetached(startSession())

      const resizeObserver = new ResizeObserver(() => {
        fitSafely()
        const id = terminalIdRef.current
        if (id !== null) {
          runDetached(resizeTerminal(id, terminal.cols, terminal.rows))
        }
      })
      resizeObserver.observe(host)

      teardown = () => {
        unlisten?.()
        inputSubscription.dispose()
        themeObserver.disconnect()
        resizeObserver.disconnect()
      }
    }

    const fonts = document.fonts as FontFaceSet | undefined
    if (fonts?.ready !== undefined) {
      fonts.ready.then(initialize).catch(initialize)
    } else {
      initialize()
    }

    return () => {
      disposed = true
      teardown?.()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [projectPath])

  useEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current
      const fit = fitRef.current
      const host = hostRef.current
      if (
        terminal === null ||
        fit === null ||
        host === null ||
        host.clientWidth === 0
      )
        return
      try {
        fit.fit()
      } catch {
        // Ignore fit failures while the panel is mid-transition.
      }
      const id = terminalIdRef.current
      if (id !== null) {
        runDetached(resizeTerminal(id, terminal.cols, terminal.rows))
      }
      terminal.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active])

  return (
    <div className="size-full min-h-0 overflow-hidden bg-terminal">
      <div className="size-full min-h-0 px-3 py-2" ref={hostRef} />
    </div>
  )
})

function terminalTheme(): ITheme {
  const dark = document.documentElement.classList.contains("dark")
  if (dark) {
    return {
      background: "#17171a",
      foreground: "#d4d4d8",
      cursor: "#d4d4d8",
      cursorAccent: "#17171a",
      selectionBackground: "#3a3a46",
      black: "#3f3f46",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#fbbf24",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#d4d4d8",
      brightBlack: "#52525b",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fcd34d",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    }
  }
  return {
    background: "#fbfbfd",
    foreground: "#2c2c34",
    cursor: "#2c2c34",
    cursorAccent: "#fbfbfd",
    selectionBackground: "#cdd6e4",
    black: "#52525b",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#b45309",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#3f3f46",
    brightBlack: "#71717a",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#ca8a04",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#18181b",
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
