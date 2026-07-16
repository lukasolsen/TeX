# Engineering review findings

Register revision: 1  
Review branch: `agent/engineering-hardening`

This register contains evidence-backed defects and control gaps. A hypothesis
is not a finding until a concrete file/contract and credible failure scenario
are recorded. Line references identify the reviewed revision and may move;
symbols and stable configuration keys remain the primary locator.

## Severity and state

| Severity | Release handling |
| --- | --- |
| Critical | Stop review wave and release; isolate and correct immediately. |
| High | Correct in the owning wave before merge unless an approved compensating control exists. |
| Medium | Correct in the wave or assign a named owner and explicit release gate. |
| Low | Correct when evidence supports low churn; otherwise retain as owned follow-up. |

States are `Open`, `In progress`, `Fixed`, `Accepted risk`, `Not reproducible`,
or `Superseded`. `Fixed` requires correction commit and verification evidence.

## Findings

| ID | Severity | Location | Evidence and failure/exploit scenario | Standard | Required correction and test | Owner / delivery | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TEX-A-001 | High | `.github/workflows/ci.yml`; `.github/workflows/release.yml` | Every third-party Action was referenced by a mutable tag. The release job grants `contents: write`; compromise or retargeting of an action tag could execute with release authority and alter artifacts/releases. | §6 Supply chain | Verify upstream commits, pin full SHAs with version comments, retain minimum job permissions, and validate workflow syntax. | `fb47327` | Fixed |
| TEX-A-002 | Medium | `src-tauri/Cargo.toml`; `.github/workflows/ci.yml` | No advisory, licence, source, or dependency-diff policy was enforced for the Cargo and frontend resolutions. A vulnerable or disallowed transitive dependency could enter while all prior gates passed. | §6 Supply chain | Add ecosystem-appropriate advisory and policy gates with owned exception files; exercise the policy commands and dependency review. | `fb47327` | Fixed |
| TEX-A-003 | Medium | `src-tauri/tauri.conf.json`; `src-tauri/capabilities/default.json` | `withGlobalTauri` exposed the global API although source imported module APIs; the main window received broad `core:default`, `dialog:default`, and `log:default` sets. Frontend compromise therefore had authority beyond the demonstrated folder-open/event calls. | §6 Commands and capabilities | Disable global injection; move folder selection to Rust; expose only event listen/unlisten; remove unused frontend plugin packages; verify generated release authority. | `ab6a217` | Fixed |
| TEX-A-004 | Medium | `tsconfig.app.json`; `tsconfig.node.json` | `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` were absent. Indexed and optional values could be consumed under contracts that did not match runtime absence semantics. | §2 Compiler contract | Enable both options, correct resulting contracts without assertions, and run typecheck/tests/build. | `fb47327` | Fixed |
| TEX-A-005 | Medium | former `eslint.config.js`; `package.json` | The ESLint baseline had no JSX accessibility or import policy and could not enforce the adopted promise/assertion contract without typed rules. | §7 | Implement the reviewed native Oxlint configuration in `oxlint-migration.md`, prove compatibility, then remove ESLint dependencies/configuration. | `fb47327` | Fixed |
| TEX-A-006 | Low | `vite` production output; `src/pages/project-workspace-page.tsx` dependency graph | The minified workspace chunk is 1,187.01 kB (368.98 kB gzip), above Vite's 500 kB warning threshold. This increases parse/load risk, but no user-visible latency has yet been measured. | §5 Rendering; Phase 5 measurement rule | Profile chunk composition and startup/workspace navigation before changing boundaries; optimize only with same-protocol before/after data. | Wave A / Phase 5 | Open |
| TEX-A-007 | High | `package.json` `typecheck` script | `tsc --noEmit` ran against a solution config with `files: []` and did not build referenced projects, so CI reported a successful typecheck while the production build contained strict-index errors. | §2 Compiler contract | Run TypeScript in build mode over project references and retain the same command in CI; correct every resulting diagnostic through narrowing. | `fb47327` | Fixed |
| TEX-B-001 | Critical | All project-scoped Tauri commands; previously `open_project(path)` | The webview supplied an arbitrary `projectPath`; Rust canonicalized any existing directory and treated it as approved. A compromised webview could bypass the native picker and invoke read, write, build, cleanup, or recursive delete against unrelated user directories. | §1 Authority; §6 Commands and paths | Make approval Rust-owned through the native picker or validated persisted state; require every project-scoped command to resolve a registered root and invalidate approval on root replacement. Test unapproved and replaced roots. | `ab6a217` | Fixed |
| TEX-B-002 | Critical | `src-tauri/src/project_files.rs::create_entry` | Nested entry creation called `create_dir_all` before canonical containment validation. An existing symlink component could cause directories to be created outside the approved root before the command returned an error. Symlink entry canonicalization could also target an internal directory rather than the selected link during deletion. | §6 Paths and files | Restrict creation to one validated direct child of an approved parent; reject symlink components for entry mutation; add symlink and nested-name regressions. | `ab6a217` | Fixed |
| TEX-B-003 | High | `source_read.rs`; `pdf_read.rs`; `persistence.rs`; `project_config.rs`; `project_search.rs`; `root_detection.rs`; `project_open.rs` | Size checks preceded whole-file reads, so a growing file could exceed the cap after metadata inspection. Several app-data reads had no cap; tree collection allocated an entire directory before count enforcement; search/root recursion bounded files but not empty entries or depth. | §6 Limits; §4 Resource ownership | Read through an open handle capped at limit plus one byte; bound state/config/transaction collections and serialized size; enforce traversal entry/depth limits and truthful truncation. | `1d50465` | Fixed |
| TEX-B-004 | High | `src-tauri/src/project_search.rs` replacement and undo loops | Replacement rollback used iterator `all`, which stopped after the first restoration failure and left earlier writes unattempted. Undo applied files sequentially with no rollback, allowing a failed undo to create a second partial write set. | §3 Atomicity; §4 Failure ownership | Centralize write-set application, roll back every completed write in reverse order, preserve transaction evidence on incomplete restoration, and fault-test rollback continuation. | `1d50465` | Fixed |
| TEX-B-005 | High | `save_project_source`; `saveProjectSource` | A webview-controlled `overwriteExternal` boolean bypassed the expected-revision guard. A stale or compromised caller could overwrite an external edit after conflict detection. | §1 Authority; §3 Concurrency | Remove the bypass from IPC and require the exact current revision for every save, including “keep mine” conflict resolution. | `1d50465` | Fixed |
| TEX-B-006 | High | `delete_project_entry`; `project-tree.tsx` | Recursive deletion depended on `window.confirm`; direct IPC invocation bypassed the only user confirmation and could permanently remove an approved project subtree. | §1 Authority; §6 Destructive operations | Resolve the exact target first and require a native warning dialog before deletion; keep the webview as a requestor only. | `1d50465` | Fixed |
| TEX-B-007 | Medium | `src-tauri/src/project_files.rs::rename_entry` | `target.exists()` followed by `std::fs::rename` was a check-then-act race; standard rename may replace a destination created between those operations. | §3 Atomicity; §6 Files | Use an atomic exclusive rename that fails rather than replacing the destination; retain the existing-destination regression and dependency policy checks. | `1d50465` | Fixed |
| TEX-C-001 | Critical | `ProjectBuildConfiguration`; `BuildRequest`; `validate_build` | Custom-command and shell-escape consent were frontend booleans, and a build request could supply an arbitrary configuration. A compromised webview could set both booleans, select any existing absolute executable, and invoke it with user permissions without a trusted confirmation. | §1 Authority; §6 Processes and TeX | Load build configuration in Rust, ignore request-supplied configuration, and establish new/changed custom-command and shell-escape consent through separate native confirmations after control-character-safe structural validation. | `12a8355` | Fixed |
| TEX-C-002 | High | `src-tauri/src/build_system.rs::start_build` | The compiler process was spawned before the controller checked `project.active`. Concurrent requests could both execute project-controlled TeX; the losing process was killed only after it had started. | §3 Concurrency; §6 Process authority | Reserve the per-project slot under the controller lock before process creation; cleanly remove the run if supervisor startup fails. | `579730a` | Fixed |
| TEX-C-003 | High | build cancellation and external command execution | Build cancellation called `Child::kill`, which terminates only the process leader; compiler, bibliography, or custom-command descendants could survive. SyncTeX, reveal, and fixture children had no common deadline/reaping owner. | §4 Resource ownership; §6 Processes | Spawn cross-platform process groups/Job Objects, kill and wait the group, apply hard deadlines, and test a timed-out process with a background descendant. | `579730a` | Fixed |
| TEX-C-004 | High | `spawn_output_reader`; watcher callback channels; retained build state | `read_until` allocated an entire attacker-controlled line, build and notify callbacks used unbounded channels, and retained logs/watch paths lacked aggregate byte/cardinality budgets. Build output or an event storm could exhaust memory before retention trimming/debounce. | §4 Bounds; §6 Events/logging | Cap and drain lines, backpressure build output, bound retained bytes/runs/projects, bound watcher channels/paths/active watchers, and surface overflow as a truthful truncated reconciliation event. | `579730a` | Fixed |
| TEX-C-005 | Medium | `synctex.rs`; reveal helpers; fixture process helpers | `Command::output` captured SyncTeX output without a limit or deadline; reveal children were dropped without waiting; fixture probes/builds could hang CI indefinitely. | §4 Process lifetime; §6 Parsers | Centralize grouped bounded capture/status execution, resolve SyncTeX to an executable file, enforce deadlines, validate finite output coordinates, and wait every child. | `579730a` | Fixed |
| TEX-C-006 | High | `clean_auxiliary_files` | A compromised webview could invoke deletion directly with any allowlisted auxiliary path and bypass the React preview dialog. Duplicate paths also permitted a predictable partial-failure response after the first deletion. | §1 Authority; §6 Destructive operations | Deduplicate and revalidate exact paths, require native confirmation, and expose a truthful bounded/truncated preview. | `579730a` | Fixed |
| TEX-C-007 | Medium | watch controller state and tree-watch stop/start | Rust left watch state at `BuildQueued` after the frontend consumed a queue, so restoration could display a stale queue without scheduling it. Tree stop removed ownership before the old thread exited; an immediate restart allowed the old thread to remove the new registration. | §3 State machines; §4 Event ordering | Add an authenticated queue acknowledgement, restore queued work on hook initialization, and retain tree-watch registration until its worker exits. | `579730a` | Fixed |
| TEX-C-008 | Low | `parse_diagnostic` | Relative diagnostic paths containing `..` were marked as mapped project files. Later source reads rejected them, but the UI received a false location and could present misleading navigation. | §1 Contracts; §6 Logging | Accept only normal project-relative diagnostic paths, clamp line numbers, and regress traversal output. | `579730a` | Fixed |
| TEX-D-001 | Medium | `src/services/project-service.ts`; `src/services/build-service.ts` | IPC responses and event payloads were accepted through erased generic annotations. A malformed, incompatible, or stale payload could enter reducers/rendering without a runtime contract and produce invalid state or unsafe error disclosure. | §1 Contracts | Introduce bounded runtime parsers at gateway/event boundaries, reject unknown security-relevant variants, and add malformed-payload contract tests. | `59693fb` | Fixed |
| TEX-D-002 | Low | `src/services/project-service.ts`; cross-module path/run contracts | SyncTeX, save, search/replace, and project-entry gateways accepted adjacent strings/numbers/booleans. Canonical roots, relative paths, build IDs, and revision hashes degraded to interchangeable primitives after validation. | §2 Types and narrowing | Use readonly request objects and opaque constructors at the receiving boundary; normalize project-relative wire paths and update focused tests. | `59693fb` | Fixed |
| TEX-D-003 | High | `src/domain/build.ts::projectBuildReducer` | Rust retained bounded history, but every live build log event was appended to frontend state indefinitely; pre-response events for absent runs were also unbounded. A verbose 30-minute build could exhaust webview memory despite backend limits. | §4 Resource ownership; §5 Rendering | Mirror run/entry/byte budgets in the reducer, bound pending events, retain diagnostics only for retained log entries, and stress with 600 ordered events. | `59693fb` | Fixed |
| TEX-E-001 | Medium | React callback boundaries in `src/app/app.tsx` and `src/pages/project-workspace-page.tsx` | Type-aware linting identified thirteen promise-returning callbacks passed to synchronous JSX attributes. React discarded their returned promises, leaving rejection ownership implicit and potentially unhandled. | §2 Promises and errors | Use one redacting detached-task owner at synchronous UI boundaries; keep awaited build/save contracts asynchronous and enable typed promise rules as errors. | `fb47327` | Fixed |
| TEX-E-002 | High | `use-project-build.ts`; `use-project-watch.ts`; `use-project-tree-watch.ts`; `use-project-session.ts` | Asynchronous operations lacked a consistent active-project generation. A save in progress caused concurrent navigation to fail immediately; an old build could start after its workspace unmounted; initial watch status could overwrite a newer event; tree-watch startup could complete after teardown; and stale external reads could target a new project with the same relative filename. | §3 Concurrency; §5 React effects and user context | Give project/document operations explicit generations and active identities, share one in-flight save result, suppress duplicate build starts and overlapping reconciliation, establish event precedence, and compensate startup completed after teardown. | `5b679b7` | Fixed |
| TEX-E-003 | Medium | `use-app-preferences.ts`; build configuration persistence; workspace persistence | Preference and build-configuration writes were concurrent and could persist an older value last. Initial preference loading could overwrite a user change, while background workspace-write failures were discarded; a restoration write failure could also route a valid restored project back home. | §3 Atomicity and failure ownership; §5 Truthful state | Serialize ordered mutations, apply load/save results only to the current revision, retain a visible workspace-persistence notice, and separate successful restoration from best-effort context persistence. | `5b679b7` | Fixed |
| TEX-F-001 | High | conflict resolution in `use-project-session.ts` | “Keep mine” wrote a captured editor value, then unconditionally marked the document saved. An edit made while that write was pending remained in memory but appeared saved; closing the file could therefore discard the newer text without another write. | §3 Concurrency; §5 User-work preservation | Mark a completed write saved only when current content equals submitted content, exclude concurrent conflict writes from autosave, reschedule dirty content, and bind every completion to project and file identity. | `8e0f8e9` | Fixed |
| TEX-F-002 | High | `project-search-panel.tsx` | A debounced search could resolve after replacement began and overwrite `replacing` with `ready`, re-enabling a duplicate transactional write. Replacement/undo completions also lacked teardown and project-generation checks. | §3 Concurrency; §5 Search/replace | Use monotonic latest-request identities, invalidate pending searches before mutation, exclude duplicate mutations synchronously, disable mutable controls during writes, and reject stale completion/refresh results. | `8e0f8e9` | Fixed |
| TEX-F-003 | High | CodeMirror update listener; document autosave | Every CodeMirror document update scheduled recovery and autosave, including partial IME composition. A long composition could write incomplete input, and a queued composition-end callback could target a newly opened project sharing the same relative path. | §5 Editor ownership and IME | Carry explicit composition state through the editor contract, update presentation without persistence while composing, finalize on composition end, block explicit save during composition, and bind changes to canonical project identity. | `8e0f8e9` | Fixed |
| TEX-F-004 | Medium | project tree and source-tab interactions | Rename used `window.prompt`; failed create/rename operations closed the editor and discarded the entered name; clipboard rejections were unhandled; duplicate tree actions both claimed to copy different path forms while returning the same value. | §2 Promise ownership; §5 Interaction and truthful UI | Use focused inline rename/create controls with explicit success results, retain failed input, centralize clipboard rejection and feedback, and expose only path forms the frontend can represent truthfully. | `8e0f8e9` | Fixed |
| TEX-F-005 | Medium | `latex-hover.ts`; editor hover callback | Hover resolution copies the complete document and can parse it repeatedly up to three times before reading a referenced file. The source limit prevents unbounded input, but multi-megabyte files can still produce pointer-triggered main-thread work. | §5 Rendering; Phase 5 measurement rule | Benchmark hover latency on the large-document fixture, then introduce a bounded source window/cache only with equivalent reference/keyword regression coverage. | Phase 5 | Open |
| TEX-G-001 | High | `pdf-viewer.tsx::PdfPage`; continuous layout | Continuous mode mounted and rendered a full-resolution canvas and text layer for every PDF page. Page count, page geometry, CSS dimensions, canvas dimensions, and aggregate pixels had no frontend bound; a large or adversarial local PDF could exhaust webview memory or exceed browser canvas limits. | §4 Resource ownership; §5 PDF rendering | Reject excessive page counts/geometry, derive a bounded output scale, retain lightweight placeholders, render only the current five-page neighborhood, cancel inactive work, and clean page/canvas/text resources. | `41ea3e8` | Fixed |
| TEX-G-002 | High | PDF document/page/render/text lifecycle | Stale `getDocument` loading tasks were not destroyed until parsing completed; page/render/text promise rejections were partly unowned; render cancellation rejections were ignored; and inactive page proxies were not explicitly cleaned. Rapid builds, zoom changes, or document replacement could retain workers/tasks and emit unhandled rejections. | §4 Resource ownership; PDF.js lifecycle contract | Assign loading-task ownership before awaiting, destroy non-transferred tasks, observe render/text completion, cancel before cleanup, invalidate every async controller on replacement/unmount, and centralize terminal destruction. | `41ea3e8` | Fixed |
| TEX-G-003 | High | PDF replacement, scrolling, focus, and selection restoration | Scroll persistence derived position from a potentially stale page, while selection restoration used the first matching text anywhere in the document after a fixed delay. Successful updates could restore the wrong logical location or select repeated text on the wrong page. | §5 User-context preservation | Derive page and relative position atomically from the visible DOM page, bind selected text to its page, restore only after that page's new text layer completes, clamp only removed pages, and retain connected focus. | `41ea3e8` | Fixed |
| TEX-G-004 | Medium | PDF search and outline | PDF search scanned every page without a result budget, accepted unbounded query input, left stale match state after edits, did not own extraction failures, and highlighted only text layers present at one timing-dependent pass. Nested outlines were not rendered or bounded. | §4 Bounds; §5 Truthful UI | Bound query/page/result work, expose searching/error/truncation states, cancel by generation, release non-visible search pages, apply highlights when each text layer completes, and flatten outlines with explicit item/depth limits and truncation notice. | `41ea3e8` | Fixed |
| TEX-G-005 | Medium | continuous PDF layout | Continuous mode now limits expensive rendering to five pages, but still mounts up to 2,048 lightweight page placeholders so scroll geometry remains available. The worst-case React/layout cost has not been measured. | §5 Rendering; Phase 5 measurement rule | Benchmark open, scroll, zoom, and replacement latency/memory at the supported page limit; virtualize placeholders only if measured thresholds fail without weakening logical-position restoration. | Phase 5 | Open |
| TEX-H-001 | Medium | frontend test matrix | No DOM/component accessibility test exists for primary open-project, workspace, editor, build, search, or PDF workflows. Semantic regressions, missing names, focus loss, and status-announcement defects can pass all automated gates. | §5 Interaction and accessibility | Add focused component/integration coverage for changed high-risk workflows and record keyboard/screen-reader smoke evidence. | Waves E–H | Open |
| TEX-H-002 | Low | `src/features/pdf/pdf-viewer.tsx` PDF scroll region | The scroll region observed bubbled pointer/keyboard activity through JSX handlers, requiring an exact accessibility suppression despite semantic page controls owning focus. | §5 Editor/PDF ownership | Move interaction tracking into a lifecycle-managed controller attached to the scroll owner, retain semantic page keyboard controls, and remove the suppression. | `41ea3e8` | Fixed |

## Finding closure evidence

- `ab6a217`: added Rust-owned approved-root identity, native folder selection,
  authorization checks on every project-scoped command, root-replacement and
  unapproved-root tests, direct-child creation, symlink mutation rejection,
  exact event-only capability permissions, disabled global Tauri injection,
  and removed two frontend plugin dependencies. Verified with the full frontend
  and Rust gate set plus a no-bundle release build; 55 Rust tests passed.
- `12a8355`: removed configuration authority from build requests, loaded build
  configuration in Rust, validated control-character-safe command structure,
  added separate native custom-command and shell-escape confirmations, removed
  forgeable UI consent controls, and added a forged-request regression. The
  full frontend/Rust gate set passed; 56 Rust tests passed.
- `fb47327`: pinned Actions to reviewed commit SHAs, restricted workflow
  permissions and time, added dependency-review, cargo-deny, and Bun audit
  policy, replaced ESLint with the documented Oxlint rule set, enabled strict
  TypeScript absence semantics, corrected the no-op typecheck command, and
  assigned detached promise rejection ownership. Oxlint, project-reference
  typechecking, 44 frontend tests, build, audit, Clippy, cargo-deny, and 56 Rust
  tests passed; no permission expansion or runtime dependency was introduced.
- `1d50465`: introduced open-handle bounded reads, explicit persistence and
  traversal budgets, canonical recovery/transaction identities, normal-path
  and symlink rejection, complete reverse-order write-set rollback, native
  delete confirmation, revision-guarded saves without an override, and atomic
  no-replace rename. The new `renamore` runtime dependency adds one narrowly
  scoped filesystem primitive; its transitive additions are build-only.
  Clippy with warnings denied, 61 Rust tests, Oxlint, project-reference
  typechecking, frontend tests, cargo-deny advisory/licence/source checks, and
  diff hygiene passed. Residual filesystem behavior on unsupported exclusive-
  rename filesystems fails closed.
- `579730a`: moved build spawn behind per-project reservation, introduced
  process-group cancellation/deadlines and bounded process capture, applied
  build log/channel/history budgets, surfaced watcher overflow, corrected
  queue/tree-watch ordering, required native auxiliary-clean confirmation, and
  constrained diagnostic paths. `command-group` is the sole new runtime
  dependency and provides the cross-platform process-tree primitive; no Tauri
  permission changed. Clippy with warnings denied, 66 Rust tests, cargo-deny
  advisory/licence/source checks, Oxlint, project-reference typechecking, 44
  frontend tests, production build, and diff hygiene passed. Residual process
  risk is limited to executables that replace themselves after validation or
  deliberately escape the operating-system process group/session.
- `59693fb`: replaced assertion-only Tauri generics with bounded `unknown`
  parsers for every non-void response and event, rejected unknown Rust request
  fields, normalized and branded authority-bearing scalars, migrated ambiguous
  service calls to readonly request objects, made cross-module wire records
  readonly, and mirrored backend log budgets in frontend state. No dependency
  or permission changed. Oxlint, project-reference typechecking, 55 frontend
  tests, production build, Clippy with warnings denied, 66 Rust tests, and diff
  hygiene passed. Malformed events fail closed without exposing payload data or
  throwing through the browser event loop.
- `5b679b7`: added explicit build/watch/project operation generations,
  duplicate-build and overlapping-reconciliation guards, teardown-safe watcher
  ordering, shared in-flight document saves, project-aware external refreshes,
  ordered preference/configuration persistence, and visible workspace-write
  failure retention. The ordered queue has deterministic ordering and failure-
  continuation tests. No dependency, permission, IPC, or persistence schema
  changed. Oxlint, project-reference typechecking, 57 frontend tests,
  production build, Rust formatting, Clippy with warnings denied, and 66 Rust
  tests passed. The existing workspace chunk warning remains owned by
  TEX-A-006 for Phase 5 measurement.
- `8e0f8e9`: made conflict writes revision-current in the UI state machine,
  deferred persistence during CodeMirror IME composition, bound editor and
  filesystem mutation completions to canonical project identity, serialized
  search/replace presentation with latest-request generations, replaced prompt
  rename with failure-retaining inline controls, owned clipboard errors, and
  reduced repeated/initial render work. Deterministic tests cover composition,
  post-write dirty retention, request invalidation, and existing editor/search
  models; 63 frontend and 66 Rust tests passed with all lint, type, build,
  formatting, and Clippy gates. No dependency, permission, IPC, or schema
  changed. Hover latency remains assigned to TEX-F-005 for Phase 5 measurement.
- `41ea3e8`: bounded PDF page count, geometry, canvas allocation, outline,
  search, and active render pages; assigned loading/render/text/page cleanup;
  retained last-good documents on update failure; made scroll/selection/focus
  restoration page-specific; and moved interaction observation out of JSX so
  the accessibility suppression was removed. Model tests cover replacement
  stability, render windows, canvas limits, outline truncation, and rotation.
  Oxlint, project-reference typechecking, 68 frontend tests, production build,
  Rust formatting, Clippy with warnings denied, and 66 Rust tests passed. No
  dependency, permission, IPC, or schema changed. Placeholder and chunk costs
  remain assigned to TEX-G-005 and TEX-A-006 for Phase 5 measurement.

When closing a finding, append the correction commit/PR, exact commands and
tests, security/performance/accessibility effect, dependency or permission
delta, and remaining risk in its row or a directly linked detail section. Do
not change a finding to `Fixed` because a linter stopped reporting it.
