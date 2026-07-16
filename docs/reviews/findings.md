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
| TEX-D-001 | Medium | `src/services/project-service.ts`; `src/services/build-service.ts` | IPC responses and event payloads are accepted through erased generic annotations. A malformed, incompatible, or stale payload can enter reducers/rendering without a runtime contract and produce invalid state or unsafe error disclosure. | §1 Contracts | Introduce bounded runtime parsers at gateway/event boundaries, reject unknown security-relevant variants, and add malformed-payload contract tests. | Wave D | Open |
| TEX-D-002 | Low | `src/services/project-service.ts` | SyncTeX, save, search/replace, and project-entry gateways accept adjacent strings/numbers/booleans. Positional swaps and behavior flags are not self-describing at call sites. | §2 Types and narrowing | Replace behaviorally significant signatures with readonly request objects/modes during contract migration; typecheck and update focused tests. | Wave D | Open |
| TEX-E-001 | Medium | React callback boundaries in `src/app/app.tsx` and `src/pages/project-workspace-page.tsx` | Type-aware linting identified thirteen promise-returning callbacks passed to synchronous JSX attributes. React discarded their returned promises, leaving rejection ownership implicit and potentially unhandled. | §2 Promises and errors | Use one redacting detached-task owner at synchronous UI boundaries; keep awaited build/save contracts asynchronous and enable typed promise rules as errors. | `fb47327` | Fixed |
| TEX-H-001 | Medium | frontend test matrix | No DOM/component accessibility test exists for primary open-project, workspace, editor, build, search, or PDF workflows. Semantic regressions, missing names, focus loss, and status-announcement defects can pass all automated gates. | §5 Interaction and accessibility | Add focused component/integration coverage for changed high-risk workflows and record keyboard/screen-reader smoke evidence. | Waves E–H | Open |
| TEX-H-002 | Low | `src/features/pdf/pdf-viewer.tsx` PDF scroll region | The scroll region observes bubbled pointer/keyboard activity to defer document replacement while an interaction is active. Oxlint's JSX accessibility rule classifies any handler on the non-interactive region as an interaction defect, although keyboard focus remains on semantic page buttons and controls. | §5 Editor/PDF ownership | Retain one exact, dated suppression while Wave G determines whether interaction tracking can move to a dedicated controller without weakening selection/update safety. | Wave G; review 2027-01-16 | Open |

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

When closing a finding, append the correction commit/PR, exact commands and
tests, security/performance/accessibility effect, dependency or permission
delta, and remaining risk in its row or a directly linked detail section. Do
not change a finding to `Fixed` because a linter stopped reporting it.
