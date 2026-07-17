# Product plan implementation audit

Audit date: 2026-07-16

This audit compares the requirements in [`project.md`](project.md) with the
current React/TypeScript application, Rust/Tauri boundary, persistence model,
fixture suite, and automated tests. A requirement is marked **implemented**
only when the repository contains both the capability and a truthful user
route to it. **Partial** means a useful subset exists but the stated contract
is not complete. **Missing — larger work** identifies work that should be
designed and tested separately rather than added as incidental UI.

## Overall assessment

TeX has progressed well beyond the old Phase 0 description. The central manual
workflow is real: users can reopen local projects, select a root, edit and
search multiple files, recover unsaved changes, run a constrained compiler,
inspect retained build runs and diagnostics, read the resulting PDF without
discarding the previous readable document on update failure, and navigate in
both SyncTeX directions.

The project is not yet at the complete release bar described by the plan. The
largest gaps are watch mode and filesystem event handling, custom project build
configuration, complete diagnostic commands, full workspace-layout
persistence, interaction-safe PDF replacement stress coverage, and documented
performance/accessibility/platform qualification.

## Requirement coverage

### Product boundaries and foundations

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Local-first operation without accounts, uploads, telemetry, or cloud storage | **Implemented** | Tauri capabilities are limited to core, dialog, and logging; project operations are validated Rust commands. No network, account, upload, telemetry, or AI capability exists. See `src-tauri/capabilities/default.json` and `src-tauri/src/lib.rs`. |
| React is presentation/state coordination; Rust owns filesystem, process execution, persistence, and validation | **Implemented** | IPC wrappers are in `src/services/`; filesystem and process work is in `src-tauri/src/`. |
| Supported-platform and TeX-distribution policy | **Partial** | `docs/support.md` publishes the pre-release OS, distribution, command-version, Rust, and Bun policy. Windows/macOS smoke qualification and biber evidence remain open before it becomes a release support claim. |
| Privacy statement and known limitations | **Implemented** | `docs/privacy.md` and `docs/known-limitations.md` publish the local data boundary and current release caveats without implying unavailable behavior. |
| Representative fixture suite | **Implemented** | `tests/fixtures/manifest.json` defines and Rust tests validate simple, multi-root, Unicode, broken, NASA report, BibLaTeX/biber, custom-class, large-project, output-directory, invalid-PDF, and file-watch-storm fixtures. |
| Performance protocol and measured budgets | **Partial** | `docs/benchmarks/` defines reference-environment fields, scenario boundaries, raw-sample retention, and nearest-rank p50/p95/p99 procedures. Instrumented results and release budgets remain qualification work. |
| Target-user research | **Missing — external work** | `docs/research/target-user-study.md` defines recruitment, consent, redaction, observation, and issue thresholds, but no sessions are claimed. The required 8–12 observed sessions remain an external milestone gate. |

### Phase 1 — project home and safe persistence

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Native folder selection and recent projects | **Implemented** | `project-service.ts`, `recent-project-list.tsx`, and `persistence.rs` provide folder selection, path, last-opened time, availability, and safe forgetting. |
| Metadata outside the source tree with atomic persistence | **Implemented** | Workspace/preferences are stored under app data and written atomically in `persistence.rs`. |
| Detect and surface root candidates | **Implemented** | `root_detection.rs` supports `\documentclass` and magic-root comments; schema-v1 project build settings add configured-root evidence without silently selecting ambiguous detected candidates. |
| Bounded project tree with generated/cache exclusions | **Partial** | `project_open.rs` bounds depth/count and excludes common fixed directories and generated extensions. User-configurable output/generated exclusions are missing. |
| Restore valid roots, files, tabs, and PDF state safely | **Implemented** | `persistence.rs`, `use-project-session.ts`, and document-tab tests validate paths and provide restoration notices for missing entries. |
| Restore split sizes, open panels, and last selected panel | **Implemented; platform qualification open** | Schema-v2 workspace persistence restores viewport-validated sidebar/PDF/build geometry, pane visibility, sidebar/build tabs, build profile, source cursor/scroll, selected PDF, and per-PDF state. Automated migration, corruption, missing-path, round-trip, and smaller-window tests pass; packaged cross-platform smoke evidence remains open. |
| Safe rename/delete with recovery or undo | **Partial** | Paths are validated and UI confirmation is explicit. Rename is non-overwriting, but delete is permanent and has no trash/undo route. |

### Phase 2 — editing

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Mature editor, tabs, syntax highlighting, indentation, brackets, comments, and snippets | **Implemented** | CodeMirror integration in `latex-editor.tsx` includes history, search, highlighting, bracket matching, indentation, comment toggling, completion, and core LaTeX snippets. |
| Fast command palette and keyboard routes | **Partial** | Common build, save, search, file, font, and panel actions are searchable. File operations, root selection, PDF synchronization, and diagnostic traversal are not all represented as commands. |
| Project search with file/line/context/count | **Implemented** | `project_search.rs` and `project-search-panel.tsx` provide bounded literal search and navigable results. |
| Previewable and undoable replacement | **Implemented** | Replacements revalidate revisions, persist backups outside the project, preview changes, and expose undo. |
| Unsaved, recovery, write-failure, and external-change states | **Implemented** | Atomic revision-checked writes, local recovery drafts, conflict comparison, and visible save states are implemented. Autosave now also runs when the window loses focus or becomes hidden. |
| High contrast, focus, reduced motion, font zoom, and announcements | **Partial** | Complete forced-colors token mappings, visible focus, reduced-motion rules, font zoom, and scoped live regions exist. JSDOM workflow tests cover accessible names, structure, and selected keyboard routes. Packaged screen-reader, IME, forced-colors, scaling, and keyboard-only qualification remains open. |
| Environment matching and configurable snippets | **Partial** | Bracket matching and fixed snippets exist; explicit LaTeX environment-pair matching and user-configurable snippets do not. |

### Phase 3 — trustworthy builds

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Safe common profiles and exact invocation preview | **Implemented** | `build_system.rs` exposes validated latexmk/pdfLaTeX/XeLaTeX/LuaLaTeX profiles and separately supplied process arguments; `build-panel.tsx` shows command, directory, and root before execution. |
| Project custom command/profile selection with explicit consent | **Implemented; fixture qualification open** | Versioned settings live outside source, canonicalize project paths and absolute executables, keep arguments separate, restrict TeX environment overrides, and persist separate custom-command and shell-escape consent. Configured output and watcher exclusions are active; cross-platform fixture qualification remains open. |
| Build, Build and view, Watch, Stop, Clean, Reveal output | **Implemented; platform qualification open** | Manual/automatic Build and Stop, explicit Build and view, visible Watch, exact conservative Clean preview/revalidation, and canonical project-output Reveal routes exist. Packaged file-browser and watcher qualification remains open. |
| One build controller per project | **Implemented** | `BuildController` rejects overlapping builds and supervises cancellation per canonical project root. |
| Structured metadata, bounded raw logs, diagnostics, and run selection | **Implemented** | Up to 20 in-memory runs retain timestamps, invocation, status, stdout/stderr, exit code, and parsed diagnostics. |
| Logs survive panel close, later builds, failures, and app restart | **Implemented by documented retention policy** | Twenty bounded runs survive panel close, later builds, and failures during the process lifetime. Restart persistence is deliberately excluded because raw compiler logs may disclose document fragments and paths; no release workflow currently requires it. |
| Diagnostic mapping with uncertainty | **Implemented** | File-line diagnostics map conservatively through project/output paths; TeX `!` errors, LaTeX/package warnings, and box notices are classified without inventing locations. Uncertain/unmapped diagnostics stay selectable for evidence and raw context. |
| First/next/previous diagnostic and copy diagnostic commands | **Implemented** | The command palette exposes first/next/previous, copy, and raw-log-context routes; F8 and Shift+F8 provide direct traversal without focus theft. |
| Visible, safe watch mode | **Implemented; platform qualification open** | `watch_system.rs` owns recursive observation, 350 ms debounce/coalescing, explicit change kinds, path revalidation, and generated-output suppression. The build panel and status bar expose start/queued/building/stop/error states and route automatic builds through the serialized controller. Unsafe custom profiles are not yet available; packaged platform event/race qualification remains open. |
| Build accessibility announcements | **Implemented** | Build state and diagnostic counts are textual, and completion is announced through a polite live region. |
| Reproducibility details | **Implemented** | Exact command, canonical executable, working directory, root, timestamps, exit code, restricted environment settings, bibliography intent, and standard-tool version are retained with the run. |

### Phase 4 — PDF and SyncTeX

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Keep the last readable PDF during builds and update failures | **Implemented** | The viewer only refreshes on successful builds/external revision changes and retains the current document when a replacement cannot be read or parsed. |
| Preserve page, normalized position, zoom, rotation, layout, and outline state | **Implemented** | `pdf-viewer.tsx`, `pdf-viewer-model.ts`, and persisted per-PDF state restore these values and clamp page selection. |
| Preserve selection, active interaction, and exact focus across replacement | **Implemented; platform qualification open** | Scrolling/pointer/text-selection activity defers replacement with an explicit quiet apply action; focused controls are restored without scrolling, and same-text-layer selection is restored best-effort after PDF.js rerenders. Packaged assistive-technology/browser qualification remains open. |
| Continuous/single layouts, zoom, fit, rotation, text selection, find, outline, page picker, keyboard scrolling | **Implemented** | All listed viewer controls and PageUp/PageDown plus keyboard find/zoom routes exist. |
| Search-result navigation | **Implemented** | Previous/next page-match controls and match status are provided. |
| Explicit forward and inverse SyncTeX navigation | **Implemented** | `synctex.rs` invokes the supported CLI; source-to-PDF uses an explicit toolbar action and PDF-to-source requires a modifier click. Unavailable/stale data is explained. |
| Cancellable/stale-safe synchronization requests | **Implemented** | Monotonic request generations invalidate stale PDF load/outline, search, outline navigation, and forward/inverse SyncTeX results before any state or navigation update. Superseded PDF documents are destroyed. |
| Per-project/output viewer persistence | **Implemented** | Viewer state is keyed by project-relative PDF path inside each persisted workspace. |
| External PDF rebuild handling and attribution | **Implemented** | Build refresh tokens and external revision changes share the safe candidate path but produce distinct update-ready and completion announcements. Build-token changes reset the external revision baseline to avoid duplicate attribution. |
| Repeated-update and failure stress gate | **Implemented; packaged qualification open** | TypeScript model tests run 100 success and 100 failure replacements with full reading-state/last-good invariants; Rust repeats 100 valid and 100 failed reads on the multi-file NASA SyncTeX fixture and covers oversized/missing/path failures. Packaged focus/selection/memory stress remains open. |

### Phase 5 and quality policy

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Helpful outline/reference navigation | **Implemented** | Source outline and direct project/package references are available without claiming full semantic certainty. |
| Bibliography assistance, configurable snippets, Git-aware status, import/export | **Not scheduled** | These are optional Phase 5 items and should remain behind the reliability work above. |
| No advertising, engagement loops, uploads, or hidden remote behavior | **Implemented** | No such product surfaces or runtime capabilities exist. |
| Supported versions, limitations, and test conditions published | **Partial** | `docs/support.md`, `docs/known-limitations.md`, and `docs/benchmarks/` publish the pre-release policy and reproducible procedure. Cross-platform qualification results are not yet published. |
| “Small cruelties” regression suite | **Partial** | Tests cover parsing, workspace restoration, PDF context and repeated replacement, external-write protection, build serialization, watch filtering/overflow, logs/diagnostics, primary accessible names, and selected keyboard routes. Packaged focus theft, browser text-selection restoration, disabled-shortcut, screen-reader, IME, and platform failure-path evidence remains open. |

## Small changes completed during this audit

- Widened the build-profile trigger/menu and build-run selector so their labels
  fit without avoidable truncation.
- Added autosave on window blur and when the application becomes hidden.
- Updated stale README and Phase 0 wording so documentation no longer claims
  that project access and build execution are unavailable.

## Larger work backlog

The following order keeps the plan's reliability-first intent:

1. **Workspace persistence qualification** — run packaged restart, resize,
   keyboard, focus, migration, corruption, and missing-path smoke tests on each
   supported platform.
2. **Qualification suite** — add missing fixtures, benchmark startup/edit/search/
   build/PDF latency, run keyboard/screen-reader/IME smoke tests on supported
   platforms, and publish versions, machines, percentiles, and known limits.
3. **Safe deletion recovery** — move deleted project entries to a recoverable
   project-local or OS trash workflow where platform/filesystem support permits,
   with explicit fallback behavior.

Phase 5 conveniences should wait until items 1–3 have clear release evidence.
