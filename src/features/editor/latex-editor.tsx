import { useCallback, useEffect, useRef, type ReactElement } from "react"
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
  toggleComment,
} from "@codemirror/commands"
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  StreamLanguage,
} from "@codemirror/language"
import { stex } from "@codemirror/legacy-modes/mode/stex"
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
import { latexHoverTooltip } from "@/features/editor/latex-hover"
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
  projectRelativePath,
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import {
  isReadableSource,
  treeContainsPath,
} from "@/features/projects/project-model"
import { referencedFileAt } from "@/features/editor/latex-hover"

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

function sourceEditorTheme(fontSize: number) {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--source)",
      color: "var(--source-foreground)",
      fontSize: `${fontSize}px`,
    },
    ".cm-content": {
      caretColor: "var(--source-foreground)",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
    ".cm-tooltip:has(.tex-hover-card)": {
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
    ".cm-tooltip-autocomplete": {
      border: "1px solid var(--border)",
      borderRadius: "0.75rem",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "0 16px 40px color-mix(in srgb, black 22%, transparent)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      maxHeight: "24rem",
      minWidth: "28rem",
      maxWidth: "34rem",
      fontFamily: "var(--font-sans)",
      fontSize: "0.875rem",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "center",
      gap: "0.625rem",
      minHeight: "2.75rem",
      padding: "0.5rem 0.85rem",
      lineHeight: "1.35",
      borderBottom:
        "1px solid color-mix(in oklch, var(--border) 45%, transparent)",
    },
    ".cm-tooltip-autocomplete > ul > li:last-child": { borderBottom: "none" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-completionLabel": {
      fontFamily: "var(--font-mono)",
      fontWeight: "500",
      color: "var(--foreground)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel": {
      color: "var(--accent-foreground)",
    },
    ".cm-completionMatchedText": {
      textDecoration: "none",
      fontWeight: "700",
      color: "var(--primary)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText":
      { color: "inherit" },
    ".cm-completionDetail": {
      marginLeft: "auto",
      paddingLeft: "1rem",
      maxWidth: "16rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontStyle: "normal",
      color: "var(--muted-foreground)",
      fontSize: "0.75rem",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
      color: "color-mix(in oklch, var(--accent-foreground) 78%, transparent)",
    },
    ".tex-completion-icon": {
      flex: "none",
      width: "18px",
      height: "18px",
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
    ".cm-completionInfo": {
      minWidth: "18rem",
      maxWidth: "24rem",
      borderLeft: "1px solid var(--border)",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      padding: "0",
    },
    ".tex-completion-info": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      padding: "0.875rem 1rem",
    },
    ".tex-completion-meta": {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.5rem",
    },
    ".tex-completion-provenance": {
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      color: "var(--muted-foreground)",
    },
    ".tex-completion-description": {
      margin: "0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.8125rem",
      lineHeight: "1.5",
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
      maxHeight: "12rem",
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
      margin: "0.25rem 0 0",
      paddingTop: "0.5rem",
      borderTop:
        "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      color: "var(--muted-foreground)",
    },
  })
}

export function LatexEditor({
  content,
  fontSize,
  label,
  initialViewerState,
  onChange,
  onCursorChange,
  onOpenReference,
  onOpenFind,
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
  initialViewerState: EditorViewerState | undefined
  onChange: (change: EditorDocumentChange) => void
  onCursorChange: (line: number, column: number) => void
  onOpenReference: (path: ProjectRelativePath) => void
  onOpenFind: () => void
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
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorChangeRef = useRef(onCursorChange)
  const onOpenReferenceRef = useRef(onOpenReference)
  const onOpenFindRef = useRef(onOpenFind)
  const onSaveRef = useRef(onSave)
  const onViewerStateChangeRef = useRef(onViewerStateChange)
  const viewerStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialViewerStateRef = useRef(initialViewerState)
  const applyingExternalContent = useRef(false)
  const contentRef = useRef(content)
  const fontSizeRef = useRef(fontSize)
  const labelRef = useRef(label)
  const projectPathRef = useRef(projectPath)
  const projectTreeRef = useRef(projectTree)
  const themeCompartment = useRef(new Compartment())
  const attributesCompartment = useRef(new Compartment())
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
    onOpenReferenceRef.current = onOpenReference
    onOpenFindRef.current = onOpenFind
    onSaveRef.current = onSave
    onViewerStateChangeRef.current = onViewerStateChange
  }, [
    onChange,
    onCursorChange,
    onOpenFind,
    onOpenReference,
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
    const referenceAtPointer = (editor: EditorView, event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey) return null
      const position = editor.posAtCoords({
        x: event.clientX,
        y: event.clientY,
      })
      if (position === null) return null
      const reference = referencedFileAt(
        editor.state.doc.toString(),
        activePath.current,
        position
      )
      if (
        reference === null ||
        !isReadableSource(reference.path) ||
        !treeContainsPath(projectTreeRef.current, reference.path)
      ) {
        return null
      }
      return reference
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
    const openReferenceAtSelection = (editor: EditorView) => {
      const reference = referencedFileAt(
        editor.state.doc.toString(),
        activePath.current,
        editor.state.selection.main.head
      )
      if (
        reference === null ||
        !isReadableSource(reference.path) ||
        !treeContainsPath(projectTreeRef.current, reference.path)
      ) {
        return false
      }
      onOpenReferenceRef.current(reference.path)
      return true
    }
    const editorExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      StreamLanguage.define(stex),
      syntaxHighlighting(latexHighlightStyle),
      latexSemanticHighlighting({
        sourcePath: activePath.current,
        projectFiles: projectFilePaths(projectTreeRef.current),
      }),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
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
      hoverTooltip(
        (editor, position) =>
          latexHoverTooltip(projectPathRef.current, activePath.current)(
            editor,
            position
          ),
        { hoverTime: 350, hideOnChange: true }
      ),
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
          updateReferenceDecoration(editor, referenceAtPointer(editor, event))
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
          const reference = referenceAtPointer(editor, event)
          if (reference === null) return false
          event.preventDefault()
          updateReferenceDecoration(editor, null)
          onOpenReferenceRef.current(reference.path)
          return true
        },
      }),
      EditorState.languageData.of(() => [
        {
          commentTokens: { line: "%" },
          closeBrackets: { brackets: ["(", "[", "{"] },
        },
      ]),
      autocompletion({
        override: [
          latexCompletionSource(
            () => projectPathRef.current,
            () => activePath.current
          ),
        ],
        addToOptions: [latexCompletionRowBadge],
        icons: false,
        activateOnTyping: true,
        maxRenderedOptions: 12,
      }),
      keymap.of([
        { key: "Mod-s", run: () => (onSaveRef.current(), true) },
        { key: "Mod-f", run: () => (onOpenFindRef.current(), true) },
        { key: "Mod-/", run: toggleComment },
        { key: "Mod-Enter", run: openReferenceAtSelection },
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
      themeCompartment.current.of(sourceEditorTheme(fontSizeRef.current)),
      attributesCompartment.current.of(
        EditorView.contentAttributes.of({
          "aria-label": labelRef.current,
          "aria-multiline": "true",
          spellcheck: "false",
        })
      ),
    ]
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
    view.current?.dispatch({
      effects: themeCompartment.current.reconfigure(
        sourceEditorTheme(fontSize)
      ),
    })
  }, [fontSize])

  useEffect(() => {
    labelRef.current = label
    view.current?.dispatch({
      effects: attributesCompartment.current.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": label,
          "aria-multiline": "true",
          spellcheck: "false",
        })
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
    editor.dispatch({
      effects: [
        themeCompartment.current.reconfigure(
          sourceEditorTheme(fontSizeRef.current)
        ),
        attributesCompartment.current.reconfigure(
          EditorView.contentAttributes.of({
            "aria-label": labelRef.current,
            "aria-multiline": "true",
            spellcheck: "false",
          })
        ),
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
    <div
      className="min-h-0 flex-1"
      data-workspace-focus="source"
      ref={host}
      tabIndex={-1}
    />
  )
}
