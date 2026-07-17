# UI/UX requirements

This document is mandatory for every user-facing change. TeX should feel contemporary without making people learn a new mental model before they can write. The interface is a calm, responsive desktop workspace for established LaTeX users—not a dashboard, a marketing surface, or an experiment in unfamiliar interaction patterns.

## Product experience standard

The interface must make users feel that they are in control, that their work is safe, and that the application has understood their action. The product should borrow familiar interaction patterns from high-quality writing and productivity tools—clear hierarchy, direct actions, stable navigation, obvious status, progressive disclosure—without copying a branded visual style or importing unrelated product conventions.

Modern means reduced friction and clear feedback. It does not mean novelty, decorative motion, hidden controls, or replacing well-understood desktop behavior with an invented gesture.

## Required interaction principles

### Familiar before novel

- Use recognizable desktop and document-editor conventions for project opening, menus, keyboard shortcuts, tabs, search, panels, dialogs, file trees, editors, and PDF controls.
- Place primary actions where users expect them and retain their location across states. `Open project`, `Build`, `Stop`, `Search`, and diagnostic navigation must not move because surrounding content changes.
- Prefer a simple focused starting surface: one clear primary action, a truthful recent-project list when it exists, and minimal supporting guidance. Do not turn an empty state into a dashboard.
- Use progressive disclosure: show the next useful decision first, then reveal advanced build profiles, logs, project settings, and recovery detail when requested or necessary.
- New patterns require a clear advantage over a familiar alternative and must remain keyboard-accessible and discoverable without a tutorial.

### Truthful interface

- Render only data, capabilities, and statuses that exist. Never ship fabricated project entries, document metrics, collaborators, avatars, user accounts, build history, notifications, or file content.
- Do not render enabled controls for unavailable functionality. If a pre-release surface must acknowledge a future capability, use explanatory static text outside the primary workflow; it must not resemble an actionable product control.
- Empty states state the current condition and the real next action. Example: `No recent projects` followed by `Open project`; not fake recent files or an account prompt.
- Label destructive, irreversible, or environment-affecting actions plainly. The user must know whether an action edits source, runs a command, deletes files, changes a project setting, or opens an external application.

### Immediate acknowledgement and visible progress

- Every deliberate action receives acknowledgement within the interaction frame: pressed state, focus retention, immediate state change, or a visible queued/running status. A click must never leave the user asking whether it registered.
- Do not use an indefinite spinner as the only evidence of work. Long operations identify what is happening, the affected project/file when safe, and provide a meaningful next action such as `Stop`, `Hide details`, or `View log`.
- Disable duplicate execution only while an operation is genuinely unavailable. Pair a disabled control with clear status; do not silently ignore repeated input.
- Completion feedback is proportional. A successful autosave can update quiet status text; a build result needs a stable status, error/warning count, and a route to details. Avoid celebratory toasts for routine work.
- Failures preserve the surrounding work and explain: what failed, what remains safe, the next useful action, and where detailed evidence is available. Never replace useful editor/PDF content with a generic error surface.
- Status changes must not steal focus, scroll the user, close a panel, or move the PDF unless the user explicitly requested navigation.

### User control and work safety

- Treat source text, reading position, cursor/selection, pane sizes, active tab, PDF zoom/page/layout, and open panels as user-owned context. Automatic updates preserve them unless the user chooses otherwise.
- Maintain the last known-good PDF during builds and after build failures. Never reset a PDF to page 1 during an automatic refresh.
- Autosave, watch mode, external-change handling, recovery, and build execution must always have visible state. Users must be able to identify whether the system is saving, watching, building, stopped, conflicted, or recovered.
- Ask before consequential actions; provide undo, cancel, or recovery where possible. Confirmation must name the impact, not use generic wording such as `Are you sure?`.
- Do not make users fear experimentation. A failed compile, cancelled build, search, or navigation action must not lose text, PDF context, logs, or previous output.

### Fast, stable, and responsive

- Keep typing, scrolling, pointer feedback, focus movement, and pane resizing responsive while indexing, searching, parsing logs, loading PDFs, or building. Background work never blocks the editing/rendering path.
- Render an actionable shell before non-critical work completes. Use compact skeletons only where content is genuinely loading; never use them to disguise missing implementation or invented data.
- Preserve layout geometry during loading and updates. Avoid content jumps, panels that resize unexpectedly, and controls that change position under the pointer.
- Debounce user-triggered continuous inputs appropriately, but update direct manipulation immediately. For example, typing updates the editor immediately; project search can defer its expensive query while showing the current query and result state.
- Motion is functional only: it may establish a spatial relationship or confirm a state transition. It must be short, interruptible, respect reduced-motion preferences, and never delay interaction.

### Information hierarchy and visual language

- The primary task dominates the screen. In the editor workspace, source and PDF are the primary surfaces; project navigation, build status, diagnostics, and logs support them without competing for attention.
- Use a restrained visual hierarchy: clear typography, spacing, grouping, semantic colour, and durable labels. Do not rely on decoration, gradients, or animation to communicate state.
- Colour reinforces state but never carries it alone. Build/error/saved/conflict states also have text, iconography where helpful, and programmatic accessibility information.
- Keep terminology consistent across menus, buttons, status, documentation, and keyboard commands. Use domain language familiar to LaTeX authors: project, root file, build, PDF, diagnostic, source, and log.
- Prefer direct labels (`Build PDF`, `Open project`, `Go to diagnostic`) over clever or ambiguous language.

### Accessibility is inseparable from quality

- Meet the accessibility rules in `code-quality.md` and use semantic controls before custom interactions.
- All primary workflows work by keyboard with visible focus and predictable focus order. Pointer-only affordances have a keyboard equivalent.
- Screen-reader announcements are concise, relevant, and non-disruptive. Announce meaningful state changes—build started/completed/failed, save failure, recovery available—without reading routine visual churn.
- Support text scaling, zoom, high contrast, reduced motion, and sufficient contrast. Do not make dense editor interfaces dependent on perfect eyesight, a large display, or a precise pointer.

## UI state requirements

Every asynchronous or stateful feature must define and render its complete state model before implementation. At minimum, consider:

| State | Requirement |
| --- | --- |
| Initial | Explain the real next action without mock data or irrelevant onboarding. |
| Ready | Show available actions and current context clearly. |
| Pending | Acknowledge the action immediately; retain user context and prevent only invalid duplicates. |
| Progress | State what is active and expose control/details for operations long enough to matter. |
| Success | Confirm proportionally and leave the user in a useful, stable state. |
| Empty | State why content is absent and provide the truthful next action. |
| Error | Preserve work; identify failure and safe next steps; retain technical evidence. |
| Offline/unavailable | Explain the limitation without pretending a capability exists. |
| External change/conflict | Explain both versions/states and require a deliberate resolution. |

Do not model these states with an unstructured collection of booleans. Use explicit, exhaustive state types so loading, error, cancellation, and recovery cannot be omitted accidentally.

## Feature review gate

Before merging a user-facing change, answer these questions in the pull request or handoff:

1. What user task does this simplify, and which familiar model does it follow?
2. What does the interface show immediately after every user action?
3. What happens while work is pending, on success, on cancellation, and on failure?
4. Which user context is preserved across this change?
5. Is every displayed datum and action real today, rather than mock or aspirational?
6. Can the workflow be completed with keyboard and assistive technology?
7. Does the layout remain stable and responsive on a large project or slow operation?
8. Could a user misunderstand the effect of this action or fear losing work? If so, revise the interaction.

## Required validation

- Test the initial, empty, pending, success, failure, cancellation, and recovery states relevant to the change.
- Verify mouse, keyboard, and screen-reader paths for the changed workflow.
- Verify that status feedback is visible without focus theft and that automatic updates preserve the active editor/PDF context.
- Verify no mock data, unavailable controls, placeholder accounts, or fabricated status leaks into the shipped UI.
- Use a real fixture or clearly labeled development-only test data; test data must never be presented as a user's content.
