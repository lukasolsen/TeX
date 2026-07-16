# TeX engineering standards, audit, and hardening plan

Status: in progress — Phase 4 Waves A–E complete
Created: 2026-07-16  
Scope: every maintained Rust, React, TypeScript, configuration, test, workflow,
fixture, and documentation file in TeX

## Direction

This work starts by defining one TeX Engineering Standard. It applies across
Rust and React/TypeScript, states how the two sides communicate, and gives
specific policy for TypeScript, declarations and file structure, comments and
documentation, React, Tauri/webview security, and Oxlint.

The standard is the authority for the review. Do not start a repository-wide
cleanup, lint migration, or rule rollout until it has been written, reviewed,
and accepted. Then review every maintained file against it, record every
finding, and fix findings in small, evidence-backed branches. The target is a
safe, direct, maintainable local-first LaTeX editor—not a style exercise or a
generic application framework.

“Every file” means every maintained file is inventoried, assigned to a review
wave, read in full with its relevant callers, contracts, and tests, and marked
in the review ledger. It does not mean changing every file. Do not create
churn without a finding and a clear correction.

## Non-negotiable principles

- Standards before findings; findings before fixes; tests before completion.
- Correctness, user-work preservation, and security take priority over style.
- The frontend owns presentation and state coordination. Rust owns filesystem,
  process, validation, persistence, and privileged operations. No exception
  crosses this boundary without an explicit typed contract.
- All external input is untrusted until validated at the receiving boundary:
  IPC payloads, paths, files, watcher events, compiler output, PDFs, persisted
  state, environment, command arguments, dependencies, and CI input.
- Prefer the smallest cohesive design. Do not add abstractions, dependencies,
  permissions, configuration, or comments without a concrete need.
- Measure performance before optimizing. Preserve focus, selection, scroll,
  PDF page/zoom/layout, and the last known-good PDF on every successful or
  failed automatic update.
- A suppression or exception is a defect until it names the exact scope,
  reason, owner, compensating control, review finding, and expiry date.
- One concern per branch and PR. Do not combine policy, mechanical migration,
  behavior repair, dependency updates, or broad formatting without necessity.

## Maintainer rule proposals — required input before adoption

The maintainer may write proposed rules below in any format: fragments,
examples, commands, non-negotiable statements, or questions. Preserve the
original wording. Review each proposal for correctness, conflicts, enforceable
scope, user impact, security impact, and maintenance cost. Record the decision
as **adopt**, **adopt with revision**, **defer**, or **reject**, with a direct
reason and an implementation recommendation in `docs/reviews/rule-decisions.md`.

No proposal is silently ignored. A proposal is not made blocking until its
meaning, enforcement, exceptions, and migration path are explicit.

### Cross-stack communication

#### TEX-ARCH-001 — Privilege separation

React and TypeScript code MUST be treated as an untrusted presentation layer.

The frontend MUST NOT be considered authoritative for:

- filesystem authorization;
- path containment;
- command arguments;
- LaTeX compiler selection;
- process execution;
- allowed URL schemes;
- project-root membership;
- file extension validation;
- write permissions;
- build-output locations.

Every privileged request MUST be revalidated in Rust.

Tauri capabilities restrict which commands and plugin permissions are exposed to each window or webview, but capability authorization does not replace validation inside the command.

#### TEX-ARCH-002 — Least authority

Each Tauri window or webview MUST receive only the capabilities it requires.

Capabilities MUST be divided by responsibility rather than collecting all permissions in one global capability. For example:

```
capabilities/
  editor.json
  pdf-viewer.json
  diagnostics.json
  settings.json
```

A PDF viewer should not automatically have project-write or process-execution authority.

#### TEX-ARCH-003 — Explicit data flow

Data MUST flow through identifiable layers:

```
React component
    ↓
application hook/controller
    ↓
typed frontend gateway
    ↓
Tauri invoke boundary
    ↓
Rust command
    ↓
domain service
    ↓
filesystem/process adapter
```

Components MUST NOT invoke arbitrary Tauri commands directly.

#### TEX-ARCH-004 — Parse at boundaries

All data entering a trust boundary MUST be parsed or validated:

- Tauri command results;
- persisted settings;
- recovery records;
- worker messages;
- URL parameters;
- drag-and-drop paths;
- external process output;
- JSON files;
- plugin responses.

A TypeScript annotation is not runtime validation.

#### TEX-ARCH-005 — Invalid states should be unrepresentable

Use discriminated unions instead of combinations of booleans.

Bad:

```typescript
interface BuildState {
  isBuilding: boolean;
  hasFailed: boolean;
  hasOutput: boolean;
}
```

Preferred:

```typescript
type BuildState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly buildId: BuildId }
  | { readonly kind: "succeeded"; readonly artifact: PdfArtifact }
  | { readonly kind: "failed"; readonly diagnostic: BuildDiagnostic };
```

### TypeScript

#### TEX-TS-001 — No any

Explicit and inferred any MUST NOT be introduced into application code.

Exceptions require:

- a narrow scope;
- a lint suppression on the exact line;
- a justification comment;
- conversion to unknown as soon as possible.

Bad:

```typescript
function processResult(value: any) {}
```

Preferred:

```typescript
function processResult(value: unknown): BuildResult {
  return parseBuildResult(value);
}
```

#### TEX-TS-002 — No unchecked assertions

The following MUST NOT be used without a documented proof:

```typescript
value!
value as SomeType
value as unknown as SomeType
```

Assertions at validation boundaries SHOULD be replaced with parsers, predicates, or assertion functions.

#### TEX-TS-003 — Exhaustive branching

Discriminated unions MUST be exhaustively handled.

```typescript
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}
```

For security-sensitive state machines, use an exhaustive switch and reject unknown states.

#### TEX-TS-004 — Nominal identifiers

Semantically different identifiers and paths MUST NOT all be plain strings.

```typescript
declare const projectIdBrand: unique symbol;

/**
 * Identifies one project within the current application session.
 *
 * This value is opaque. It is not a filesystem path and must not be used
 * to derive one.
 */
export type ProjectId = string & {
  readonly [projectIdBrand]: true;
};
```

Useful branded values include:

- ProjectId
- DocumentId
- BuildId
- CanonicalProjectPath
- ProjectRelativePath
- EditorRevision
- SyncTexPageNumber

Branding does not provide runtime security; Rust still validates path authority.

#### TEX-TS-005 — Read-only by default

Types crossing module boundaries SHOULD use readonly properties and readonly collections.

```typescript
export interface BuildDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly source: ProjectRelativePath | null;
  readonly line: number | null;
}
```

#### TEX-TS-006 — No ambiguous primitives

Functions MUST NOT accept multiple adjacent primitive arguments when their meaning can be confused.

Bad:

```typescript
openLocation(path, 12, 4, true);
```

Preferred:

```typescript
openLocation({
  path,
  line: 12,
  column: 4,
  preserveFocus: true,
});
```

#### TEX-TS-007 — No boolean mode parameters

Boolean parameters that materially change behavior MUST be replaced with named options or unions.

```typescript
type SaveMode = "automatic" | "explicit" | "recovery";
```

#### TEX-TS-008 — Return types on exported functions

Every exported function MUST declare its return type.

Internal callbacks MAY rely on inference where the result is obvious and local.

#### TEX-TS-009 — Promise ownership

Every promise MUST have an explicit owner:

- await it;
- return it;
- aggregate it;
- or intentionally detach it through a named helper.

```typescript
/**
 * Starts work whose result is intentionally not awaited by the caller.
 *
 * Rejections are routed to the application error reporter, preventing an
 * unhandled promise rejection.
 */
function runDetached(task: Promise<void>): void {
  void task.catch(reportUnexpectedError);
}
```

Oxlint’s type-aware support includes high-value rules such as no-floating-promises, no-misused-promises, and await-thenable.

#### TEX-TS-010 — Error values are structured

Application failures MUST NOT be represented only as free-form strings.

```typescript
export type OpenProjectError =
  | { readonly kind: "path-not-found" }
  | { readonly kind: "not-a-directory" }
  | { readonly kind: "permission-denied" }
  | { readonly kind: "unsafe-path"; readonly reason: string }
  | { readonly kind: "unexpected"; readonly incidentId: string };
```

User-visible messages should be derived separately.

### Declarations and file structure

#### Mandatory rule

##### TEX-ORG-001 — Declaration isolation

A file containing React rendering logic MUST NOT declare domain types, enums, command contracts, or reusable interfaces.

A component file MAY import its props type but MUST NOT define it inline.

```
project-tree/
  project-tree.tsx
  project-tree.props.ts
  project-tree.types.ts
  project-tree.constants.ts
  project-tree.test.tsx
  index.ts
```

Example:

```typescript
// project-tree.props.ts

import type { ProjectTreeNode } from "./project-tree.types";

/**
 * Inputs required to render and control the project tree.
 *
 * `onOpenDocument` requests navigation only. It does not authorize filesystem
 * access or imply that the referenced document remains valid.
 */
export interface ProjectTreeProps {
  readonly nodes: readonly ProjectTreeNode[];
  readonly selectedDocumentId: string | null;
  readonly onOpenDocument: (documentId: string) => void;
}
```

```typescript
// project-tree.tsx

import type { ProjectTreeProps } from "./project-tree.props";

/**
 * Renders the navigable document hierarchy for the active project.
 *
 * The component owns presentation and interaction only. Project discovery,
 * path validation, and filesystem access remain outside the render layer.
 */
export function ProjectTree(props: ProjectTreeProps): React.JSX.Element {
  // Render logic only.
}
```

##### TEX-ORG-002 — No generic types.ts dumping grounds

Files named only types.ts, interfaces.ts, models.ts, or enums.ts MUST NOT accumulate unrelated declarations.

A feature-level types.ts MAY exist only when all declarations are private, tightly coupled, and below an agreed size threshold.

##### TEX-ORG-003 — Enums are exceptional

Prefer string-literal unions or as const objects over TypeScript enum.

```typescript
export const diagnosticSeverity = {
  error: "error",
  warning: "warning",
  information: "information",
} as const;

export type DiagnosticSeverity =
  (typeof diagnosticSeverity)[keyof typeof diagnosticSeverity];
```

A TypeScript enum MAY be used only when runtime reverse mapping, interoperability, or a concrete protocol requirement justifies it.

const enum SHOULD NOT be used across module or package boundaries.

### Comments and documentation

#### TEX-DOC-001 — Exported contracts

Every exported:

- type;
- interface;
- class;
- function;
- hook;
- constant with semantic significance;
- Tauri gateway method;
- validation function;

MUST have a documentation comment.

#### TEX-DOC-002 — Security-critical internals

Non-exported code MUST also be documented when it handles:

- path validation;
- symlink behavior;
- process execution;
- command construction;
- URL opening;
- HTML insertion;
- project-root containment;
- autosave ordering;
- recovery consistency;
- revision tracking;
- SyncTeX coordinate conversion;
- PDF origin or asset loading;
- capability assumptions.

#### TEX-DOC-003 — Comment content

A contract comment SHOULD answer the applicable questions:

1. Purpose: What responsibility does this construct have?
2. Semantic meaning: What does the value represent?
3. Invariants: What must always remain true?
4. Trust: Is the input trusted, parsed, canonicalized, or untrusted?
5. Ownership: Who may mutate or dispose of it?
6. Failure: How does failure appear?
7. Side effects: What state or external resource can change?
8. Concurrency: Can calls overlap or complete out of order?
9. Security: What authority does it exercise?
10. Rationale: Why is the non-obvious implementation necessary?

Not every comment needs all ten sections.

**Good type comment**

```typescript
/**
 * A path relative to the canonical root of an opened project.
 *
 * The path uses forward-slash separators and cannot be absolute or contain
 * parent traversal segments. This frontend representation is descriptive,
 * not authoritative; Rust revalidates containment before every filesystem
 * operation.
 */
export type ProjectRelativePath = string & ProjectRelativePathBrand;
```

**Good function comment**

```typescript
/**
 * Requests an atomic save of the current document revision.
 *
 * The supplied revision identifies the editor snapshot that produced
 * `content`. Completion does not imply that a newer revision has not already
 * been queued. The caller must compare the returned revision before updating
 * visible save state.
 *
 * @throws {SaveDocumentError} When the backend rejects the path, revision, or
 * write operation.
 */
export async function saveDocument(
  request: SaveDocumentRequest,
): Promise<SaveDocumentResult> {
  // ...
}
```

**Good rationale comment**

```typescript
// Resolve and verify the parent directory before creating the temporary file.
// Checking only the final destination would leave a race in which an ancestor
// is replaced by a symlink between validation and rename.
```

**Prohibited comments**

```typescript
// Set loading to true.
setLoading(true);

// Loop over documents.
for (const document of documents) {}

// This interface represents props.
interface Props {}
```

Also prohibited:

- roadmap notes without an issue identifier;
- historical narratives better suited to version control;
- commented-out code;
- claims such as “safe” or “secure” without stating the enforced invariant;
- comments that contradict the implementation.

## Phase 0 — inventory and baseline

Before changing production code or tooling, create `docs/reviews/baseline.md`
and `docs/reviews/file-ledger.md`.

The baseline records commit SHA, branch, dirty-worktree state, platform and
tool versions; a complete maintained-file inventory; line counts; current
lint/type/build/test results and durations; bundle and binary sizes; direct and
transitive dependencies; and the current test matrix. It also maps Tauri
commands, plugins, capabilities, CSP, persisted stores, filesystem mutations,
processes, event channels, and trust boundaries.

Measure named fixtures for startup, project open, save, search, build start,
log update, PDF load, and PDF refresh. Record method, build mode, machine, and
date so later performance claims are comparable.

Starting hypotheses to verify, not silently fix:

- the working branch is `master` while CI listens for pushes to `main`;
- Rust has no declared `rust-version` or manifest lint policy;
- ESLint is the current frontend linter and must be replaced by Oxlint;
- CI lacks an explicit RustSec/license/source/dependency-review gate;
- GitHub Actions use mutable version tags rather than full commit SHAs;
- release installation is not frozen with `bun install --frozen-lockfile`;
- no source-review ledger, threat model, benchmark harness, or security
  exception register exists.

Exit gate: the inventory and baseline are reproducible, and no production code
has changed.

## Phase 1 — write and approve the TeX Engineering Standard

Create `docs/engineering-standard.md`. It must be short enough to use during
daily review and strict enough to decide real cases. State requirements in
imperative language. Include a rationale only where it prevents a likely
misreading; do not repeat language syntax or explain obvious rules.

The standard must contain these sections, in this order.

### 1. Cross-stack communication

- Define the boundary: React/TypeScript never accesses the filesystem, starts
  processes, or persists privileged state; Rust never owns webview presentation.
- Require one typed request/response/event contract per IPC operation. Name the
  contract owner, validation point, error code model, cancellation behavior,
  event ordering, and compatibility expectation.
- Prohibit raw backend errors, handles, document content, and unnecessary
  absolute paths from crossing into the webview.
- Require explicit state models for pending, success, cancellation, failure,
  stale completion, and recovery. Preserve user context and last-good PDF.

### 2. TypeScript

- Keep strict TypeScript. Prohibit `any`, `@ts-ignore`, unchecked assertions,
  and non-null assertions as contract bypasses. Receive untrusted data as
  `unknown` and narrow it at the boundary.
- Require named domain types and discriminated unions for state and IPC
  protocols. Do not use boolean clusters or stringly typed state machines.
- Define the approved policy for `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, imports, module resolution, exhaustive
  switching, promises, and runtime validation.

### 3. Declarations and file structure

- Define where domain types, IPC wrappers, hooks, components, styles, tests,
  fixtures, Rust commands, services, models, and error types belong.
- Keep modules cohesive, acyclic where practical, and explicit about ownership.
  Place a declaration beside the domain it describes; do not create ambient or
  catch-all declaration files to avoid an import or type design decision.
- Prohibit unused exports, obsolete compatibility layers, duplicate utilities,
  and files whose name or location obscures their owner. State deletion rules
  and the evidence required before removing apparently unused code.

### 4. Comments and documentation

- Comments document invariants, ownership, security boundaries, externally
  visible contracts, or non-obvious reasoning. They never narrate syntax,
  repeat names, make unowned future promises, or excuse bad code.
- Public or behaviorally significant APIs have concise documentation when the
  contract is not apparent from the type and name. Document errors, cancellation,
  ordering, lifetime, and safety constraints where applicable.
- Documentation must be truthful, versioned when dependent on external tools,
  and updated in the same change as the behavior it describes.

### 5. React

- Components are declarative presentation and state coordination units. Keep
  privileged operations behind typed IPC wrappers.
- Effects synchronize with external systems only; dependencies are complete;
  subscriptions, timers, workers, observers, and async work always clean up.
- Use native semantic controls first. Require keyboard operation, visible focus,
  labels, text alternatives, stable layout, and complete pending/error/empty
  state rendering.
- For editor/PDF workflows, require deliberate ownership of focus, selection,
  scrolling, IME, cancellation, render cost, and state restoration.

### 6. Tauri and webview security

- Commands are thin typed adapters over Rust services. Validate at the boundary
  and apply least privilege to every capability, CSP directive, plugin, path,
  operation, and process.
- Canonicalize and validate paths against the approved project root before every
  read, write, watch, delete, or invocation. Address traversal, symlinks, root
  swaps, TOCTOU, bounds, atomicity, rollback, and error redaction.
- Invoke fixed executables with separately supplied arguments; never construct
  a shell command from strings. Require explicit consent for shell escape or
  project-provided commands.
- Treat watcher events as hints; bound untrusted resource use; do not expose
  document contents or sensitive paths in logs, IPC, or UI errors.

### 7. Oxlint policy

- Oxlint replaces ESLint as TeX’s JavaScript/TypeScript linter. Do not retain
  ESLint as a permanent parallel gate. A temporary compatibility exception must
  be narrow, documented, owned, and time-limited.
- Commit one root `.oxlintrc.json`/`.jsonc` configuration, not an executable
  configuration, unless a documented need requires it. Declare explicit
  ignores, environments, overrides, and rule severities.
- Enable correctness as an error. Evaluate suspicious, performance, style,
  pedantic, and restriction rules individually or in reviewable groups; never
  adopt a broad category merely because it exists.
- Enable and configure the React, TypeScript, import, and JSX accessibility
  coverage required by the project. Type-aware linting is adopted only after
  its runtime, TypeScript compatibility, reliability, and CI cost are measured.
- CI runs Oxlint with warnings denied. Automated fixes are reviewed diffs;
  dangerous or suggestion fixes are never applied blindly. Suppressions name a
  reason and expire or link to a tracked finding.

Exit gate: the maintainer proposal sections have decisions; the standard has
been reviewed against product constraints; each rule has an enforcement method,
exception rule, and migration implication.

## Phase 2 — source register, rule register, and Oxlint migration design

Create these artifacts:

- `docs/reviews/source-register.md`: source URL, owner, version/date, claims
  used, affected area, adopted/rejected decision, and revisit date.
- `docs/reviews/rule-decisions.md`: every maintainer proposal and external rule,
  its original wording, decision, rationale, enforcement, exception path,
  migration work, owner, and review date.
- `docs/reviews/findings.md`: ID, severity, file/line, evidence, failure or
  exploit scenario, standard section, fix, test, owner, branch/PR, and status.
- `docs/reviews/exceptions.md`: exact scope, owner, reason, compensating
  control, finding, and expiry/review date.

Research primary sources before adopting external constraints: Rust API and
lint guidance, Cargo/MSRV policy, Tauri security/capabilities/CSP and enabled
plugin documentation, TypeScript TSConfig, React, CodeMirror, PDF.js, OWASP,
and GitHub Actions supply-chain guidance. Record source versions; do not adopt
blog advice as policy without a stronger source.

For Oxlint, inspect the installed project configuration and run the official
migration tool in a disposable branch or report-only workspace. Build a
rule-compatibility table for every current ESLint rule: native Oxlint mapping,
equivalent Oxlint rule, temporary JS-plugin fallback, or rejected rule. Remove
ESLint packages and configuration only after Oxlint has an equivalent clean
baseline and CI command. Do not treat experimental type-aware support or JS
plugins as a permanent requirement without a documented stability decision.

Exit gate: every proposed and imported rule has a recorded decision; the Oxlint
migration has a complete compatibility and deletion plan.

## Phase 3 — threat model and architecture review

Map assets, actors, boundaries, entry points, validation owners, limits, error
contracts, logging/redaction, tests, and residual risk before line review.
Cover source and recovery drafts, PDFs/build artifacts, logs, workspace state,
project paths, compiler/SyncTeX invocation, IPC, filesystem watchers, temporary
files, CI, dependencies, and release credentials.

Explicitly test traversal, symlink/root-swap races, command injection, unsafe
TeX execution, malformed/oversized input, decompression bombs, stale async
completion, concurrent writes/builds, cancellation, partial writes, permission
loss, event storms, compromised dependencies, and malicious workflow input.

Exit gate: each IPC command and external process maps to a reviewed threat,
validation owner, and test strategy.

## Phase 4 — complete repository audit

Review by dependency order. For every assigned file: read it in full; trace its
callers, callees, serialized contracts, and tests; decide whether its location,
name, ownership, exports, dependencies, and comments remain justified; record
every finding; and mark the ledger. Findings include security, correctness,
user experience, accessibility, maintainability, dead code, duplication,
misplaced files, inappropriate abstractions, and measured or credible
performance risks.

### Wave A — repository boundary

Review manifests, lockfiles, package scripts, Oxlint/TypeScript/Vite
configuration, Tauri configuration/capabilities, build scripts, Actions,
repository instructions, docs, generated-file boundaries, dependency features,
permissions, CSP, credentials, caches, artifacts, and branch triggers.

### Wave B — Rust filesystem and persistence boundary

Review project open/read/write/create/rename/delete/search, recovery,
persistence, PDF reading, and tests. Trace every raw path to its canonicalized
approved object; review file type, extension, size/count/depth limits, Unicode,
atomicity, durability, cleanup, rollback, and redaction.

### Wave C — Rust process, parser, and event boundary

Review build control, diagnostics, SyncTeX, readiness, watchers, and tests.
Check executable selection, PATH/environment trust, arguments, working
directory, cancellation/process trees, concurrency, channels/log bounds, event
ordering, stale IDs, parser complexity, thread lifetime, and child cleanup.

### Wave D — domain and IPC contracts

Review Rust request/response/event types, TypeScript domain types, validation,
and service wrappers. Check schema/versioning, range/nullability/unknown data,
naming parity, error codes, compatibility, and contract tests.

### Wave E — React orchestration

Review application/session hooks, reducers, preferences, pages, and command
coordination. Check state models, request generations, cancellation, stale
closures, cleanup, duplicate operations, focus, save/build races, restoration,
error retention, and render cost.

### Wave F — editor, search, project tree, and UI

Review CodeMirror lifecycle, IME, large documents, caches, search/replace
preview and undo, file references, dialogs, clipboard errors, destructive
operations, semantic HTML, keyboard routes, labels, focus, and truthful states.

### Wave G — PDF and synchronization UI

Review worker/document/page/task disposal, cancellation, memory/canvas bounds,
large PDFs, text-layer safety, search complexity, observers, refresh races,
last-good retention, scroll/selection restoration, SyncTeX coordinates,
keyboard behavior, and announcements.

### Wave H — styles, components, fixtures, and documentation

Review semantic tokens, contrast, forced colors, reduced motion, global CSS,
component contracts, dead assets, fixture provenance/licensing, generated
artifacts, and whether documentation and tests describe actual behavior.

Exit gate for each wave: every file is marked reviewed; critical/high findings
are fixed or explicitly accepted with compensating controls; behavior fixes have
deterministic regression tests where feasible; narrow and full checks pass; and
the diff contains no unrelated formatting or generated output.

## Phase 5 — performance and removal pass

Do not accept code merely because it is cleanly formatted. Use the baseline to
measure and correct bottlenecks in traversal, hashing, search, persistence,
log parsing, lock contention, process supervision, IPC copies, React renders,
CodeMirror reconfiguration, PDF rendering/text extraction, chunk loading,
memory, workers, descriptors, timers, observers, and retained history.

Run a dedicated removal pass after usage tracing and tests. Remove unused
exports, files, dependencies, permissions, assets, configuration, obsolete
fallbacks, duplicated utilities, stale comments, and dead branches. A candidate
is deleted only with search/call-graph evidence and relevant test/build proof;
it is not kept because its intent is uncertain.

Every optimization records before/after data using the same machine, fixture,
build mode, and protocol, plus a correctness regression guard.

## Phase 6 — consolidation and final review

- Re-run all automated gates and the platform matrix from a clean checkout.
- Re-audit dependencies, workflows, permissions, CSP, and generated outputs.
- Confirm every inventory row and finding has a decision and evidence.
- Remove expired exceptions and update architecture, security, privacy,
  limitations, support, and release documentation.
- Perform keyboard, screen-reader, IME, high-contrast, reduced-motion,
  permission-failure, disk-failure, process-kill, large-project, and recovery
  smoke tests.
- Produce `docs/reviews/final-report.md` with standard decisions, findings,
  fixes, removed code/dependencies, residual risks, benchmark results,
  uncompleted work, and release recommendation.

The review is complete only when the final report is approved. A clean lint run
is evidence, not completion.

## Finding severity

| Severity | Definition                                                                                                                                    | Required handling                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Critical | Credible source loss, arbitrary command execution, project-root escape, credential or release compromise                                      | Stop the wave; isolate and fix before other work or release. |
| High     | Recoverable data corruption, broad permission bypass, last-good PDF loss, realistic unsafe race                                               | Fix in the current wave before merge.                        |
| Medium   | Incorrect state/error handling, meaningful accessibility failure, unbounded resource use, misleading UI, significant structure/dead-code risk | Fix in wave or schedule with owner and gate.                 |
| Low      | Limited maintainability, style, documentation, or placement defect                                                                            | Fix when low churn; otherwise record a dedicated cleanup.    |

## Required PR evidence

Every review PR states the files reviewed and finding IDs; relevant standard
sections and rule decisions; failure scenario and fix rationale; tests and
commands run; security, performance, compatibility, accessibility, and
user-context impact; dependency/permission/schema changes; measurements where
applicable; exceptions; residual risks; and confirmation that no generated or
unrelated user changes are included.

## Operating workflow

Follow `AGENTS.md`: inspect repository state before editing; read mandatory
quality and UI requirements; preserve unrelated work; use a cohesive branch for
substantial review work; run narrow then full applicable checks; inspect the
final diff; and publish only with explicit authorization. Update the ledger,
findings, rule decisions, and roadmap in the same PR when their status changes.
