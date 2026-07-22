# Editor intelligence

This document records the editor-platform decision, the capability baseline it
starts from, the architecture that closes the gap, and the design principles the
implementation must hold to. It is the reference for anyone changing
`src/features/editor/`, `src/domain/latex-*.ts`, or `src-tauri/src/latex_*.rs`.

## 1. Platform decision: CodeMirror 6 stays

The editing surface remains CodeMirror 6. Monaco was evaluated and rejected.

### Why the question is real

Monaco is the stronger product out of the box for a language that already has a
language server or a bundled service — it ships hover, completion, folding,
diagnostics, rename, peek-definition, and a diff editor as first-class,
LSP-shaped APIs. If TeX could point Monaco at an existing LaTeX language server,
Monaco would be the shorter path.

### Why it is not the right answer here

- **There is no service to plug in.** TeX is local-first and ships no LaTeX
  language server. Monaco's LSP-shaped API is a socket with nothing on the other
  end: every capability in this document — the cross-file symbol index, the
  reference/definition resolution, the duplicate and undefined analysis — has to
  be written by us either way. Monaco supplies the protocol shape, not the
  language knowledge. The expensive half of the work is identical on both
  platforms.
- **Cost of the switch is the whole editor.** Hover cards, semantic
  highlighting, the completion renderer, find/replace wiring, per-document state
  retention (scroll, selection, viewer state), and the accessibility contract are
  roughly 5,500 lines built against CodeMirror's API. Replacing the platform
  spends that budget on parity rather than on capability.
- **Bundle and integration cost.** Monaco is an order of magnitude larger than
  the CodeMirror packages already installed, expects a worker plus its own module
  loader, and needs deliberate work to behave under Vite and a Tauri webview.
  CodeMirror's extension packages are already dependencies and already bundle
  cleanly.
- **Accessibility default.** CodeMirror renders real text in the DOM and is
  keyboard- and screen-reader-usable by default. Monaco's accessibility mode is
  opt-in and degrades the rendering path when enabled. `ui-ux-requirements.md`
  treats accessibility as inseparable from quality, so the default matters.
- **Extension model fits the problem.** The features required here are
  overlays over a document: decorations, a fold service, a lint source, a
  completion source, a tooltip source. `StateField`, `ViewPlugin`, `Facet`, and
  `Decoration` express exactly that, compose without conflict, and are
  individually unit-testable as pure functions plus a thin adapter.

The one genuine advantage Monaco would have retained — a real incremental parse
tree — is addressed directly below rather than by changing platforms.

## 2. Capability baseline

Assessed against the requirement list before this work.

| Requirement | Before | Gap |
| --- | --- | --- |
| Semantic autocomplete | Partial | Backend-driven, context-aware, and provenance-labelled, but the catalog was 16 commands / 9 environments / 9 snippets, matching was strict `starts_with`, and package, class, and math-symbol arguments had no completion at all. |
| Cross-reference intelligence | Partial | Labels and citations completed, and `\input`-style file references opened on Ctrl/⌘-click. No definition jump from `\ref`/`\cite`, no reference search, no rename. |
| Undefined and duplicate `\label`/`\ref`/`\cite`/bib keys | **Absent** | No analysis of any kind. The only diagnostics in the product came from parsing compiler logs after a build. |
| LaTeX-aware highlighting | Partial | `StreamLanguage` over the legacy `stex` mode plus a semantic decoration overlay. No math-mode, verbatim, or environment-body awareness, so `$…$`, `\[…\]`, and `verbatim` bodies were highlighted as ordinary prose. |
| Matching and folding | Partial | `bracketMatching()` covered braces only. No folding of any kind, and no `\begin`/`\end` pair awareness. |
| General editor understanding | Partial | Outline, hover documentation, and file navigation existed. No structural model shared between them, so each feature re-parsed the document with its own ad-hoc regular expressions. |

The recurring theme is the last row: five separate approximate parsers
(`domain/latex.ts`, `document-outline.ts`, `latex-semantic-highlighting.ts`,
`latex_symbols.rs`, `latex_completion.rs`) each understood a slice of LaTeX and
none understood math mode, verbatim, or nesting. That is the root cause, and it
is what the architecture below replaces.

## 3. Architecture

### 3.1 One structural model, many consumers

`src/domain/latex-syntax.ts` performs a single linear scan of a document and
produces one `LatexDocumentModel`:

- **Regions** — nested spans with a kind: `environment`, `math`, `verbatim`,
  `comment`, `group`. Regions carry their delimiter positions, so folding,
  matching, and mode-sensitive analysis all read the same structure.
- **Occurrences** — every place the document names a symbol, with its exact
  span, the command that introduced it, and whether it is a definition or a
  reference. This covers labels, citations, bibliography entries, packages,
  classes, macro and environment definitions, and file references.
- **Modes** — the scan tracks math and verbatim state, so a `%` inside
  `\verb|…|` is not a comment and a `_` inside `$…$` is not a subscript error.

Every downstream feature is a pure function of this model. Folding, matching,
local diagnostics, the outline, semantic highlighting, and cross-reference
navigation stop disagreeing with each other because they can no longer disagree.

### 3.2 Two diagnostic layers

Diagnostics split by what they need to know, not by convenience.

| Layer | Runs | Needs | Answers |
| --- | --- | --- | --- |
| **Document** | In the editor, synchronously, on every change | The active buffer only | Unclosed or mismatched `\begin`/`\end`, unbalanced math delimiters, duplicate `\label` within the file, `\ref` to a label defined nowhere in the file *when the file is self-contained* |
| **Project** | In Rust, debounced, off the UI thread | Every `.tex` and `.bib` in the project | Undefined `\ref`, undefined `\cite`, `\label` duplicated across files, bibliography key duplicated across `.bib` files, file references that resolve to nothing |

The document layer exists so that structural mistakes underline as they are
typed with no latency and no IPC. The project layer exists because "undefined"
is only decidable with the whole project in view — a `\ref` whose `\label` lives
in another chapter is correct, and a tool that flags it is worse than no tool.
Merging the layers would force the fast case to wait for the slow one.

Both layers emit the same `LatexDiagnostic` shape, so the editor gutter, the
underlines, and the Problems panel consume one list.

### 3.3 Where the project index lives

In Rust, extending `latex_project_scan.rs`. It already walks the tree under the
validated project root, caches file contents by modification time and length,
and overlays the unsaved active buffer over its on-disk copy. Diagnostics,
definition lookup, and reference search reuse that cache, which means:

- Analysis never blocks typing or rendering.
- Unsaved edits are analysed, not the stale file on disk.
- Filesystem access stays behind the existing validated boundary — the
  presentation layer continues to touch no files.

## 4. Design principles

These are the rules the implementation is held to, in priority order.

1. **Never invent an error.** A false positive in a `\ref` check trains the user
   to ignore the gutter, which destroys the value of every true positive. When
   the analyser cannot see enough to be certain — a macro-generated label, a
   `\ref` inside a macro body, an unresolvable `\input` — it stays silent. Every
   check in this system is designed so that the uncertain case produces nothing.
2. **Latency is a correctness property.** Typing, scrolling, and selection never
   wait on analysis. Document diagnostics run on the visible buffer;
   project analysis is debounced and cancellable, and a stale response for a
   superseded document revision is discarded rather than displayed.
3. **One model, one truth.** A feature that needs to understand the document
   reads `LatexDocumentModel`. Adding a sixth private regular-expression parser
   is the failure this architecture exists to prevent.
4. **Analysis is pure; the editor is the adapter.** Every analysis function
   takes text and returns data, with no CodeMirror or React types in its
   signature. This is what makes the behaviour testable without a DOM, and it is
   why the test suite can assert on exact spans rather than on rendered output.
5. **Explain, do not just mark.** A diagnostic states what is wrong and what
   would resolve it, in the product's own vocabulary. `Undefined reference` is a
   compiler's phrasing; `No \label{fig:results} is defined in this project` is
   the phrasing a user can act on.
6. **Colour is never the signal.** Every diagnostic carries severity text and an
   accessible name. Every folded region is operable and announced from the
   keyboard. This follows `ui-ux-requirements.md`, not editor convention.
7. **Bounded by construction.** Every scan, cache, and result list has an
   explicit ceiling. A pathological document — a megabyte on one line, ten
   thousand unclosed braces — degrades to fewer results, never to a hang.
