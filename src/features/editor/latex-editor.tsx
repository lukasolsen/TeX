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
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view"

export type EditorTarget = { line: number; column: number; token: number }

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
  onSave,
  path,
  retainedPaths,
  target,
}: {
  content: string
  fontSize: number
  label: string
  onChange: (content: string) => void
  onSave: () => void
  path: string
  retainedPaths: string[]
  target: EditorTarget | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const applyingExternalContent = useRef(false)
  const contentRef = useRef(content)
  const fontSizeRef = useRef(fontSize)
  const labelRef = useRef(label)
  const themeCompartment = useRef(new Compartment())
  const attributesCompartment = useRef(new Compartment())
  const activePath = useRef(path)
  const extensions = useRef<Extension[]>([])
  const documentStates = useRef(
    new Map<string, { state: EditorState; scrollTop: number }>()
  )

  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
  }, [onChange, onSave])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    if (host.current === null) return
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
