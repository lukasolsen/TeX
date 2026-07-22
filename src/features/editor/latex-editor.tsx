import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react"
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  selectAll,
  toggleComment,
} from "@codemirror/commands"
import {
  bracketMatching,
  foldable,
  foldCode,
  foldedRanges,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  unfoldCode,
  StreamLanguage,
} from "@codemirror/language"
import {
  highlightSelectionMatches,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  search,
  setSearchQuery,
} from "@codemirror/search"
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
} from "@codemirror/state"
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  rectangularSelection,
  tooltips,
} from "@codemirror/view"
import { lintGutter, nextDiagnostic } from "@codemirror/lint"
import { latexHoverTooltip } from "@/features/editor/latex-hover"
import { latexDiagnostics } from "@/features/editor/latex-diagnostics-extension"
import { latexAutoCloseEnvironment } from "@/features/editor/latex-auto-close-environment"
import { latexFolding } from "@/features/editor/latex-folding"
import { latexStreamParser } from "@/features/editor/latex-stream-parser"
import {
  navigationTargetAt,
  unresolvedSymbolMessage,
  type EditorPosition,
  type NavigationTarget,
} from "@/features/editor/latex-navigation"
import { requestLatexSymbol } from "@/services/latex-analysis-service"
import { runDetached } from "@/lib/promises"
import {
  editorContextActions,
  type EditorContextAction,
  type EditorContextActionId,
} from "@/features/editor/editor-context-actions"
import { EditorContextMenu } from "@/features/editor/editor-context-menu"
import { latexDelimiterMatching } from "@/features/editor/latex-matching"
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import {
  latexCompletionRowBadge,
  latexCompletionSource,
} from "@/features/editor/latex-completion"
import { latexHighlightStyle } from "@/features/editor/latex-highlighting"
import {
  latexSemanticHighlighting,
  setLatexSemanticContext,
} from "@/features/editor/latex-semantic-highlighting"
import type {
  EditorDocumentChange,
  EditorViewerState,
  ProjectEntry,
} from "@/domain/project"
import {
  editorFontStack,
  editorLineHeightRatio,
  indentUnitText,
  type AppPreferences,
  type EditorPreferences,
} from "@/domain/preferences"
import {
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import { isLatexSource, isOpenableFile } from "@/domain/file-kind"
import { treeContainsPath } from "@/features/projects/project-model"

export type EditorTarget = Readonly<{
  line: number
  column: number
  token: number
}>

type ProjectReference = { from: number; to: number } | null

function viewerSelectionPosition(
  content: string,
  viewerState: EditorViewerState | undefined
): number {
  const document = EditorState.create({ doc: content }).doc
  const line = document.line(
    Math.max(1, Math.min(viewerState?.line ?? 1, document.lines))
  )
  return Math.min(
    line.to,
    line.from + Math.max(0, (viewerState?.column ?? 1) - 1)
  )
}

/** The 1-based line and column of a document position. */
function positionOf(editor: EditorView, position: number): EditorPosition {
  const line = editor.state.doc.lineAt(position)
  return { line: line.number, column: position - line.from + 1 }
}

const setProjectReference = StateEffect.define<ProjectReference>()
const projectReferenceField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setProjectReference)) {
        const reference = effect.value
        return reference === null
          ? Decoration.none
          : Decoration.set([
              Decoration.mark({ class: "cm-project-reference" }).range(
                reference.from,
                reference.to
              ),
            ])
      }
    }
    // RangeSet.map remaps decoration positions through a ChangeDesc; the
    // argument is change data, not an array callback.
    // oxlint-disable-next-line no-array-callback-reference
    return decorations.map(transaction.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

function projectFilePaths(
  entry: ProjectEntry,
  parentPath: ProjectRelativePath | null = null,
  paths = new Set<ProjectRelativePath>()
): Set<ProjectRelativePath> {
  for (const child of entry.children) {
    const path = projectRelativePath(
      parentPath === null ? child.name : `${parentPath}/${child.name}`
    )
    if (child.kind === "file") paths.add(path)
    projectFilePaths(child, path, paths)
  }
  return paths
}

function sourceEditorTheme(fontSize: number, editor: EditorPreferences) {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--source)",
      color: "var(--source-foreground)",
      fontSize: `${fontSize}px`,
    },
    ".cm-content": {
      caretColor: "var(--source-foreground)",
      fontFamily: editorFontStack(editor.fontFamily),
      lineHeight: `${editorLineHeightRatio[editor.lineHeight]}`,
      padding: "1rem 0 4rem",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--source-foreground)",
      borderLeftWidth: "2px",
    },
    ".cm-line": { padding: "0 1rem" },
    ".cm-gutters": {
      backgroundColor: "var(--source)",
      color: "var(--muted-foreground)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "color-mix(in oklch, var(--muted) 65%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent)",
    },
    "&.cm-focused": {
      outline: "2px solid var(--ring)",
      outlineOffset: "-2px",
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-project-reference": {
      cursor: "pointer",
      backgroundImage: "linear-gradient(var(--primary), var(--primary))",
      backgroundPosition: "left calc(100% - 0.08em)",
      backgroundRepeat: "no-repeat",
      backgroundSize: "0 1.5px",
      animation:
        "tex-reference-underline 160ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
    },
    // Scoped away from the completion info panel, which also renders a hover
    // card: styling it as a floating tooltip made the completion widget read
    // as two separate dialogs.
    ".cm-tooltip:not(.cm-completionInfo):has(.tex-hover-card)": {
      border: "1px solid var(--border)",
      borderRadius: "0.75rem",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      maxWidth: "min(34rem, calc(100vw - 2rem))",
      maxHeight: "calc(100vh - 2rem)",
      overflow: "hidden",
    },
    ".tex-hover-card": {
      boxSizing: "border-box",
      maxHeight: "calc(100vh - 2rem)",
      overflowY: "auto",
      padding: "0.75rem 0.875rem",
    },
    ".tex-hover-card h2": {
      margin: "0",
      display: "block",
      fontFamily: "var(--font-sans)",
      fontSize: "0.8125rem",
    },
    ".tex-hover-card h3, .tex-hover-card h4, .tex-hover-card h5, .tex-hover-card h6":
      {
        margin: "0.8rem 0 0",
        fontFamily: "var(--font-sans)",
        fontSize: "0.75rem",
      },
    ".tex-hover-card p": {
      margin: "0.3rem 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.35",
      color: "var(--muted-foreground)",
    },
    ".tex-hover-card ul, .tex-hover-card ol": {
      margin: "0.45rem 0 0",
      paddingLeft: "1.25rem",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.35",
      color: "var(--muted-foreground)",
    },
    ".tex-hover-card a": {
      color: "var(--primary)",
      textDecoration: "underline",
      textUnderlineOffset: "0.14em",
    },
    ".tex-hover-card a:focus-visible": {
      outline: "2px solid var(--ring)",
      outlineOffset: "2px",
    },
    ".tex-hover-card pre": {
      maxHeight: "18rem",
      margin: "0.35rem 0 0",
      overflow: "auto",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      backgroundColor: "var(--editor-preview)",
      padding: "0.7rem 0.75rem",
      fontSize: "0.6875rem",
      lineHeight: "1.5",
      color: "var(--editor-preview-foreground)",
    },
    ".tex-hover-card code": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.92em",
    },
    // Density follows the VS Code suggest widget: 22px rows, one line each,
    // no rules between them, and the detail beside the label rather than
    // pushed to the far edge.
    ".cm-tooltip-autocomplete": {
      border: "1px solid var(--border)",
      borderRadius: "calc(var(--radius) * 0.8)",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "var(--elevation-popover)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      maxHeight: "16.5rem",
      minWidth: "22rem",
      maxWidth: "30rem",
      fontFamily: "var(--font-sans)",
      fontSize: "0.8125rem",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "center",
      gap: "0.375rem",
      minHeight: "1.375rem",
      padding: "0 0.5rem",
      lineHeight: "1.375rem",
      borderBottom: "none",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-completionLabel": {
      flex: "none",
      fontFamily: "var(--font-mono)",
      fontWeight: "400",
      color: "var(--foreground)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel": {
      color: "var(--accent-foreground)",
    },
    ".cm-completionMatchedText": {
      textDecoration: "none",
      fontWeight: "600",
      color: "var(--primary)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText":
      { color: "inherit" },
    ".cm-completionDetail": {
      flex: "1 1 auto",
      minWidth: "0",
      marginLeft: "0.25rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontStyle: "normal",
      color: "var(--muted-foreground)",
      fontSize: "0.6875rem",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
      color: "color-mix(in oklch, var(--accent-foreground) 72%, transparent)",
    },
    ".tex-completion-icon": {
      flex: "none",
      width: "14px",
      height: "14px",
    },
    ".tex-completion-icon-command": { color: "var(--completion-icon-command)" },
    ".tex-completion-icon-environment": {
      color: "var(--completion-icon-environment)",
    },
    ".tex-completion-icon-snippet": { color: "var(--completion-icon-snippet)" },
    ".tex-completion-icon-label": { color: "var(--completion-icon-label)" },
    ".tex-completion-icon-citation": {
      color: "var(--completion-icon-citation)",
    },
    ".tex-completion-icon-file": { color: "var(--completion-icon-file)" },
    ".tex-completion-icon-package": { color: "var(--completion-icon-package)" },
    ".tex-completion-icon-class": { color: "var(--completion-icon-class)" },
    // CodeMirror styles this element as `.cm-tooltip.cm-completionInfo`, so
    // matching that specificity is what makes these rules apply at all.
    ".cm-tooltip.cm-completionInfo": {
      width: "max-content",
      minWidth: "14rem",
      maxWidth: "22rem",
      maxHeight: "16.5rem",
      overflowY: "auto",
      padding: "0",
      whiteSpace: "normal",
      border: "1px solid var(--border)",
      borderRadius: "0",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "none",
    },
    // Docked against the list, the panel shares its edge and rounds only the
    // outer corners, so the pair reads as one widget rather than two.
    ".cm-tooltip.cm-completionInfo.cm-completionInfo-right": {
      borderLeft: "none",
      borderRadius: "0 calc(var(--radius) * 0.8) calc(var(--radius) * 0.8) 0",
    },
    ".cm-tooltip.cm-completionInfo.cm-completionInfo-left": {
      borderRight: "none",
      borderRadius: "calc(var(--radius) * 0.8) 0 0 calc(var(--radius) * 0.8)",
    },
    // The narrow variants float free of the list, so they keep a full outline.
    ".cm-tooltip.cm-completionInfo.cm-completionInfo-right-narrow, .cm-tooltip.cm-completionInfo.cm-completionInfo-left-narrow":
      {
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) * 0.8)",
        boxShadow: "var(--elevation-popover)",
      },
    // The card is already inside the panel's scroll container; a second one
    // would trap the wheel.
    ".cm-completionInfo .tex-hover-card": {
      maxHeight: "none",
      overflowY: "visible",
      padding: "0.5rem 0.625rem",
    },
    ".tex-completion-info": {
      display: "flex",
      flexDirection: "column",
      gap: "0.375rem",
      padding: "0.5rem 0.625rem",
    },
    ".tex-completion-meta": {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.375rem",
    },
    ".tex-completion-provenance": {
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      color: "var(--muted-foreground)",
    },
    ".tex-completion-description": {
      margin: "0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.45",
      color: "var(--popover-foreground)",
    },
    ".tex-completion-preview-label": {
      margin: "0.25rem 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      fontWeight: "600",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
    },
    ".tex-completion-preview": {
      margin: "0",
      maxHeight: "9rem",
      overflow: "auto",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      backgroundColor: "var(--editor-preview)",
      padding: "0.6rem 0.7rem",
      fontFamily: "var(--font-mono)",
      fontSize: "0.6875rem",
      lineHeight: "1.55",
      whiteSpace: "pre",
      color: "var(--editor-preview-foreground)",
    },
    ".tex-completion-hint": {
      margin: "0.125rem 0 0",
      paddingTop: "0.375rem",
      borderTop:
        "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      color: "var(--muted-foreground)",
    },
  })
}

/** The editor attributes that carry a preference, kept together so the tab-switch
 * path and the preference-change path cannot configure them differently. */
function contentAttributes(
  label: string,
  editor: EditorPreferences
): Extension {
  return EditorView.contentAttributes.of({
    "aria-label": label,
    "aria-multiline": "true",
    spellcheck: editor.spellCheck ? "true" : "false",
  })
}

export function LatexEditor({
  content,
  fontSize,
  label,
  preferences,
  initialViewerState,
  onChange,
  onCursorChange,
  onDiagnosticsChange,
  onOpenReference,
  onOpenFind,
  onReport,
  onSave,
  onViewerStateChange,
  path,
  projectPath,
  projectTree,
  retainedPaths,
  target,
}: {
  content: string
  fontSize: number
  label: string
  preferences: AppPreferences
  initialViewerState: EditorViewerState | undefined
  onChange: (change: EditorDocumentChange) => void
  onCursorChange: (line: number, column: number) => void
  onDiagnosticsChange: (
    path: ProjectRelativePath,
    diagnostics: readonly LatexDiagnosticEntry[],
    projectAnalysisComplete: boolean
  ) => void
  onOpenReference: (
    path: ProjectRelativePath,
    position: EditorPosition | null
  ) => void
  onOpenFind: () => void
  onReport: (message: string) => void
  onSave: () => void
  onViewerStateChange: (
    path: ProjectRelativePath,
    state: EditorViewerState
  ) => void
  path: ProjectRelativePath
  projectPath: CanonicalProjectPath
  projectTree: ProjectEntry
  retainedPaths: ReadonlyArray<ProjectRelativePath>
  target: EditorTarget | null
}): ReactElement {
  const [contextActions, setContextActions] = useState<
    readonly EditorContextAction[]
  >([])
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const contextMenu = useRef<{
    prepare: (event: { clientX: number; clientY: number }) => void
    run: (id: EditorContextActionId) => void
  } | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange)
  const onOpenReferenceRef = useRef(onOpenReference)
  const onOpenFindRef = useRef(onOpenFind)
  const onReportRef = useRef(onReport)
  const onSaveRef = useRef(onSave)
  const onViewerStateChangeRef = useRef(onViewerStateChange)
  const viewerStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialViewerStateRef = useRef(initialViewerState)
  const applyingExternalContent = useRef(false)
  const contentRef = useRef(content)
  const fontSizeRef = useRef(fontSize)
  const labelRef = useRef(label)
  const preferencesRef = useRef(preferences)
  const projectPathRef = useRef(projectPath)
  const projectTreeRef = useRef(projectTree)
  const themeCompartment = useRef(new Compartment())
  const attributesCompartment = useRef(new Compartment())
  const settingsCompartment = useRef(new Compartment())
  // Assigned when the view is built; the extensions it produces close over the
  // same refs the rest of the editor uses.
  const reconfigureSettings = useRef<
    | ((
        settings: AppPreferences,
        documentPath: ProjectRelativePath
      ) => StateEffect<unknown>)
    | null
  >(null)
  const activePath = useRef(path)
  const extensions = useRef<Extension[]>([])
  const documentStates = useRef(
    new Map<
      ProjectRelativePath,
      { state: EditorState; scrollTop: number; scrollLeft: number }
    >()
  )

  const emitViewerState = useCallback((editor: EditorView) => {
    const head = editor.state.selection.main.head
    const line = editor.state.doc.lineAt(head)
    onViewerStateChangeRef.current(activePath.current, {
      line: line.number,
      column: head - line.from + 1,
      scrollTop: Math.max(0, editor.scrollDOM.scrollTop),
      scrollLeft: Math.max(0, editor.scrollDOM.scrollLeft),
    })
  }, [])

  const scheduleViewerState = useCallback(
    (editor: EditorView) => {
      if (viewerStateTimer.current !== null) {
        clearTimeout(viewerStateTimer.current)
      }
      viewerStateTimer.current = setTimeout(() => {
        viewerStateTimer.current = null
        emitViewerState(editor)
      }, 250)
    },
    [emitViewerState]
  )

  useEffect(() => {
    onChangeRef.current = onChange
    onCursorChangeRef.current = onCursorChange
    onDiagnosticsChangeRef.current = onDiagnosticsChange
    onOpenReferenceRef.current = onOpenReference
    onOpenFindRef.current = onOpenFind
    onReportRef.current = onReport
    onSaveRef.current = onSave
    onViewerStateChangeRef.current = onViewerStateChange
  }, [
    onChange,
    onCursorChange,
    onDiagnosticsChange,
    onOpenFind,
    onOpenReference,
    onReport,
    onSave,
    onViewerStateChange,
  ])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    projectPathRef.current = projectPath
  }, [projectPath])

  useEffect(() => {
    projectTreeRef.current = projectTree
    view.current?.dispatch({
      effects: setLatexSemanticContext.of({
        sourcePath: activePath.current,
        projectFiles: projectFilePaths(projectTree),
      }),
    })
  }, [projectTree])

  useEffect(() => {
    if (host.current === null) return
    let activeReference: ProjectReference = null
    const fileExists = (candidate: ProjectRelativePath) =>
      isOpenableFile(candidate) &&
      treeContainsPath(projectTreeRef.current, candidate)
    const targetAt = (editor: EditorView, position: number) =>
      navigationTargetAt(
        editor.state.doc,
        activePath.current,
        position,
        fileExists
      )
    const targetAtPointer = (editor: EditorView, event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey) return null
      const position = editor.posAtCoords({
        x: event.clientX,
        y: event.clientY,
      })
      return position === null ? null : targetAt(editor, position)
    }
    const updateReferenceDecoration = (
      editor: EditorView,
      reference: ProjectReference
    ) => {
      if (
        activeReference?.from === reference?.from &&
        activeReference?.to === reference?.to
      ) {
        return
      }
      activeReference = reference
      editor.dispatch({ effects: setProjectReference.of(reference) })
    }
    const followTarget = async (
      editor: EditorView,
      navigationTarget: NavigationTarget
    ) => {
      if (navigationTarget.kind === "file") {
        onOpenReferenceRef.current(navigationTarget.path, null)
        return
      }
      // Only the project index knows where a label or citation is defined, so
      // the jump is resolved when the user commits to it, not while hovering.
      try {
        const symbol = await requestLatexSymbol({
          projectPath: projectPathRef.current,
          relativePath: activePath.current,
          content: editor.state.doc.toString(),
          ...positionOf(editor, navigationTarget.from),
        })
        const definition = symbol?.definitions[0]
        if (definition === undefined) {
          onReportRef.current(unresolvedSymbolMessage(navigationTarget))
          return
        }
        onOpenReferenceRef.current(definition.path, {
          line: definition.span.line,
          column: definition.span.column,
        })
      } catch {
        onReportRef.current("TeX could not look up that reference")
      }
    }
    const openReferenceAtSelection = (editor: EditorView) => {
      const selectionTarget = targetAt(editor, editor.state.selection.main.head)
      if (selectionTarget === null) return false
      runDetached(followTarget(editor, selectionTarget))
      return true
    }
    // The right-click menu is prepared from the position under the pointer, so
    // "Go to definition" reflects what was clicked rather than where the
    // caret happened to be.
    let contextTarget: NavigationTarget | null = null
    const prepareContextMenu = (event: {
      clientX: number
      clientY: number
    }) => {
      const editor = view.current
      if (editor === null) return
      const position = editor.posAtCoords({
        x: event.clientX,
        y: event.clientY,
      })
      const selection = editor.state.selection.main
      if (
        position !== null &&
        (position < selection.from || position > selection.to)
      ) {
        // Clicking outside the selection moves the caret first, the way a
        // desktop editor does, so an action operates on what was clicked.
        editor.dispatch({ selection: { anchor: position } })
      }
      const head = editor.state.selection.main.head
      contextTarget = targetAt(editor, position ?? head)
      const line = editor.state.doc.lineAt(head)
      let folded = false
      foldedRanges(editor.state).between(line.from, line.to, (from) => {
        if (from >= line.from && from <= line.to) folded = true
      })
      setContextActions(
        editorContextActions({
          navigable: contextTarget !== null,
          hasSelection: !editor.state.selection.main.empty,
          foldable: foldable(editor.state, line.from, line.to) !== null,
          folded,
          readOnly: editor.state.readOnly,
        })
      )
    }
    const writeClipboard = async (text: string, andDelete: boolean) => {
      const editor = view.current
      if (editor === null) return
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        onReportRef.current("TeX could not use the system clipboard")
        return
      }
      if (!andDelete) return
      const selection = editor.state.selection.main
      editor.dispatch({
        changes: { from: selection.from, to: selection.to, insert: "" },
        userEvent: "delete.cut",
      })
    }
    const pasteClipboard = async () => {
      const editor = view.current
      if (editor === null) return
      let text: string
      try {
        text = await navigator.clipboard.readText()
      } catch {
        onReportRef.current("TeX could not read the system clipboard")
        return
      }
      if (text === "") return
      const selection = editor.state.selection.main
      editor.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
        userEvent: "input.paste",
      })
    }
    const runContextAction = (id: EditorContextActionId) => {
      const editor = view.current
      if (editor === null) return
      const selection = editor.state.selection.main
      switch (id) {
        case "go-to-definition":
          if (contextTarget !== null) {
            runDetached(followTarget(editor, contextTarget))
          }
          break
        case "copy":
          runDetached(
            writeClipboard(
              editor.state.sliceDoc(selection.from, selection.to),
              false
            )
          )
          break
        case "cut":
          runDetached(
            writeClipboard(
              editor.state.sliceDoc(selection.from, selection.to),
              true
            )
          )
          break
        case "paste":
          runDetached(pasteClipboard())
          break
        case "toggle-comment":
          toggleComment(editor)
          break
        case "fold":
          foldCode(editor)
          break
        case "unfold":
          unfoldCode(editor)
          break
        case "find-in-file":
          onOpenFindRef.current()
          break
        case "select-all":
          selectAll(editor)
          break
      }
      editor.focus()
    }
    contextMenu.current = {
      prepare: prepareContextMenu,
      run: runContextAction,
    }

    // Everything a preference or the open file can turn on, off, or resize.
    // Held in one compartment so a settings change or a tab switch reconfigures
    // the live editor in place rather than rebuilding it and losing the cursor,
    // scroll, and undo history.
    const configurableExtensions = (
      settings: AppPreferences,
      documentPath: ProjectRelativePath
    ): Extension[] => {
      const { editor } = settings
      // A log, a data file, or a Makefile is editable but is not LaTeX, so TeX
      // does not offer completions, hovers, or diagnostics it cannot mean.
      const assistance = isLatexSource(documentPath)
        ? settings.assistance
        : {
            ...settings.assistance,
            hoverDocumentation: false,
            diagnosticsEnabled: false,
            completionEnabled: false,
          }
      return [
        editor.showLineNumbers
          ? [lineNumbers(), highlightActiveLineGutter()]
          : [],
        editor.highlightActiveLine ? highlightActiveLine() : [],
        editor.highlightSelectionMatches ? highlightSelectionMatches() : [],
        editor.wrapLines ? EditorView.lineWrapping : [],
        editor.autoCloseBrackets ? closeBrackets() : [],
        editor.autoCloseEnvironments ? latexAutoCloseEnvironment() : [],
        indentUnit.of(indentUnitText(editor.indentStyle, editor.indentWidth)),
        EditorState.tabSize.of(editor.indentWidth),
        assistance.hoverDocumentation
          ? hoverTooltip(
              (hoverView, position) =>
                latexHoverTooltip(projectPathRef.current, activePath.current)(
                  hoverView,
                  position
                ),
              { hoverTime: assistance.hoverDelay, hideOnChange: true }
            )
          : [],
        assistance.diagnosticsEnabled
          ? [
              lintGutter(),
              latexDiagnostics({
                projectPath: () => projectPathRef.current,
                relativePath: () => activePath.current,
                onDiagnosticsChange: (diagnostics, complete) =>
                  onDiagnosticsChangeRef.current(
                    activePath.current,
                    diagnostics,
                    complete
                  ),
              }),
            ]
          : [],
        assistance.completionEnabled
          ? autocompletion({
              override: [
                latexCompletionSource(
                  () => projectPathRef.current,
                  () => activePath.current
                ),
              ],
              addToOptions: [latexCompletionRowBadge],
              icons: false,
              activateOnTyping: assistance.completionOnTyping,
              maxRenderedOptions: assistance.completionLimit,
            })
          : [],
      ]
    }

    const editorExtensions: Extension[] = [
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      StreamLanguage.define(latexStreamParser),
      syntaxHighlighting(latexHighlightStyle),
      latexSemanticHighlighting({
        sourcePath: activePath.current,
        projectFiles: projectFilePaths(projectTreeRef.current),
      }),
      bracketMatching(),
      latexDelimiterMatching(),
      latexFolding(),
      rectangularSelection(),
      crosshairCursor(),
      settingsCompartment.current.of(
        configurableExtensions(preferencesRef.current, activePath.current)
      ),
      tooltips({
        tooltipSpace: (editor) => {
          const bounds = editor.dom.getBoundingClientRect()
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          }
        },
      }),
      projectReferenceField,
      search({ top: true }),
      EditorView.domEventHandlers({
        compositionend: (_event, editor) => {
          queueMicrotask(() => {
            onChangeRef.current({
              content: editor.state.doc.toString(),
              composing: false,
            })
          })
          return false
        },
        mousemove: (event, editor) => {
          if (!(event instanceof MouseEvent)) return false
          const pointerTarget = targetAtPointer(editor, event)
          updateReferenceDecoration(
            editor,
            pointerTarget === null
              ? null
              : { from: pointerTarget.from, to: pointerTarget.to }
          )
          return false
        },
        mouseleave: (_event, editor) => {
          updateReferenceDecoration(editor, null)
          return false
        },
        keyup: (_event, editor) => {
          updateReferenceDecoration(editor, null)
          return false
        },
        click: (event, editor) => {
          if (!(event instanceof MouseEvent)) return false
          const pointerTarget = targetAtPointer(editor, event)
          if (pointerTarget === null) return false
          event.preventDefault()
          updateReferenceDecoration(editor, null)
          runDetached(followTarget(editor, pointerTarget))
          return true
        },
      }),
      keymap.of([
        { key: "Mod-s", run: () => (onSaveRef.current(), true) },
        { key: "Mod-f", run: () => (onOpenFindRef.current(), true) },
        { key: "Mod-/", run: toggleComment },
        { key: "Mod-Enter", run: openReferenceAtSelection },
        // F8 already steps through build diagnostics across the workspace, so
        // stepping through editor diagnostics takes the modified chord.
        { key: "Alt-F8", run: nextDiagnostic },
        indentWithTab,
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalContent.current) {
          onChangeRef.current({
            content: update.state.doc.toString(),
            composing: update.view.composing,
          })
        }
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          onCursorChangeRef.current(line.number, head - line.from + 1)
        }
        if (
          update.selectionSet ||
          update.docChanged ||
          update.viewportChanged
        ) {
          scheduleViewerState(update.view)
        }
      }),
      themeCompartment.current.of(
        sourceEditorTheme(fontSizeRef.current, preferencesRef.current.editor)
      ),
      attributesCompartment.current.of(
        contentAttributes(labelRef.current, preferencesRef.current.editor)
      ),
    ]
    reconfigureSettings.current = (settings, documentPath) =>
      settingsCompartment.current.reconfigure(
        configurableExtensions(settings, documentPath)
      )
    extensions.current = editorExtensions
    const initialPosition = viewerSelectionPosition(
      contentRef.current,
      initialViewerStateRef.current
    )
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: contentRef.current,
        extensions: editorExtensions,
        selection: { anchor: initialPosition },
      }),
    })
    editor.scrollDOM.scrollTop = initialViewerStateRef.current?.scrollTop ?? 0
    editor.scrollDOM.scrollLeft = initialViewerStateRef.current?.scrollLeft ?? 0
    const onScroll = () => scheduleViewerState(editor)
    editor.scrollDOM.addEventListener("scroll", onScroll, { passive: true })
    const toggleLineComment = () => toggleComment(editor)
    const findInFile = () => onOpenFindRef.current()
    const runFind = (event: Event) => {
      if (
        !(event instanceof CustomEvent) ||
        typeof event.detail !== "object" ||
        event.detail === null
      )
        return
      const detail = event.detail
      if (
        typeof detail.query !== "string" ||
        typeof detail.caseSensitive !== "boolean" ||
        typeof detail.wholeWord !== "boolean" ||
        typeof detail.regexp !== "boolean"
      )
        return
      const query = new SearchQuery({
        search: detail.query,
        caseSensitive: detail.caseSensitive,
        wholeWord: detail.wholeWord,
        regexp: detail.regexp,
      })
      editor.dispatch({
        effects: setSearchQuery.of(query),
      })
      let matches = 0
      const cursor = query.getCursor(editor.state)
      for (let match = cursor.next(); !match.done; match = cursor.next()) {
        matches += 1
      }
      window.dispatchEvent(
        new CustomEvent("tex:source-find-status", {
          detail: { matches, valid: query.valid },
        })
      )
      if (query.valid && detail.query !== "") findNext(editor)
    }
    const findPreviousInFile = () => findPrevious(editor)
    const findNextInFile = () => findNext(editor)
    const replaceInFile = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail
      if (
        typeof detail !== "object" ||
        detail === null ||
        typeof detail.query !== "string" ||
        typeof detail.replacement !== "string" ||
        (detail.action !== "next" && detail.action !== "all")
      )
        return
      editor.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({ search: detail.query, replace: detail.replacement })
        ),
      })
      if (detail.action === "next") replaceNext(editor)
      else replaceAll(editor)
    }
    window.addEventListener("tex:toggle-comment", toggleLineComment)
    window.addEventListener("tex:find-in-file", findInFile)
    window.addEventListener("tex:source-find", runFind)
    window.addEventListener("tex:source-find-previous", findPreviousInFile)
    window.addEventListener("tex:source-find-next", findNextInFile)
    window.addEventListener("tex:source-replace", replaceInFile)
    view.current = editor
    onCursorChangeRef.current(
      initialViewerStateRef.current?.line ?? 1,
      initialViewerStateRef.current?.column ?? 1
    )
    return () => {
      window.removeEventListener("tex:toggle-comment", toggleLineComment)
      window.removeEventListener("tex:find-in-file", findInFile)
      window.removeEventListener("tex:source-find", runFind)
      window.removeEventListener("tex:source-find-previous", findPreviousInFile)
      window.removeEventListener("tex:source-find-next", findNextInFile)
      window.removeEventListener("tex:source-replace", replaceInFile)
      editor.scrollDOM.removeEventListener("scroll", onScroll)
      if (viewerStateTimer.current !== null) {
        clearTimeout(viewerStateTimer.current)
      }
      emitViewerState(editor)
      editor.destroy()
      view.current = null
    }
  }, [emitViewerState, scheduleViewerState])

  useEffect(() => {
    fontSizeRef.current = fontSize
    preferencesRef.current = preferences
    const editor = view.current
    if (editor === null) return
    const settingsEffect = reconfigureSettings.current?.(
      preferences,
      activePath.current
    )
    editor.dispatch({
      effects: [
        themeCompartment.current.reconfigure(
          sourceEditorTheme(fontSize, preferences.editor)
        ),
        attributesCompartment.current.reconfigure(
          contentAttributes(labelRef.current, preferences.editor)
        ),
        ...(settingsEffect === undefined ? [] : [settingsEffect]),
      ],
    })
  }, [fontSize, preferences])

  // A turned-off analysis leaves the previous result on screen otherwise, which
  // would claim the file has problems TeX is no longer checking for.
  useEffect(() => {
    if (preferences.assistance.diagnosticsEnabled) return
    onDiagnosticsChangeRef.current(activePath.current, [], true)
  }, [preferences.assistance.diagnosticsEnabled])

  useEffect(() => {
    labelRef.current = label
    view.current?.dispatch({
      effects: attributesCompartment.current.reconfigure(
        contentAttributes(label, preferencesRef.current.editor)
      ),
    })
  }, [label])

  useEffect(() => {
    const editor = view.current
    if (editor === null || activePath.current === path) return
    if (viewerStateTimer.current !== null) {
      clearTimeout(viewerStateTimer.current)
      viewerStateTimer.current = null
    }
    emitViewerState(editor)
    documentStates.current.set(activePath.current, {
      state: editor.state,
      scrollTop: editor.scrollDOM.scrollTop,
      scrollLeft: editor.scrollDOM.scrollLeft,
    })
    const restored = documentStates.current.get(path)
    let nextState =
      restored?.state ??
      EditorState.create({
        doc: contentRef.current,
        extensions: extensions.current,
        selection: {
          anchor: viewerSelectionPosition(
            contentRef.current,
            initialViewerState
          ),
        },
      })
    if (nextState.doc.toString() !== contentRef.current) {
      nextState = nextState.update({
        changes: {
          from: 0,
          to: nextState.doc.length,
          insert: contentRef.current,
        },
        annotations: Transaction.addToHistory.of(false),
      }).state
    }
    editor.setState(nextState)
    // A restored or newly created state carries the configuration captured when
    // the extension list was built, so every compartment is re-applied here.
    const settingsEffect = reconfigureSettings.current?.(
      preferencesRef.current,
      path
    )
    editor.dispatch({
      effects: [
        themeCompartment.current.reconfigure(
          sourceEditorTheme(fontSizeRef.current, preferencesRef.current.editor)
        ),
        attributesCompartment.current.reconfigure(
          contentAttributes(labelRef.current, preferencesRef.current.editor)
        ),
        ...(settingsEffect === undefined ? [] : [settingsEffect]),
      ],
    })
    editor.scrollDOM.scrollTop =
      restored?.scrollTop ?? initialViewerState?.scrollTop ?? 0
    editor.scrollDOM.scrollLeft =
      restored?.scrollLeft ?? initialViewerState?.scrollLeft ?? 0
    activePath.current = path
    const head = editor.state.selection.main.head
    const activeLine = editor.state.doc.lineAt(head)
    onCursorChangeRef.current(activeLine.number, head - activeLine.from + 1)
    editor.dispatch({
      effects: setLatexSemanticContext.of({
        sourcePath: path,
        projectFiles: projectFilePaths(projectTreeRef.current),
      }),
    })
  }, [emitViewerState, initialViewerState, path])

  useEffect(() => {
    const retained = new Set([...retainedPaths, path])
    for (const cachedPath of documentStates.current.keys()) {
      if (!retained.has(cachedPath)) documentStates.current.delete(cachedPath)
    }
  }, [path, retainedPaths])

  useEffect(() => {
    const editor = view.current
    if (editor === null || editor.state.doc.toString() === content) return
    const head = Math.min(editor.state.selection.main.head, content.length)
    applyingExternalContent.current = true
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: content },
      selection: { anchor: head },
      annotations: Transaction.addToHistory.of(false),
    })
    applyingExternalContent.current = false
  }, [content])

  useEffect(() => {
    const editor = view.current
    if (editor === null || target === null) return
    const line = editor.state.doc.line(
      Math.min(target.line, editor.state.doc.lines)
    )
    const position = Math.min(
      line.to,
      line.from + Math.max(0, target.column - 1)
    )
    editor.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: "center" }),
    })
    editor.focus()
  }, [target])

  return (
    <EditorContextMenu
      actions={contextActions}
      onOpen={(event) => contextMenu.current?.prepare(event)}
      onSelect={(id) => contextMenu.current?.run(id)}
    >
      <div
        className="min-h-0 flex-1"
        data-workspace-focus="source"
        ref={host}
        tabIndex={-1}
      />
    </EditorContextMenu>
  )
}
