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
| TEX-A-001 | High | `.github/workflows/ci.yml`; `.github/workflows/release.yml` | Every third-party Action is referenced by a mutable tag. The release job grants `contents: write`; compromise or retargeting of an action tag can execute with release authority and alter artifacts/releases. | §6 Supply chain | Verify upstream commits, pin full SHAs with version comments, retain minimum job permissions, and validate workflow syntax. | Wave A | Open |
| TEX-A-002 | Medium | `src-tauri/Cargo.toml`; `.github/workflows/ci.yml` | No advisory, licence, source, or dependency-diff policy is enforced for the 454-package Cargo and 572-entry frontend resolution. A vulnerable or disallowed transitive dependency can enter while all current gates pass. | §6 Supply chain | Add ecosystem-appropriate advisory and policy gates with owned exception files; exercise a failing policy fixture or documented dry run. | Wave A | Open |
| TEX-A-003 | Medium | `src-tauri/tauri.conf.json`; `src-tauri/capabilities/default.json` | `withGlobalTauri` exposes the global API although source imports module APIs; the main window receives broad `core:default`, `dialog:default`, and `log:default` sets. Frontend compromise therefore has authority beyond the demonstrated folder-open call unless generated permissions prove otherwise. | §6 Commands and capabilities | Disable unused global injection; replace default plugin/core grants with exact permissions where supported; inspect generated authority and smoke-test project opening/logging. | Wave A | Open |
| TEX-A-004 | Medium | `tsconfig.app.json`; `tsconfig.node.json` | `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are absent. Indexed and optional values can be consumed under contracts that do not match runtime absence semantics. | §2 Compiler contract | Enable both options, correct resulting contracts without assertions, and run typecheck/tests/build. | Wave A / D | Open |
| TEX-A-005 | Medium | `eslint.config.js`; `package.json` | The current ESLint baseline has no JSX accessibility or import policy and cannot enforce the adopted promise/assertion contract without typed rules. The mandated Oxlint migration is not implemented. | §7 | Implement the reviewed native Oxlint configuration in `oxlint-migration.md`, prove compatibility, then remove ESLint dependencies/configuration. | Wave A | Open |
| TEX-A-006 | Low | `vite` production output; `src/pages/project-workspace-page.tsx` dependency graph | The minified workspace chunk is 1,187.01 kB (368.98 kB gzip), above Vite's 500 kB warning threshold. This increases parse/load risk, but no user-visible latency has yet been measured. | §5 Rendering; Phase 5 measurement rule | Profile chunk composition and startup/workspace navigation before changing boundaries; optimize only with same-protocol before/after data. | Wave A / Phase 5 | Open |
| TEX-B-001 | Critical | All project-scoped Tauri commands; previously `open_project(path)` | The webview supplied an arbitrary `projectPath`; Rust canonicalized any existing directory and treated it as approved. A compromised webview could bypass the native picker and invoke read, write, build, cleanup, or recursive delete against unrelated user directories. | §1 Authority; §6 Commands and paths | Make approval Rust-owned through the native picker or validated persisted state; require every project-scoped command to resolve a registered root and invalidate approval on root replacement. Test unapproved and replaced roots. | Phase 3 security repair | In progress |
| TEX-B-002 | Critical | `src-tauri/src/project_files.rs::create_entry` | Nested entry creation called `create_dir_all` before canonical containment validation. An existing symlink component could cause directories to be created outside the approved root before the command returned an error. Symlink entry canonicalization could also target an internal directory rather than the selected link during deletion. | §6 Paths and files | Restrict creation to one validated direct child of an approved parent; reject symlink components for entry mutation; add symlink and nested-name regressions. | Phase 3 security repair | In progress |
| TEX-D-001 | Medium | `src/services/project-service.ts`; `src/services/build-service.ts` | IPC responses and event payloads are accepted through erased generic annotations. A malformed, incompatible, or stale payload can enter reducers/rendering without a runtime contract and produce invalid state or unsafe error disclosure. | §1 Contracts | Introduce bounded runtime parsers at gateway/event boundaries, reject unknown security-relevant variants, and add malformed-payload contract tests. | Wave D | Open |
| TEX-D-002 | Low | `src/services/project-service.ts` | SyncTeX, save, search/replace, and project-entry gateways accept adjacent strings/numbers/booleans. Positional swaps and behavior flags are not self-describing at call sites. | §2 Types and narrowing | Replace behaviorally significant signatures with readonly request objects/modes during contract migration; typecheck and update focused tests. | Wave D | Open |
| TEX-H-001 | Medium | frontend test matrix | No DOM/component accessibility test exists for primary open-project, workspace, editor, build, search, or PDF workflows. Semantic regressions, missing names, focus loss, and status-announcement defects can pass all automated gates. | §5 Interaction and accessibility | Add focused component/integration coverage for changed high-risk workflows and record keyboard/screen-reader smoke evidence. | Waves E–H | Open |

## Finding closure evidence

When closing a finding, append the correction commit/PR, exact commands and
tests, security/performance/accessibility effect, dependency or permission
delta, and remaining risk in its row or a directly linked detail section. Do
not change a finding to `Fixed` because a linter stopped reporting it.
