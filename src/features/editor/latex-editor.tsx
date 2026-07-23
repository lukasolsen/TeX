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
  unfoldCode,
} from "@codemirror/language"
import { highlightSelectionMatches, search } from "@codemirror/search"
import {
  Compartment,
  EditorState,
  StateEffect,
  Transaction,
  type Extension,
} from "@codemirror/state"
import {
  crosshairCursor,
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
import {
  editorLanguageCompletions,
  editorLanguageSupport,
} from "@/features/editor/editor-languages"
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
import type { LatexDiagnosticEntry } from "@/domain/latex-diagnostics"
import { latexCompletionRowBadge } from "@/features/editor/latex-completion"
import { setLatexSemanticContext } from "@/features/editor/latex-semantic-highlighting"
import type {
  EditorDocumentChange,
  EditorViewerState,
  ProjectEntry,
} from "@/domain/project"
import { indentUnitText, type AppPreferences } from "@/domain/preferences"
import {
  type CanonicalProjectPath,
  type ProjectRelativePath,
} from "@/domain/identifiers"
import { isOpenableFile } from "@/domain/file-kind"
import { editorLanguage, hasLatexAnalysis } from "@/domain/editor-language"
import {
  projectFilePaths,
  treeContainsPath,
} from "@/features/projects/project-model"
import { installFindBridge } from "@/features/editor/editor-find-bridge"
import {
  positionOf,
  viewerSelectionPosition,
} from "@/features/editor/editor-position"
import {
  projectReferenceField,
  setProjectReference,
  type ProjectReference,
} from "@/features/editor/project-reference-field"
import {
  contentAttributes,
  sourceEditorTheme,
} from "@/features/editor/source-editor-theme"

export type EditorTarget = Readonly<{
  line: number
  column: number
  token: number
}>

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
      const language = editorLanguage(documentPath)
      // A log, a data file, or a Makefile is editable but is not LaTeX, so TeX
      // does not offer hovers or diagnostics it cannot mean. Completion is
      // decided per language instead: a `.bib` file has suggestions of its own.
      const assistance = hasLatexAnalysis(documentPath)
        ? settings.assistance
        : {
            ...settings.assistance,
            hoverDocumentation: false,
            diagnosticsEnabled: false,
          }
      const completionSources = editorLanguageCompletions(language, {
        projectPath: () => projectPathRef.current,
        relativePath: () => activePath.current,
      })
      return [
        editorLanguageSupport(language, {
          semantic: {
            sourcePath: documentPath,
            projectFiles: projectFilePaths(projectTreeRef.current),
          },
        }),
        editor.showLineNumbers
          ? [lineNumbers(), highlightActiveLineGutter()]
          : [],
        editor.highlightActiveLine ? highlightActiveLine() : [],
        editor.highlightSelectionMatches ? highlightSelectionMatches() : [],
        editor.wrapLines ? EditorView.lineWrapping : [],
        editor.autoCloseBrackets ? closeBrackets() : [],
        editor.autoCloseEnvironments && language === "latex"
          ? latexAutoCloseEnvironment()
          : [],
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
        assistance.completionEnabled && completionSources.length > 0
          ? autocompletion({
              override: completionSources,
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
      bracketMatching(),
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
    window.addEventListener("tex:toggle-comment", toggleLineComment)
    window.addEventListener("tex:find-in-file", findInFile)
    const removeFindBridge = installFindBridge(editor)
    view.current = editor
    onCursorChangeRef.current(
      initialViewerStateRef.current?.line ?? 1,
      initialViewerStateRef.current?.column ?? 1
    )
    return () => {
      window.removeEventListener("tex:toggle-comment", toggleLineComment)
      window.removeEventListener("tex:find-in-file", findInFile)
      removeFindBridge()
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
