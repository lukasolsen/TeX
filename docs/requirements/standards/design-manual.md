# Design manual

This document is the visual half of the user-facing standard. `ui-ux-requirements.md` decides what an interface must *do*; this document decides what it must *look like* and which vocabulary it must use to say it. Both are mandatory.

Every rule here is checkable. If a change cannot be expressed with the tokens and recipes below, that is a signal to revise the change, not to introduce a one-off value. Introducing a new token is allowed, but it must be added to `src/index.css` and documented here in the same change.

## 1. Surface ladder

Surfaces stack from the furthest back to the nearest. Never place a surface directly on a surface of the same value without a `border` to separate them.

| Depth | Token | Used for |
| --- | --- | --- |
| Base | `bg-background` | Application root, settings body, dialog backdrop content |
| Field | `bg-workspace`, `bg-home-surface` | The area a workspace or home page occupies |
| Chrome | `bg-workspace-chrome`, `bg-sidebar`, `bg-status`, `bg-home-nav` | Title bar, tab strips, panel headers, status bar, navigation |
| Content | `bg-source`, `bg-terminal`, `bg-card` | The editable or rendered document itself |
| Overlay | `bg-popover` | Menus, dialogs, notifications, in-pane floating toolbars |

Do not use `bg-white`, `bg-black`, `bg-neutral-*`, or a literal hex. Every colour resolves through a token in `src/index.css` so light, dark, and `forced-colors` all stay correct.

Tints of a token are permitted for state only, using the token itself: `bg-muted/45`, `hover:bg-foreground/7`, `bg-status-foreground/10`. Do not tint toward an unrelated colour.

## 2. Type scale

`text-[Npx]` and `text-[Nrem]` are banned. Use the role table.

| Token | Size | Role |
| --- | --- | --- |
| `text-micro` | 10px | Badge counts, keyboard-shortcut hints, outline line numbers |
| `text-meta` | 11px | Status bar, secondary path/metadata lines, monospace match previews |
| `text-xs` | 12px | Menu triggers, dense captions, tab labels, helper text |
| `text-ui` | 13px | Dense interactive rows: file tree, outline entries, inline rename inputs |
| `text-sm` | 14px | Default body and control text, menu items, dialog copy |
| `text-base` | 16px | Dialog and section headings |
| `text-lg` and up | — | Page-level headings only |

Weight is limited to `font-normal`, `font-medium`, and `font-semibold`. `font-semibold` marks a heading or an active element, never emphasis inside a sentence.

Use `font-mono` only for content that is literally code, a path fragment, a log line, or a keyboard shortcut.

## 3. Density

Control heights are fixed so adjacent chrome lines up.

| Height | Used for |
| --- | --- |
| `h-9` (36px) | Window chrome, panel headers, dock tab strips |
| `h-10` (40px) | Document tab strips, settings search field |
| `h-8` (32px) | Standard buttons, segmented controls |
| `h-7` (28px) | Dense list and tree rows, command-palette trigger |
| `h-6` (24px) | Inline rename inputs and their adjacent buttons |

Icon buttons use the `Button` `size="icon-xs" | "icon-sm"` variants. Do not hand-size a button.

Gap rhythm inside a row is `gap-1` for tightly coupled controls, `gap-1.5` for an icon and its label, `gap-2` for distinct controls, `gap-3` and up for separate groups. Horizontal padding on chrome is `px-2`, on content rows `px-3`, on dialogs and cards `px-4`.

## 4. Radius

| Token | Used for |
| --- | --- |
| `rounded-sm` | Inline chips, inline inputs, menu items |
| `rounded-md` | Buttons, list rows, in-pane floating toolbars |
| `rounded-lg` | Notifications, popovers, cards, icon tiles |
| `rounded-xl` / `rounded-2xl` | Full sections and page-level panels |

Tab triggers in a `line` tab strip are `rounded-none`; their active state is the indicator, not a shape change.

## 5. Elevation and stacking

Three elevation steps exist. Choose by what the element sits on, not by how much it should stand out.

| Token | Used for |
| --- | --- |
| `shadow-raised` | An element lifted within its own surface: icon tiles, settings cards, segmented-control thumbs, inline badges |
| `shadow-overlay` | An element floating over content it does not belong to: in-pane find bars, PDF toolbars, the startup card |
| `shadow-popover` | A portalled element: menus, dialogs, the notification region |

Stacking uses a fixed ladder. Do not invent a z-value.

| Layer | Used for |
| --- | --- |
| `z-10` | Sticky headers that stay in flow |
| `z-20` | In-pane floating overlays that belong to one panel |
| `z-40` | The notification region |
| `z-50` | Portalled menus, popovers, and dialogs |

## 6. Focus, hover, and pressed

One recipe each. A component does not invent its own.

- **Focus:** `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`. Chrome elements that sit on a tinted surface may use `focus-visible:ring-ring/60`. Focus is never removed without an equivalent visible replacement.
- **Hover:** a surface shift only — `hover:bg-accent`, `hover:bg-sidebar-accent`, or `hover:bg-foreground/7` on chrome. Hover never moves an element, changes its size, or reveals its only affordance. A control revealed on hover (such as a tab close button) must also appear on `focus-visible` and while its row is active.
- **Disabled:** `disabled:opacity-50` plus `disabled:pointer-events-none`. A disabled control is always accompanied by text explaining why, per `ui-ux-requirements.md`.

## 7. Motion budget

| Duration | Used for |
| --- | --- |
| `duration-100` | Colour, background, and border transitions on hover and focus |
| `duration-150` | Enter and exit of overlays and notifications |
| `duration-300` | Determinate progress bars only |

Nothing else animates. Motion never delays interaction and never runs on a value the user is currently manipulating. Every animated element carries `motion-reduce:animate-none` or `motion-reduce:transition-none`; the global `prefers-reduced-motion` block in `src/index.css` is a safety net, not a licence to skip this.

## 8. Tab anatomy

Two tab kinds exist and they are not interchangeable.

**Line tabs** (`<TabsList variant="line">`) represent open surfaces the user navigates between: document tabs, the bottom dock. They sit on `bg-workspace-chrome`, are separated from the content by `border-b`, use `rounded-none` triggers with `px-3` horizontal padding, and mark the active tab with the underline indicator the `TabsTrigger` recipe already provides. Their strip height is `h-10` for documents and `h-9` for the dock.

**Segmented tabs** (`variant="default"`) represent mutually exclusive views of one thing, such as a settings section. They sit inside their content area and use the filled active state.

Additional rules:

- A tab label truncates; it never wraps and never resizes the strip.
- A preview (unpinned) document tab is italic; promoting it to pinned removes the italic. Nothing else distinguishes them.
- Unsaved state is a dot with an accessible label, never colour alone.
- A close button appears on hover, on `focus-visible`, and when the tab is active.
- A tab strip scrolls horizontally; it never wraps to a second row.
- An empty tab strip keeps its height and states the condition, so the layout below does not shift.

## 9. Menu anatomy

- Popup: `min-w-44`, `rounded-md`, `border`, `bg-popover`, `p-1`, `shadow-popover`, `z-50`.
- Item: `rounded-sm px-2 py-1.5 text-sm`, highlighted with `data-highlighted:bg-accent data-highlighted:text-accent-foreground`.
- Shortcut hint: right-aligned with `ml-auto`, `text-xs text-muted-foreground`, rendered through `shortcutLabel()` in `src/lib/shortcuts.ts` so platform naming stays correct.
- Separators group related items. A menu with more than about seven items needs groups.
- A menu contains actions. It must not contain explanatory filler text standing in for an action that does not exist — that reads as a broken control. If a menu would be empty in the current state, omit the menu rather than filling it.
- Labels are verbs or noun phrases naming the effect (`Build PDF`, `Open project`), matching the wording used in the command palette and toolbar for the same action.

## 10. Feedback channels

Pick the channel from the situation, not from how important the change feels.

| Situation | Channel |
| --- | --- |
| The result is visible in the surface the user is already looking at | That surface's own state. No notification. |
| An ongoing or ambient condition: saving, watching, building, connected | The status bar |
| A completed background action whose result is off-screen | A notification, tone by outcome |
| A failure that still needs a decision from the user | A persistent notification carrying the action, or a dialog |
| A destructive, irreversible, or environment-affecting action | A dialog that names the specific impact |
| Long-running work the user started deliberately | Inline progress in the surface that owns it, with a stop control |

Notification rules:

- Tones are `success`, `info`, `warning`, `error`. `success` and `info` retire themselves; `warning` and `error` persist until the user acknowledges them, because they still represent an unresolved condition.
- A notification has a title, optional one-line detail, and at most one action. If it needs more than that, it needs a panel or a dialog.
- `error` announces assertively (`role="alert"`); every other tone announces politely (`role="status"`).
- Notifications never steal focus, never scroll the editor or PDF, and never overlay a control the user is currently using.
- Routine, self-evident work does not get a notification. A successful save updates status text; it does not raise a toast.

**An action reconciles the state it changes.** After an action alters the environment or the project, the same interaction must re-derive the invalidated state, update every dependent control's enabled state, and report the outcome through the channel above. `src/features/build/use-latex-install.ts` is the reference implementation: a finished install re-detects installation support, notifies its consumer so build profiles refresh, and raises exactly one completion notice.

## 11. Icons

- Icons come from `lucide-react`. Do not add another icon set or inline an SVG path.
- Default size is `size-4`. Dense chrome uses `size-3.5`. Nothing is smaller.
- Every icon is `aria-hidden="true"`; its meaning lives in the adjacent label, the `aria-label`, or the `title`.
- An icon never carries state alone. A coloured or swapped icon is always paired with text.
- Use `data-icon="inline-start"` / `inline-end` on icons inside buttons and tab triggers so the shared padding rules apply.

## 12. Checklist before writing user-facing code

1. Which surface in the ladder does this sit on, and does it need a border against its parent?
2. Which type token does each string use? Is there any `text-[…]` left?
3. Do the control heights match the density table for the row they sit in?
4. Which elevation step and which z-layer, from the fixed ladders?
5. Is focus, hover, and disabled styling the shared recipe rather than a local one?
6. Does anything animate for longer than the budget, and does it carry a `motion-reduce` escape?
7. Which feedback channel does the table select for each outcome — including failure and cancellation?
8. After this action succeeds, what state is now stale, and where is it re-derived?
9. Does every state carry text, not just colour or an icon?
10. Does the layout hold its geometry while loading, on a long label, and on an empty result?
