import type { ReactElement, ReactNode } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type {
  EditorContextAction,
  EditorContextActionId,
} from "@/features/editor/editor-context-actions"
import { shortcutLabel } from "@/lib/shortcuts"

/**
 * The source editor's right-click menu.
 *
 * The action list is decided by `editorContextActions` and passed in, so this
 * component only renders and dispatches. Groups are separated in the order
 * they are declared.
 */
export function EditorContextMenu({
  actions,
  children,
  onOpen,
  onSelect,
}: {
  actions: readonly EditorContextAction[]
  children: ReactNode
  onOpen: (event: { clientX: number; clientY: number }) => void
  onSelect: (id: EditorContextActionId) => void
}): ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex min-h-0 flex-1 flex-col"
        onContextMenu={(event) =>
          onOpen({ clientX: event.clientX, clientY: event.clientY })
        }
      >
        {children}
      </ContextMenuTrigger>
      {actions.length === 0 ? null : (
        <ContextMenuContent
          aria-label="Source editor actions"
          className="min-w-44"
        >
          {actions.map((action, index) => (
            <ContextMenuItemWithSeparator
              action={action}
              key={action.id}
              onSelect={onSelect}
              previousGroup={actions[index - 1]?.group ?? action.group}
            />
          ))}
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

function ContextMenuItemWithSeparator({
  action,
  onSelect,
  previousGroup,
}: {
  action: EditorContextAction
  onSelect: (id: EditorContextActionId) => void
  previousGroup: number
}): ReactElement {
  return (
    <>
      {previousGroup === action.group ? null : <ContextMenuSeparator />}
      <ContextMenuItem onClick={() => onSelect(action.id)}>
        {action.label}
        {action.shortcut === null ? null : (
          <ContextMenuShortcut>
            {shortcutLabel(action.shortcut)}
          </ContextMenuShortcut>
        )}
      </ContextMenuItem>
    </>
  )
}
