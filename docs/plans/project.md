# TeX — product plan

## Decision

**Build TeX as a local-first, project-native LaTeX workbench for people who already choose LaTeX.** Its job is not to turn LaTeX into a visual word processor, a cloud collaboration suite, a generic IDE, or a package marketplace. Its job is to make opening, writing, compiling, reading, and correcting a real multi-file LaTeX project feel calm, immediate, and trustworthy.

This is a good and defensible product decision, with one important correction: we cannot literally avoid competing with existing editors. TeXstudio, TeXmaker, VS Code + LaTeX Workshop, and Overleaf already serve parts of this workflow. The useful strategy is to **avoid a feature-parity race** and compete on a narrower promise:

> The best desktop home for an existing LaTeX project: it keeps your place, explains what happened, and never makes you fight the tool while writing.

That promise is valuable precisely because complex templates, custom macros, and multi-file projects are where generic editors and visual abstractions become unreliable. Overleaf's own Visual Editor documentation notes that complex package-, template-, or macro-driven tables may only be partly rendered or shown as code; do not make a visual editor a strategic dependency. [Overleaf: visual-editor limitations](https://docs.overleaf.com/writing-and-editing/generating-and-inserting-tables)

## Product thesis and boundaries

### Who this is for

- Authors of theses, books, papers, reports, lecture notes, and technical documentation stored as local LaTeX projects.
- People using real project structures: `\input`, `\include`, bibliographies, images, generated files, custom classes, and non-default build commands.
- Keyboard-heavy writers and editors who want the PDF beside the source without losing context.
- Users who want to keep their files, compiler, Git workflow, and chosen TeX distribution under their control.

### What TeX must be

- **Local-first:** opening and editing a folder must not require an account, connection, upload, or proprietary project format.
- **Project-first:** a project is a directory plus an explicit or detected entry point and build profile; individual files are views into that project.
- **Predictable:** every automatic action is visible, reversible where possible, and never steals focus or discards context without consent.
- **Useful on day one:** root-file detection, a reliable build, readable diagnostics, persistent PDF state, and search matter more than a long feature list.
- **Respectful of expertise:** provide sensible defaults, but do not pretend TeX is simpler than it is. Preserve escape hatches for custom engines and commands.

### Explicit non-goals for the first releases

- A WYSIWYG/Google-Docs-style authoring surface.
- Hosted collaboration, accounts, commenting, billing, or a cloud project format.
- Becoming a general-purpose code editor or replacing a terminal, Git client, reference manager, or package manager.
- AI generation as a core workflow. It can be considered later only if it never blocks local editing, sends files without opt-in, or obscures provenance.
- Reimplementing a TeX distribution, `latexmk`, or every package's semantics.

These are constraints, not omissions. They keep engineering time focused on the moment that matters: author edits source, runs or triggers a build, understands the result, and continues exactly where they were.

## Product principles

The original principles are right; make them testable.

| Principle | Product rule | Release gate |
| --- | --- | --- |
| Fast startup | Show a usable recent-project screen before background indexing finishes. | Measure cold and warm startup on supported platforms; retain the 300 ms target only with a defined test machine and percentile. |
| Zero unnecessary animation | Motion may communicate progress or preserve spatial orientation; decorative motion is off. Respect reduced-motion preferences. | No animation delays typing, file switching, build controls, or diagnostic navigation. |
| Native feeling | Follow platform file dialogs, menu/key conventions, drag/drop, text selection, focus, and accessibility conventions. | Test macOS, Windows, and Linux behaviours deliberately; do not call a webview's default behaviour “native.” |
| Never lose work | Autosave to disk safely; retain recoverable snapshots; report external changes and write failures. | Kill the process during edits and verify recovery; simulate a full disk and permissions failure. |
| Project-first, file-second | Root, output directory, engine, bibliography tool, and build command are project settings. | Opening a child file does not silently compile it as a standalone document. |
| Keyboard complete | Every command has a discoverable keyboard route, visible focus, and no mouse-only PDF action. | Perform the primary workflow without a mouse. |
| PDF always visible | A successful PDF remains readable while the next build is running or fails. | A failed build never replaces good output with a blank/error view. |
| Large projects stay responsive | Indexing, file watching, and build-log parsing run off the input/rendering path. | Test with a representative large, multi-file fixture and publish the fixture and budget. |

Accessibility is a quality requirement, not polish. A useful precedent is VS Code's documented support for keyboard navigation, high contrast, zoom, screen readers, and next/previous diagnostic commands. [VS Code accessibility documentation](https://code.visualstudio.com/docs/configure/accessibility/accessibility)

## Non-negotiable interaction contracts

These are the decisions that make TeX a pleasant editor rather than merely a compiler launcher.

### 1. Preserve reading position on every successful PDF update

**Never reload to page 1.** Treat this as a regression-worthy invariant, not a preference.

On a successful replacement of the PDF:

1. Capture the current viewer state: page, normalized position within the page, zoom, rotation, layout mode, sidebar visibility, selected text, and whether the user is actively scrolling/selecting.
2. Load and validate the new PDF off-screen. Do not blank the current PDF while the new file is incomplete or locked by the compiler.
3. Restore the same logical page and normalized vertical position, clamping only when the new document has fewer pages.
4. Restore zoom, layout, and sidebar state. Keep keyboard focus where it was before the update.
5. If the user is interacting with the PDF, defer the visual swap until the interaction ends or show a quiet `PDF updated` affordance; never jerk the page beneath their pointer.
6. Announce the outcome accessibly without moving focus: `PDF updated; page 42 of 118` or `PDF updated; previous page no longer exists; showing page 93 of 93`.

Do **not** auto-jump to the source cursor on every build. Forward search is a deliberate command or an explicit user setting; passive refresh preserves the reader's chosen place. SyncTeX exists specifically to navigate both source-to-PDF and PDF-to-source, so implement it as an intentional two-way navigation feature rather than an uncontrolled side effect. [SyncTeX manual](https://texdoc.org/serve/synctex.man1.pdf/0)

### 2. A failed build changes status, not the document the user is reading

- Keep the last known-good PDF on screen, marked subtly as `Last successful build` with its timestamp.
- Show build state in one stable place: `Building`, `Succeeded`, `Failed`, `Cancelled`, or `Waiting for changes`. Never use colour as the only signal.
- On failure, make the first actionable diagnostic available in the Problems panel, but do not steal focus, open files, scroll editors, or cover the PDF.
- Let the user invoke `Go to first error`, `Next/previous diagnostic`, `Show full log`, and `Copy diagnostic` from keyboard and menus.
- Preserve logs per build run. A later build must not erase the evidence needed to understand an earlier failure.
- Clearly distinguish errors, warnings, and informational output. Avoid calling every TeX warning an error: for example, Overleaf documents that many float/margin warnings are informational, while fatal errors prevent compilation. [Overleaf: fixing LaTeX errors](https://docs.overleaf.com/troubleshooting-and-support/fixing-latex-errors)

### 3. The editor never silently overwrites a user decision

- Autosave after a short idle interval and on focus/window loss; show write failures immediately and retain an in-memory recovery copy.
- On an external modification, compare content and offer `Reload`, `Keep mine`, and a diff/merge route. Never overwrite the external version in the background.
- On crash or forced termination, reopen the project and offer a named recovery snapshot before changing any disk file.
- Treat generated files and build output as separate from author files. Default watchers must ignore output directories, `.git`, and tool caches to prevent recursive rebuild loops.
- Renames, deletes, and root-file changes must have clear confirmation/recovery behaviour. “Undo” is required where the filesystem permits it.

### 4. Every automatic action must be legible

- A build panel answers: *what command ran; in which directory; with which root; when did it start/end; what output did it produce; why did it rerun?*
- Root detection reports confidence and evidence, and always provides `Set as root` and `Change root…`. Multiple plausible roots are a choice, never a guess hidden from the user.
- File watching is debounced and coalesced; display a single calm state, not a flickering parade of events. The Rust `notify` library is cross-platform, but its documentation also notes platform-specific rename/remove behaviour—test these cases rather than assuming filesystem events are uniform. [notify documentation](https://docs.rs/notify/latest/notify/trait.Watcher.html)
- Never run a project-supplied shell command automatically without showing it and obtaining appropriate user consent. `--shell-escape` must be explicitly surfaced because it changes the trust boundary.

## Core workflow: acceptance story

1. User opens a folder or recent project. TeX restores its root, open files/tabs, split sizes, PDF zoom/page/position, and last selected panel.
2. TeX detects possible roots without blocking editing. The chosen root is visible in the status area.
3. User edits any included file. Text remains responsive; autosave finishes safely.
4. User builds manually or via a clearly configured watch mode. The previous PDF remains visible throughout.
5. On success, the viewer swaps to the new PDF without moving the user to page 1, changing zoom, or stealing focus.
6. On error, the last successful PDF remains visible. The user can reach the exact file/line and relevant log context with one command.
7. User activates forward search from source or inverse search from PDF. TeX changes location only because the user asked, and gives a clear visual/accessibility indication of the destination.
8. User closes and reopens TeX. Their project context returns; if restoration cannot be exact, TeX says what was restored and what was not.

## Release plan

### Phase 0: research and foundations (required before MVP)

Define supported platforms, bundled-versus-detected TeX-distribution policy, privacy statement, project config format, error taxonomy, and a fixture suite before committing to UI architecture.

- Gather 8–12 target users across thesis writers, researchers, book/report authors, and technical editors. Observe them compile and fix a real project; do not ask only what features they want.
- Build representative fixtures: simple article, multi-file thesis, BibLaTeX/biber project, custom class, non-ASCII paths, a deliberately failing document, and a large project.
- Establish performance budgets and record machines/OS/TeX engine. “Under 300 ms” without a machine, scenario, and percentile is a slogan, not a requirement.
- Decide whether the first renderer can provide accessible text, selection, find, outline, robust zoom, and state restoration. If not, do not call the PDF viewer complete.
- Write failure-mode tests first: output PDF temporarily unavailable, compiler killed, invalid PDF, project moved, external edit during autosave, path rename, build storm, and restart mid-write.

**Exit criterion:** a tested technical spike can compile a fixture, retain the previous PDF on failure, replace it on success while restoring page/zoom/position, and show a navigable diagnostic.

### Phase 1: project home and safe persistence

Open folders; detect/select roots; construct a project tree; display the source; remember recent projects and workspace state.

Required details:

- Project records are local metadata outside user source by default, or clearly documented/ignorable when stored inside it.
- Detect common entry-point signals (`\documentclass`, magic root comments, configured root, and build metadata), but surface ambiguity.
- Exclude `.git`, output/cache directories, and configurable generated directories from normal navigation/indexing.
- Recent projects show path, last-opened time, availability, and a safe `Forget` action; never expose sensitive file names in unexpected places.
- Restore tabs and layout only after confirming paths still exist. Missing files produce a recoverable notice, not an error loop.

**Exit criterion:** opening/reopening a multi-file fixture restores the selected root and editing context without modifying its source tree.

### Phase 2: editing that stays out of the way

Add a mature text editor component, syntax highlighting, tabs, project search, and safe autosave. Choose the editor on measured input latency, IME support, accessibility, large-file behaviour, and integration—not on popularity alone.

Required details:

- Fast open-file and command palette; all commands searchable and keyboard reachable.
- Search results include file, line, short context, count, and keyboard navigation. Replacements are previewable and undoable.
- Syntax highlighting must degrade gracefully for malformed/incomplete LaTeX; it must never block input or claim semantic certainty it lacks.
- Bracket/environment matching, comment toggling, indentation, and snippets should support writing without becoming a mandatory template system.
- Implement unsaved/external-change/recovery states before adding clever completion.
- Support font zoom, high-contrast themes, visible focus, reduced motion, and screen-reader announcements for autosave/build/diagnostic state.

**Exit criterion:** mouse-free editing, search, replace, save recovery, and external-change handling pass against the fixtures and a screen-reader smoke test.

### Phase 3: trustworthy build system

The build system is the product's reliability core. Start with explicit profiles rather than trying to infer every project convention.

Required details:

- A default safe profile for common engines, plus project-level custom command/profile selection. Present the exact invocation before first run.
- `Build`, `Build and view`, `Watch`, `Stop`, `Clean auxiliary files`, and `Reveal output` must each describe what they will do. Keep clean conservative and preview its file list.
- One build controller per project: serialize or deliberately cancel/coalesce overlapping requests; never allow concurrent runs to corrupt the same output.
- Capture structured run metadata and raw stdout/stderr. Parse diagnostics opportunistically, always preserving raw logs.
- Map diagnostic file locations through root/output directories and generated files. If mapping is uncertain, say so.
- Generate SyncTeX where supported and make absence/failure understandable. The SyncTeX manual advises using its command-line utility/parser rather than treating the file format as a private ad-hoc format. [SyncTeX file-format manual](https://texdoc.org/serve/synctex.man5.pdf/0)
- Watch mode must have a visible on/off state, debounce edits, ignore output loops, and never auto-run an unsafe profile without explicit opt-in.
- Put accessibility into the requirement: build completion and error count must be announced non-disruptively; diagnostics must be readable and navigable without colour or a pointer.

**Exit criterion:** every fixture can be built, stopped, failed, rebuilt, and diagnosed; last-known-good PDF and logs survive each failure scenario.

### Phase 4: PDF viewer and synchronization

The viewer is not a preview pane. It is the second half of the writing surface.

Required details:

- Fast, atomic PDF replacement with the state-preservation contract above.
- Continuous and page layout modes; zoom controls, fit-width/page, rotation, text selection/copy, find, outline/bookmarks, page picker, and keyboard scrolling.
- Source → PDF forward search and PDF → source inverse search using SyncTeX. Each command is explicit, cancellable, and reports when synchronization data is unavailable or stale.
- Clicking a PDF must not unexpectedly enter edit mode, steal focus, or trigger navigation without an intentional gesture.
- Persist viewer state per project/output document, not globally: a thesis and a paper may need different zoom/layout states.
- If output changes outside TeX, apply the same safe update contract and identify that it was externally rebuilt.
- Treat accessibility as a renderer-selection gate: keyboard operation, accessible page/status labels, search result navigation, zoom, and sensible focus order are minimums.

**Exit criterion:** 100 repeated successful updates preserve page/position/zoom; 100 failed updates retain a readable old PDF; both SyncTeX directions work on a multi-file fixture.

### Phase 5: polish only after reliability

Add helpful navigation (symbols/sections), bibliography assistance, configurable snippets, Git-aware status, better build presets, and import/export conveniences only when the core workflow meets its budgets. Each addition must pass the question: *does it remove friction from editing a LaTeX project, or does it broaden TeX into a different product?*

## Quality bar and telemetry policy

Quality over money means protecting user attention and data even when it costs engineering time.

- No advertising, engagement loops, nagging onboarding, or feature prompts while a user is writing or resolving an error.
- No source, PDF, build log, path, or document content leaves the device by default. Any future crash reporting is opt-in, inspectable, and redacted.
- Prefer local reproducibility: show exact command, engine version when available, working directory, and environment-relevant settings so users can reproduce a build in their terminal.
- Publish supported versions, known limitations, and performance test conditions. Do not overpromise universal TeX compatibility.
- Maintain a regression suite around the “small cruelties”: focus theft, reset zoom, page-one reload, lost logs, external-file overwrite, disabled shortcuts, inaccessible status, and watch-loop rebuilds.

## Success measures

Measure the workflow, not vanity metrics.

| Outcome | Suggested measure |
| --- | --- |
| Context preservation | 99.9% of successful PDF updates retain page, zoom, and logical position in automated tests; zero known page-one regressions. |
| Reliability | Zero data-loss bugs in release-blocking tests; every write/build failure leaves a recoverable state and clear message. |
| Diagnoseability | In fixture failures, a user can reach the first actionable source location and raw log in at most two deliberate commands. |
| Responsiveness | Define and meet percentile budgets for startup, keystroke latency, file switch, search, and PDF update on published reference fixtures. |
| Accessibility | Keyboard-only primary workflow and screen-reader smoke tests pass on each supported platform before release. |
| Scope discipline | Each new feature documents which core workflow friction it removes; features that require accounts/cloud/visual editing need a separate product decision. |

## Source notes

- [SyncTeX command manual](https://texdoc.org/serve/synctex.man1.pdf/0) — source/output synchronization is a standard capability of modern TeX engines and supports navigation in both directions.
- [SyncTeX file-format manual](https://texdoc.org/serve/synctex.man5.pdf/0) — advises using the SyncTeX utility/parser rather than treating its internals as an application-specific format.
- [Overleaf: Code Check](https://docs.overleaf.com/troubleshooting-and-support/code-check) — syntax checking is heuristic and can be unsuitable for projects with custom macros; this supports conservative diagnostics.
- [Overleaf: fixing LaTeX errors](https://docs.overleaf.com/troubleshooting-and-support/fixing-latex-errors) — examples of compiler-error location, severity, and log-based diagnosis.
- [VS Code accessibility documentation](https://code.visualstudio.com/docs/configure/accessibility/accessibility) — practical expectations for keyboard, screen-reader, contrast, zoom, and diagnostic navigation in an editor.
- [notify crate documentation](https://docs.rs/notify/latest/notify/trait.Watcher.html) — cross-platform file watch behaviour and rename/remove caveats relevant to watch mode.
