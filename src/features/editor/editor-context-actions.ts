/**
 * The actions a right-click offers in the source editor.
 *
 * Availability is decided here, from a plain description of what the cursor is
 * on, so the menu can be reasoned about and tested without an editor view. The
 * rule the list follows is `ui-ux-requirements.md`'s: an action that cannot do
 * anything right now is omitted rather than shown disabled, because a menu of
 * greyed-out entries reads as a broken control.
 *
 * Adding an action — a project-wide rename, say — means adding one entry here
 * and one command binding; nothing else has to change.
 */

import type { ShortcutKey } from "@/lib/shortcuts"

export type EditorContextActionId =
  | "go-to-definition"
  | "cut"
  | "copy"
  | "paste"
  | "toggle-comment"
  | "fold"
  | "unfold"
  | "find-in-file"
  | "select-all"

export type EditorContextAction = Readonly<{
  id: EditorContextActionId
  label: string
  /** Rendered through `shortcutLabel()` so platform naming stays correct. */
  shortcut: readonly ShortcutKey[] | null
  /** Actions sharing a group are kept together, separated from other groups. */
  group: number
}>

export type EditorContextState = Readonly<{
  /** True when the click landed on a `\ref`, `\cite`, or file reference. */
  navigable: boolean
  hasSelection: boolean
  /** True when the clicked line opens a range that can be folded. */
  foldable: boolean
  /** True when the clicked line is currently folded. */
  folded: boolean
  readOnly: boolean
}>

/**
 * The menu for a click, in display order. Returns an empty list when there is
 * nothing to offer, so the caller can suppress the menu entirely rather than
 * open an empty one.
 */
export function editorContextActions(
  state: EditorContextState
): EditorContextAction[] {
  const actions: EditorContextAction[] = []

  if (state.navigable) {
    actions.push({
      id: "go-to-definition",
      label: "Go to definition",
      shortcut: ["primary", "enter"],
      group: 0,
    })
  }

  if (state.hasSelection) {
    if (!state.readOnly) {
      actions.push({ id: "cut", label: "Cut", shortcut: null, group: 1 })
    }
    actions.push({ id: "copy", label: "Copy", shortcut: null, group: 1 })
  }
  if (!state.readOnly) {
    actions.push({ id: "paste", label: "Paste", shortcut: null, group: 1 })
  }

  if (!state.readOnly) {
    actions.push({
      id: "toggle-comment",
      label: "Toggle comment",
      shortcut: ["primary", "/"],
      group: 2,
    })
  }

  if (state.folded) {
    actions.push({ id: "unfold", label: "Unfold", shortcut: null, group: 2 })
  } else if (state.foldable) {
    actions.push({ id: "fold", label: "Fold", shortcut: null, group: 2 })
  }

  actions.push(
    {
      id: "find-in-file",
      label: "Find in file",
      shortcut: ["primary", "f"],
      group: 3,
    },
    {
      id: "select-all",
      label: "Select all",
      shortcut: null,
      group: 3,
    }
  )

  return actions
}
