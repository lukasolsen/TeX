import { useEffect, useRef } from "react"
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completeFromList,
  snippet,
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
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  StreamLanguage,
} from "@codemirror/language"
import { tags } from "@lezer/highlight"
import { stex } from "@codemirror/legacy-modes/mode/stex"
import {
  highlightSelectionMatches,
  openSearchPanel,
  searchKeymap,
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
import type { ProjectEntry } from "@/domain/project"
import {
  isReadableSource,
  treeContainsPath,
} from "@/features/projects/project-model"
import { referencedFileAt } from "@/features/editor/latex-hover"

export type EditorTarget = { line: number; column: number; token: number }

type ProjectReference = { from: number; to: number } | null

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

const latexHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--editor-comment)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--editor-command)", fontWeight: "600" },
  { tag: tags.string, color: "var(--editor-string)" },
  { tag: [tags.number, tags.bool, tags.atom], color: "var(--editor-atom)" },
])

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
      textDecoration: "underline",
      textDecorationColor: "var(--primary)",
      textDecorationThickness: "1px",
      textUnderlineOffset: "0.18em",
    },
    ".cm-tooltip:has(.tex-hover-card)": {
      border: "1px solid var(--border)",
      borderRadius: "0.75rem",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow:
        "0 18px 40px color-mix(in oklch, var(--foreground) 18%, transparent)",
      maxWidth: "34rem",
      overflow: "hidden",
    },
    ".tex-hover-card": { padding: "0.75rem 0.875rem" },
    ".tex-hover-card strong": {
      display: "block",
      fontFamily: "var(--font-sans)",
      fontSize: "0.8125rem",
    },
    ".tex-hover-card p": {
      margin: "0.3rem 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.35",
      color: "var(--muted-foreground)",
    },
    ".tex-hover-card-label": {
      display: "block",
      marginTop: "0.7rem",
      fontFamily: "var(--font-sans)",
      fontSize: "0.625rem",
      fontWeight: "700",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
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
    ".tex-hover-card-caution": {
      marginTop: "0.2rem",
      color: "var(--source-foreground)",
    },
  })
}

const latexSnippets = completeFromList([
  {
    label: "itemize environment",
    detail: "LaTeX snippet",
    apply: snippet("\\begin{itemize}\n\t\\item ${item}\n\\end{itemize}"),
  },
  {
    label: "figure environment",
    detail: "LaTeX snippet",
    apply: snippet(
      "\\begin{figure}[htbp]\n\t\\centering\n\t${figure}\n\t\\caption{${caption}}\n\t\\label{fig:${label}}\n\\end{figure}"
    ),
  },
  {
    label: "equation environment",
    detail: "LaTeX snippet",
    apply: snippet("\\begin{equation}\n\t${equation}\n\\end{equation}"),
  },
])

export function LatexEditor({
  content,
  fontSize,
  label,
  onChange,
  onOpenReference,
  onSave,
  path,
  projectPath,
  projectTree,
  retainedPaths,
  target,
}: {
  content: string
  fontSize: number
  label: string
  onChange: (content: string) => void
  onOpenReference: (path: string) => void
  onSave: () => void
  path: string
  projectPath: string
  projectTree: ProjectEntry
  retainedPaths: string[]
  target: EditorTarget | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onOpenReferenceRef = useRef(onOpenReference)
  const onSaveRef = useRef(onSave)
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
    new Map<string, { state: EditorState; scrollTop: number }>()
  )

  useEffect(() => {
    onChangeRef.current = onChange
    onOpenReferenceRef.current = onOpenReference
    onSaveRef.current = onSave
  }, [onChange, onOpenReference, onSave])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    projectPathRef.current = projectPath
  }, [projectPath])

  useEffect(() => {
    projectTreeRef.current = projectTree
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
    const editorExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      syntaxHighlighting(latexHighlightStyle),
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
      EditorView.domEventHandlers({
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
      StreamLanguage.define(stex),
      EditorState.languageData.of(() => [
        {
          commentTokens: { line: "%" },
          closeBrackets: { brackets: ["(", "[", "{"] },
        },
      ]),
      autocompletion({
        override: [latexSnippets],
        activateOnTyping: false,
      }),
      keymap.of([
        { key: "Mod-s", run: () => (onSaveRef.current(), true) },
        { key: "Mod-/", run: toggleComment },
        indentWithTab,
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalContent.current) {
          onChangeRef.current(update.state.doc.toString())
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
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: contentRef.current,
        extensions: editorExtensions,
      }),
    })
    const toggleLineComment = () => toggleComment(editor)
    const findInFile = () => openSearchPanel(editor)
    window.addEventListener("tex:toggle-comment", toggleLineComment)
    window.addEventListener("tex:find-in-file", findInFile)
    view.current = editor
    return () => {
      window.removeEventListener("tex:toggle-comment", toggleLineComment)
      window.removeEventListener("tex:find-in-file", findInFile)
      editor.destroy()
      view.current = null
    }
  }, [])

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
    documentStates.current.set(activePath.current, {
      state: editor.state,
      scrollTop: editor.scrollDOM.scrollTop,
    })
    const restored = documentStates.current.get(path)
    let nextState =
      restored?.state ??
      EditorState.create({
        doc: contentRef.current,
        extensions: extensions.current,
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
    editor.scrollDOM.scrollTop = restored?.scrollTop ?? 0
    activePath.current = path
  }, [path])

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

  return <div className="min-h-0 flex-1" ref={host} />
}
