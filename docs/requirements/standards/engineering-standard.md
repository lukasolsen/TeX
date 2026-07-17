# TeX Engineering Standard

Version: 1.0  
Adopted: 2026-07-16  
Applies to: maintained production code, tests, fixtures, configuration,
workflows, and documentation

This standard is the review authority for TeX. `MUST` and `MUST NOT` are
release requirements. `SHOULD` identifies the expected design; deviation
requires stronger local evidence. The product constraints in `AGENTS.md` and the
user-work protections in [`ui-ux-requirements.md`](ui-ux-requirements.md) remain
binding.

## 1. Cross-stack communication

### Authority

- Treat the webview as untrusted. React and TypeScript MUST NOT authorize a
  path, select an executable, grant write access, define a build-output
  location, or make privileged persisted state authoritative.
- Keep filesystem access, process execution, privileged persistence,
  canonicalization, and authorization in Rust. Keep rendering, interaction,
  and user-facing state coordination in React.
- Revalidate every privileged request in Rust at time of use. Frontend checks
  are usability controls, not security controls.
- Expose only commands and plugin permissions required by the assigned window.
  Capabilities assigned to the same window are cumulative; separate files MUST
  NOT be represented as separate security domains.

### Contracts

- Route IPC through a named frontend gateway and a thin Rust command adapter.
  Components MUST NOT call `invoke`, subscribe to Tauri events, or use a
  privileged plugin directly.
- Define one typed request, success response, structured error contract, and
  event contract per operation. The Rust boundary owns validation and wire
  compatibility. The frontend gateway owns runtime parsing of received data.
- Receive IPC results, persisted JSON, worker messages, URL data, and plugin
  responses as untrusted values. A generic type argument or type assertion
  MUST NOT substitute for runtime parsing.
- Use stable machine-readable error codes. Derive user-visible messages in the
  presentation layer. Raw errors, handles, document content, command lines,
  environment values, and unnecessary absolute paths MUST NOT cross IPC.
- Version persisted schemas. Version event or request protocols before a
  non-additive wire change. Reject unknown security-relevant variants; tolerate
  additive fields only where the parser contract permits them.

### Ordering and state

- Give concurrent operations an opaque identity or generation. Ignore stale
  completion only after ownership has been proved; never let it overwrite newer
  state.
- Specify cancellation semantics: requested, acknowledged, completed, failed,
  or unsupported. Cancellation MUST leave source, recovery data, logs, and the
  last known-good PDF in a valid state.
- Model idle, pending, running, success, empty, cancellation, failure, stale,
  conflict, and recovery states explicitly where applicable. Boolean clusters
  that permit contradictory states are prohibited.
- Preserve cursor, selection, focus, scroll, pane geometry, open documents, PDF
  page/logical position/zoom/layout, and last-good output across automatic
  updates unless the user explicitly requests navigation or reset.

## 2. TypeScript

### Compiler contract

- Keep `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `useUnknownInCatchVariables` enabled for
  application and build code.
- Use bundler module resolution, explicit type-only imports, and ESM. Do not add
  ambient declarations to avoid a module ownership or validation decision.
- Do not weaken compiler options for a file group. A third-party declaration
  defect requires the narrowest adapter or an owned, time-bounded exception.

### Types and narrowing

- Do not introduce explicit or implicit `any` in maintained code. Receive
  untrusted values as `unknown` and narrow them at the receiving boundary.
- Do not use non-null assertions, double assertions, `@ts-ignore`, or
  assertions that claim an external contract. An assertion is permitted only
  when a local invariant is statically unavailable, documented at the exact
  site, and covered by a test that would fail if the invariant changes.
- Use discriminated unions for state machines and exhaustive `switch` handling.
  The default branch of a security-relevant parser MUST reject unknown input.
- Brand authority-bearing or easily confused scalar values—canonical project
  roots, project-relative paths, build identifiers, revisions, and coordinate
  systems—at the boundary that establishes their invariant. Do not brand
  ordinary display strings or values that have no enforced constructor.
- Make cross-module records and collections readonly unless mutation is part of
  the declared ownership contract.
- Replace adjacent ambiguous primitives with a named parameter object. Replace
  behavior-changing boolean parameters with a named mode or options field.
- Exported functions and hooks MUST declare return types. Exported values MUST
  have a stable, intentional type; do not export inference accidents.

### Promises and errors

- Every promise MUST be awaited, returned, aggregated, or passed to one named
  detached-task helper that reports rejection. Event handlers returning
  promises MUST have an explicit rejection owner.
- Represent expected application failures as discriminated error values or
  documented error classes. Do not branch on human-readable messages.
- Preserve diagnostic causes internally without exposing sensitive values.
  Catch `unknown`, classify it once, and avoid repeated lossy translation.

## 3. Declarations and file structure

### Ownership

- Place domain types beside the domain that establishes their meaning. Place
  IPC wire types and parsers beside the gateway/command boundary. Place hooks
  beside the feature orchestration they own; place components, tests, fixtures,
  and styles beside their narrowest stable owner.
- Rust commands MUST adapt serialized input to domain services. Filesystem,
  process, parser, persistence, and watcher policy belongs in cohesive modules
  below the command boundary. Do not embed policy in command registration.
- A rendering file MUST NOT own reusable domain, persistence, process, or IPC
  contracts. It MAY declare a small private props type when that contract has no
  independent consumer. Exported or semantically significant props belong in a
  named adjacent module when extraction improves ownership or reuse.
- Do not create catch-all `types`, `models`, `interfaces`, `helpers`, or `utils`
  modules. A shared module MUST name the capability or domain it owns.
- Prefer string-literal unions or `as const` values to TypeScript enums. Use an
  enum only for an actual runtime or interoperability requirement. Do not export
  `const enum` across a module boundary.

### Dependency direction

- Keep domain modules independent of React, Tauri frontend APIs, and concrete
  UI components. Keep service gateways independent of pages and components.
- Avoid cycles. A cycle requires an ownership correction; barrel files MUST NOT
  conceal one.
- Export only supported consumers. Do not retain compatibility wrappers,
  duplicate utilities, speculative extension points, or unused exports.
- Before deletion, search static references, dynamic names, command/event
  registration, configuration, platform paths, tests, and documentation. Record
  evidence when runtime discovery or generated integration could hide use.

### File quality

- Name files by owned behavior or contract. Split a file when it contains
  independent policy, has conflicting reasons to change, or cannot be reviewed
  with its callers as one unit. Do not split solely to satisfy a line count.
- Keep test-only support behind test configuration. Fixtures MUST state purpose,
  expected behavior, provenance, and licence where they include third-party
  material.
- Do not commit incidental compiler output, absolute build paths, timestamps,
  caches, or generated databases as fixtures. A generated artifact MAY be
  committed only when its exact bytes are a declared test input, its producer
  and provenance are documented, and tests do not rewrite it in place.

## 4. Comments and documentation

- Document public and behaviorally significant contracts when the type and name
  do not state purpose, invariants, authority, ownership, ordering, cancellation,
  failure, lifetime, or side effects.
- Document internals that enforce path containment, symlink policy, process
  construction, URL policy, atomicity, recovery consistency, revision ordering,
  SyncTeX conversion, PDF origin/loading, capability assumptions, or deliberate
  resource limits.
- State the enforced invariant and why it matters. Do not claim code is “safe”
  or “secure” without naming the control.
- Do not narrate syntax, repeat a declaration, preserve history, leave
  commented-out code, or promise unowned future work. A TODO MUST reference a
  tracked finding or issue and state the blocking condition.
- Keep documentation truthful and update it with behavior, permission, schema,
  dependency, workflow, or support changes. Version claims tied to external
  tools and cite their primary source.
- Document user-visible limitations where a reasonable user could otherwise
  infer that work is protected or an operation is supported.

## 5. React

### Rendering and state

- Keep render functions pure. Derive render data during render or in a measured
  memoization boundary; do not mirror derived values through effects.
- Use effects only to synchronize external systems. Declare complete
  dependencies. Setup MUST have symmetrical cleanup for events, timers,
  workers, observers, editor views, PDF tasks, and in-flight operations.
- Use reducers or explicit state machines for interacting asynchronous states.
  Guard every completion with its operation identity where overlap is possible.
- Preserve state intentionally through stable component identity. Key changes
  that reset editor or PDF state require an explicit restoration contract and
  regression test.
- Do not place high-frequency editor, scroll, log, or render-task data in broad
  React state without measured need. Subscribe at the narrowest owner and batch
  or defer non-urgent presentation work.

### Editor and PDF ownership

- Give each CodeMirror view, PDF loading task, document proxy, render task,
  worker, observer, and object URL one owner and deterministic disposal path.
- Preserve IME composition. Autosave, replacement, highlighting,
  reconfiguration, and external-file handling MUST NOT split a composition or
  move selection without explicit user action.
- Cancel superseded PDF loads/renders and reject stale completion. Keep the
  last-good document visible until replacement is validated and renderable.
- Bound page dimensions, canvas allocation, text extraction, search work,
  retained documents, histories, logs, and event queues. A user-controlled
  cancel or stop path MUST remain responsive.

### Interaction and accessibility

- Use native elements and semantics before custom controls. Every action MUST
  be keyboard operable, visibly focusable, named, and exposed with the correct
  state to assistive technology.
- Do not use colour, iconography, hover, pointer precision, or animation as the
  sole carrier of meaning. Respect reduced motion, forced colours, text scaling,
  and platform zoom.
- Render truthful initial, pending, progress, success, empty, cancellation,
  failure, unavailable, conflict, and recovery states as applicable.
- Acknowledge deliberate input immediately. Async status MUST NOT steal focus,
  scroll content, move controls under the pointer, or replace useful content
  with a generic error surface.
- Announce only consequential state changes. Keep live-region messages concise,
  deduplicated, and independent of rapidly changing compiler output.
- Test changed workflows by keyboard and at least one screen-reader path. Test
  focus restoration, accessible name/state, reduced motion, and high-contrast
  behavior when affected.
- Shared controls MUST preserve native naming, description, state, focus, and
  ownership relationships through composition. Informational updates use
  polite status semantics; assertive alerts are reserved for failures requiring
  immediate attention.
- Semantic tokens MUST map every rendered surface and foreground to system
  colors under forced-colors mode. User-selectable accent values MUST NOT
  override that mapping. Declare supported `color-scheme` values so
  browser-owned controls match the active theme.
- Changed primary workflows MUST pass user-centric DOM assertions and an
  automated accessibility scan. Simulated-DOM scans are an early regression
  gate, not WCAG evidence: contrast, platform accessibility trees, focus
  appearance, screen-reader output, zoom, and forced colors require a real
  browser or packaged-app smoke test.

## 6. Tauri and webview security

### Commands and capabilities

- Keep commands thin: deserialize a bounded request, validate it, call a domain
  service, and serialize a bounded response. Commands MUST NOT expose internal
  errors, OS handles, unrestricted paths, or implicit ambient authority.
- Grant the smallest capability permission and scope required by a window.
  Review generated permission expansion and plugin transitive authority. Remove
  default permission sets when narrower explicit permissions suffice.
- Disable global Tauri injection unless a reviewed integration requires it.
  Do not load remote application code. Keep production CSP explicit and as
  restrictive as functionality permits; new schemes, origins, inline content,
  evaluation, or asset access require a threat-model update.

### Paths and files

- Establish a canonical project-root object when opening a project. Revalidate
  the root and target at each privileged operation; a previously accepted
  frontend string is never authority.
- Reject absolute relative paths, parent traversal, invalid components,
  forbidden file types, ambiguous roots, device/special files, and symlink
  escapes. Define Unicode and case-normalization behavior per supported platform.
- Validate the nearest existing ancestor before creation. For replacement,
  deletion, rename, and recursive traversal, address ancestor swaps and symlink
  races at the operation boundary; a check followed by an unconstrained path
  operation is insufficient.
- Bound file size, project entry count, traversal depth, search matches, parser
  input, PDF bytes, recovery records, and serialized response size. Fail closed
  before allocation where metadata permits.
- Protect user work with atomic replacement and explicit conflict revisions.
  Flush data and parent metadata where durability is promised. Preserve the
  original or a recoverable draft on partial failure. Multi-file replacement
  MUST define commit, rollback, and crash-recovery semantics.
- Recursive deletion and auxiliary cleanup MUST operate on a previewed,
  revalidated allowlist. Never follow links during destructive traversal.

### Processes and TeX

- Construct processes with `std::process::Command`, a fixed reviewed executable
  selection, and separate arguments. Never pass user or project data through a
  shell or concatenate a command string.
- Validate engine, arguments, working directory, output directory, environment,
  and executable identity in Rust. Remove inherited environment variables that
  alter TeX input/output or process loading unless explicitly required.
- Treat TeX source as executable input. Shell escape and project-provided build
  commands require specific, visible consent bound to the project and exact
  mode. Do not infer consent from a saved argument.
- Supervise one owned process tree per build identity. Bound output, history,
  runtime, and concurrent builds. Stop MUST terminate descendants, reap the
  child, and emit a terminal event exactly once.

### Events, parsing, and observability

- Treat watcher events as invalidation hints. Debounce/coalesce, re-stat, and
  revalidate before action. Bound channels and recover from overflow by
  reconciling authoritative state.
- Parse compiler, SyncTeX, persistence, and PDF-adjacent input with bounded work.
  Preserve raw diagnostic evidence only within documented size and redaction
  limits.
- Emit stable event names, operation identities, sequence/terminal semantics,
  and bounded payloads. The receiver MUST tolerate duplication and reject stale
  or malformed events.
- Log stable event identifiers and minimum diagnostic metadata. Do not log
  document content, recovery text, credentials, full environment, unrestricted
  command arguments, or unnecessary absolute paths. Prevent control-character
  injection and define retention/rotation.

### Supply chain and release

- Commit and enforce lockfiles. CI and release MUST use frozen/locked installs.
- Pin third-party GitHub Actions to verified full commit SHAs. Grant each job
  the minimum `GITHUB_TOKEN` permissions and keep release credentials out of
  untrusted pull-request execution.
- Gate known advisories and review dependency additions, features, licences,
  sources, build scripts, permissions, and transitive expansion. Every ignore
  MUST be owned, scoped, justified, and time-bounded.
- Build releases from protected, reviewed refs with reproducible inputs. Do not
  publish from a workflow that permits unreviewed code to influence credentials,
  tags, release notes, artifact names, or executed scripts.

## 7. Oxlint policy

### Configuration and coverage

- Use one root `.oxlintrc.json`. Keep configuration declarative, committed, and
  schema-backed. Declare ignores, environments, plugins, overrides, and every
  non-default severity explicitly.
- Replace ESLint after the compatibility register proves equivalent or stronger
  coverage. Do not retain duplicate permanent gates.
- Enable correctness at error severity. Evaluate suspicious, performance,
  pedantic, style, restriction, and nursery rules individually or in cohesive
  reviewed sets; category membership alone is not adoption evidence.
- Enable native TypeScript, React/Hooks/Refresh, import, JSX accessibility, and
  Vitest coverage required by maintained files. Prefer native rules over alpha
  JavaScript plugins.
- Adopt type-aware linting only with a pinned compatible
  `oxlint-tsgolint`, measured local/CI cost, stable diagnostics, and a rule list
  that materially exceeds compiler coverage. Experimental type checking MUST
  NOT replace `tsc`.

### Execution and suppressions

- `bun run lint` MUST run Oxlint over the maintained frontend/configuration
  scope with zero warnings permitted. CI MUST execute the same command.
- Keep formatting separate from linting. Review every automated-fix diff;
  suggestion or dangerous fixes MUST NOT run as an unattended repository-wide
  mutation.
- A suppression MUST be on the narrowest construct and include the finding or
  issue, invariant-specific reason, owner, and review/expiry date. File-wide and
  generated blanket suppressions require an exception-register entry.
- Report unused suppressions as errors. New warnings MUST fail locally and in
  CI; do not ratchet by hiding an unowned warning baseline.

## Enforcement and exceptions

| Requirement class | Primary enforcement |
| --- | --- |
| Type and state contracts | TypeScript strict flags, Oxlint, Rust types, contract tests |
| Rust correctness and safety | `rustfmt`, manifest lints, Clippy with warnings denied, tests |
| IPC/path/process security | command/service review, threat model, adversarial tests |
| React lifecycle/accessibility | Oxlint, component tests, keyboard/screen-reader smoke evidence |
| Dependencies/workflows | lockfiles, advisory/licence/source review, pinned Actions, PR review |
| User-context preservation | deterministic reducer/model tests and end-to-end smoke evidence |
| Documentation/ownership | reviewer inspection and change history |

An exception is valid only when it records exact scope, unmet rule, owner,
reason, compensating control, linked finding, and an expiry or review date.
Exceptions MUST NOT waive source loss, project-root
escape, arbitrary command execution, credential exposure, fabricated UI, or
silent loss of the last known-good PDF. Expired exceptions fail the release
gate.

Migration work MAY stage enforcement by review wave. A rule is not considered
enforced until its configured gate passes without an unowned baseline and the
ledger records the affected files as reviewed.
