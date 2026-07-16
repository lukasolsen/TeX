/**
 * Owns a promise intentionally detached from a synchronous UI callback.
 *
 * Expected failures must be classified by the task itself. An unexpected
 * rejection is reported without forwarding backend data, paths, or document
 * content to the webview's global error channel.
 */
export function runDetached(task: Promise<unknown>): void {
  void task.catch(() => {
    globalThis.reportError(
      new Error("An unexpected asynchronous UI action failed.")
    )
  })
}
