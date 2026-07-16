# Comprehensive code review and hardening plan

Status: proposed  
Created: 2026-07-16  
Scope: every maintained source, configuration, workflow, test, fixture contract,
and documentation file in TeX

## Goal

Perform a source-backed, line-by-line review that improves security,
correctness, performance, maintainability, accessibility, and consistency
without turning the exercise into a cosmetic rewrite. The review must establish
rules from authoritative sources, measure the current baseline, record every
finding, and deliver fixes in small branches and pull requests with regression
evidence.

“Line by line” means every maintained file is assigned to a review wave and
marked reviewed in a ledger. It does not mean changing every line. Unnecessary
churn makes security review harder and must be avoided.

## Non-negotiable review principles

- Evidence before rules: research current upstream guidance and record version,
  retrieval date, relevance, and adopted/rejected decision.
- Correctness and security before style; measured performance before
  optimization.
- Do not enable whole lint groups blindly. In particular, Clippy documents that
  its complete `restriction` group should not be enabled because individual
  lints can be inappropriate or contradictory.
- Baseline first: capture test, lint, dependency, size, timing, and architecture
  state before changing configuration.
- One concern per branch/PR. Separate rule adoption, mechanical cleanup,
  behavior fixes, dependency changes, and performance work.
- Every behavior defect receives a deterministic regression test where possible.
- Every suppression needs the narrowest scope, a `reason`, and a linked review
  finding. Suppressions without rationale are defects.
- Preserve local-first boundaries, user work, focus, PDF context, last-known-good
  output, and raw diagnostic evidence throughout the review.

## Authoritative research dossier

Before changing rules, create `docs/reviews/source-register.md` with one entry
per source: URL, owner, version/date, claims used, affected repository area,
decision, and revisit date. Prefer standards and primary maintainers over blog
posts. At minimum, review these sources and their directly relevant subpages:

### Rust language, API, Cargo, and linting

- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) — naming,
  type safety, predictability, documentation, debug representation, and API
  evolution checklist.
- [Clippy documentation](https://doc.rust-lang.org/stable/clippy/) and
  [configuration](https://doc.rust-lang.org/stable/clippy/configuration.html) —
  lint groups, lint stability, MSRV behavior, configuration, and scoped allows.
- [rustc lint levels](https://doc.rust-lang.org/stable/rustc/lints/levels.html)
  and [lint groups](https://doc.rust-lang.org/stable/rustc/lints/groups.html) —
  `allow`/`warn`/`deny`/`forbid`, reasons, future compatibility, and unused code.
- [Cargo lint configuration](https://doc.rust-lang.org/cargo/reference/lints.html),
  [Rust version policy](https://doc.rust-lang.org/cargo/reference/rust-version.html),
  [profiles](https://doc.rust-lang.org/cargo/reference/profiles.html), and
  dependency/feature documentation.
- [RustSec](https://rustsec.org/) and
  [`cargo-audit`](https://github.com/rustsec/rustsec/tree/main/cargo-audit) —
  lockfile vulnerability review, advisory exceptions, and CI operation.
- Evaluate `cargo-deny` from its maintained documentation for advisories,
  licenses, sources, bans, and duplicate dependencies. Do not add it until a
  policy file and exception ownership are designed.

### Tauri and desktop trust boundaries

- [Tauri security model](https://v2.tauri.app/security/),
  [capabilities](https://v2.tauri.app/security/capabilities/), and
  [Content Security Policy](https://v2.tauri.app/security/csp/) — command
  exposure, window permissions, CSP, remote content, IPC, and least privilege.
- Review official documentation for every enabled Tauri plugin and every future
  opener/filesystem/process capability before changing permissions.

### TypeScript, React, linting, and webview safety

- [TypeScript TSConfig reference](https://www.typescriptlang.org/tsconfig/) —
  strictness options including `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `useUnknownInCatchVariables`.
- [typescript-eslint shared configurations](https://typescript-eslint.io/users/configs/)
  and rule documentation — evaluate typed recommended/strict/stylistic rules
  individually and pin decisions because strict presets may change outside
  major releases.
- [ESLint configuration and rules](https://eslint.org/docs/latest/) — flat
  configuration, suppression reporting, and unused disable directives.
- Official React documentation for effects, external-store synchronization,
  state preservation, concurrency, accessibility, and performance measurement.
- Official CodeMirror and PDF.js contracts for cancellation, disposal,
  accessibility, large documents, and worker boundaries.

### Security standards and supply chain

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
  as a control catalog, adapted to a local desktop/webview threat model. Record
  versioned requirement IDs for adopted controls, especially validation,
  command execution, file handling, error handling, logging, and stored data.
- Relevant OWASP cheat sheets for input validation, path traversal, OS command
  injection, logging, file handling, and supply chain security.
- [GitHub supply-chain security](https://docs.github.com/en/code-security/concepts/supply-chain-security/supply-chain-security),
  Actions [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use),
  Dependabot, dependency review, CodeQL availability, secret scanning, and
  artifact provenance.

### Collaboration and review workflow

- [GitHub pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests),
  protected branches/rulesets, required checks, CODEOWNERS, PR templates, and
  draft PRs.
- Record repository-plan limitations before requiring paid GitHub features;
  define a local or CI fallback for unavailable controls.

## Phase 0 — freeze scope and capture the baseline

Create `docs/reviews/baseline.md` containing:

- commit SHA, branch, dirty-worktree state, OS, architecture, Rust/Bun/Node/TeX
  versions, build mode, and date;
- source/config/test line counts and a complete maintained-file inventory;
- current lint/type/build/test outputs and durations;
- release binary/bundle sizes and Vite chunk report;
- current Tauri commands, plugins, permissions, CSP directives, process
  executables, persisted stores, filesystem mutations, and event channels;
- direct/transitive dependency trees, duplicate versions, licenses, sources,
  known advisories, and abandoned/unmaintained advisories;
- current test matrix and uncovered product invariants;
- baseline startup, project-open, search, save, build-start, log-update, PDF-load,
  and PDF-refresh measurements on named fixtures.

Starting hypotheses to verify, not silently “fix” in the baseline PR:

- the working branch is `master` while CI listens for pushes to `main`;
- Rust has no declared `rust-version` or manifest lint policy;
- ESLint uses recommended syntax rules but not type-aware strict rules;
- CI has no explicit RustSec/license/source/dependency-review gate;
- GitHub Actions use mutable version tags rather than full commit SHAs;
- release installation is not frozen with `bun install --frozen-lockfile`;
- there is no source-review ledger, threat model, benchmark harness, or security
  exception register.

Exit gate: baseline commands are reproducible and no production code changed.

## Phase 1 — establish the rule adoption process

Create these review artifacts:

- `docs/reviews/source-register.md` — external authority and version register.
- `docs/reviews/rules.md` — accepted repository rules with rationale, examples,
  enforcement mechanism, severity, and exception policy.
- `docs/reviews/findings.md` — finding ID, severity, CWE/ASVS mapping where
  relevant, file/line, evidence, exploit/failure scenario, fix, test, owner,
  branch/PR, and status.
- `docs/reviews/file-ledger.md` — every maintained file with reviewer, review
  wave, security/performance/style status, findings, test evidence, and date.
- `docs/reviews/exceptions.md` — temporary lint/advisory/policy exceptions with
  scope, owner, reason, compensating control, and expiry/review date.

Rule adoption sequence:

1. Run a candidate rule in report-only mode.
2. Classify findings as defect, beneficial cleanup, intentional pattern, false
   positive, or not applicable.
3. Estimate churn and identify conflicts with generated/vendor code.
4. Adopt only rules with a documented repository benefit.
5. Fix existing findings in a dedicated branch before making the rule blocking,
   unless it is a critical correctness/security gate.
6. Add narrow exceptions with reasons; never blanket-disable a useful rule.
7. Make the rule blocking in CI and update `AGENTS.md` in the same PR.

Exit gate: every blocking rule has rationale, clean baseline, and CI coverage.

## Phase 2 — threat model and architecture review

Map assets, actors, trust boundaries, entry points, and failure modes before the
line review:

- assets: source, recovery drafts, PDF/build artifacts, logs, workspace state,
  project paths, configuration, user focus/context, release signing credentials;
- untrusted inputs: project trees, symlinks, file contents, LaTeX roots, PDFs,
  SyncTeX output, compiler output, persisted JSON, dialog results, IPC payloads,
  filesystem events, environment/PATH, command arguments, dependency artifacts;
- boundaries: React/webview ↔ Tauri IPC, project root ↔ outside filesystem,
  application ↔ compiler/SyncTeX, temporary files ↔ committed state, CI ↔
  third-party Actions, release workflow ↔ GitHub token;
- abuse/failure cases: traversal, symlink swaps/TOCTOU, command injection,
  unsafe TeX execution, oversized/decompression-bomb inputs, malformed UTF-8,
  log/content disclosure, stale async completion, concurrent writes/builds,
  cancellation races, partial disk writes, permission loss, event storms,
  compromised dependency or Action, and malicious PR workflow input.

For each boundary, document validation owner, size/time limits, canonicalization
strategy, race assumptions, error contract, logging/redaction, tests, and
residual risk. Tauri commands should become thin adapters where business logic
is currently embedded.

Exit gate: every IPC command and external process maps to a reviewed threat and
test strategy.

## Phase 3 — configure review tooling in isolated PRs

Evaluate and, where justified, introduce:

### Rust/Cargo

- `rust-toolchain.toml` and `package.rust-version` matching the support policy;
- `[lints.rust]` and `[lints.clippy]` in `Cargo.toml`, starting from current
  defaults and selected pedantic/restriction lints, not entire optional groups;
- likely candidates for explicit review: `unsafe_code`, `unused_must_use`,
  `unexpected_cfgs`, `missing_debug_implementations`, `unwrap_used`,
  `expect_used`, `panic`, `todo`, `unimplemented`, `dbg_macro`, lossy casts,
  suspicious arithmetic, redundant clones, large futures, and inefficient
  collections;
- `cargo audit` and, if policy is ready, `cargo deny check advisories bans
  licenses sources`;
- rustdoc checks for public contracts and documented errors/panics where
  relevant;
- optional future tools only after value/risk review: `cargo-semver-checks`,
  `cargo-machete`, `cargo-udeps`, `cargo-nextest`, sanitizer/Miri runs for
  applicable isolated code, and platform-specific profiling.

### TypeScript/React

- typed `typescript-eslint` recommended/strict rules in report-only mode first;
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and other strict
  TSConfig options one at a time with migration findings;
- rules for floating promises, unsafe arguments/returns/assignments,
  unnecessary assertions, exhaustive switches, consistent type imports,
  unused disable directives, and React effect correctness;
- tests for async cancellation, stale closures, event cleanup, focus, keyboard
  operation, and state-machine exhaustiveness;
- bundle analysis with explicit budgets for initial and lazy workspace chunks.

### CI and repository controls

- frozen installs in CI and release jobs;
- minimal job permissions and explicit permissions on every workflow;
- full-length SHA pinning for third-party Actions, with a controlled update
  mechanism and human-readable version comments;
- protected default branch, required current-SHA checks, review requirement,
  PR template, CODEOWNERS where useful, and merge strategy;
- RustSec/Dependabot for Cargo, Bun/npm dependency monitoring, dependency review
  where available, CodeQL where supported, and secret scanning/push protection;
- release artifact integrity, provenance/signing design, reproducible metadata,
  and rollback procedure.

Each tooling PR must contain only configuration plus the mechanical fixes needed
to establish a clean baseline.

## Phase 4 — line-by-line review waves

Review in dependency order. For each file, read the complete file and its tests,
trace callers/callees and serialized contracts, add findings to the ledger, fix
only the current wave, and rerun narrow plus full gates.

### Wave A — manifests, capabilities, and workflows

Files: `Cargo.toml`, Cargo/Bun lockfiles, `package.json`, TypeScript/ESLint/Vite
configuration, Tauri configuration/capabilities, build scripts, GitHub Actions,
and repository instructions.

Review: dependency necessity/features, versions/MSRV, scripts, generated-file
boundaries, CSP, permissions, dev/release differences, action pinning,
credentials, artifacts, caches, and branch triggers.

### Wave B — Rust path and filesystem boundary

Files: project open/read/write/create/rename/delete/search, persistence, PDF
reading, recovery, and related tests.

Review every path from raw IPC string to canonical object. Check absolute and
parent components, symlinks, root replacement races, file type, extension,
size/count/depth limits, Unicode, atomicity, durability, permissions, cleanup,
error redaction, and rollback after multi-file operations.

### Wave C — Rust process and event boundary

Files: build controller, diagnostics, SyncTeX, readiness, future watcher, and
related tests.

Review executable selection, PATH trust, argument separation, environment,
working directory, inherited handles, process-tree cancellation, concurrent
requests, lock poisoning, thread lifecycle, bounded channels/logs, event
ordering, stale run IDs, timestamps, parser complexity, and child cleanup.

### Wave D — serialized domain and IPC contracts

Files: Rust request/response/event types, TypeScript domain types, and service
wrappers.

Review schema versioning, enum exhaustiveness, integer/float ranges, nullability,
unknown-data validation, naming parity, error codes, backward compatibility,
and contract tests. Consider generated bindings only after evaluating build
complexity and trust implications.

### Wave E — React session and persistence orchestration

Files: app/session hooks, build hook/reducer, preferences, pages, and command
coordination.

Review explicit state machines, async request generations/cancellation, stale
closures, timer/event cleanup, duplicate operations, focus ownership, save/build
races, external changes, restoration, error retention, and render cost. Replace
boolean clusters only where a discriminated model materially prevents invalid
states.

### Wave F — editor, search, tree, and project UI

Review CodeMirror lifecycle/state caches, IME, large content, file references,
hover async work, search/replace preview and undo, keyboard routes, path display,
clipboard errors, dialogs, destructive operations, semantic HTML, labels, focus,
and truthful disabled states.

### Wave G — PDF renderer and synchronization UI

Review worker lifecycle, document/page/task disposal, cancellation, memory and
canvas bounds, huge page/document behavior, text-layer safety, search
complexity, observers, refresh races, last-good retention, focus/selection,
scroll restoration, SyncTeX coordinates, keyboard behavior, and announcements.

### Wave H — styles, components, docs, and fixtures

Review semantic tokens, contrast, forced colors, reduced motion, global CSS,
component modifications versus upstream shadcn contracts, dead assets, truthful
documentation, fixture licensing/provenance, generated artifacts, and whether
tests actually enforce documented outcomes.

Exit gate for each wave:

- every assigned file is marked reviewed;
- all critical/high findings in scope are fixed or explicitly accepted by the
  user with compensating controls;
- behavior changes have regression tests;
- narrow and full checks pass;
- the PR contains no unrelated formatting or generated output.

## Phase 5 — performance review

Do not infer performance from code appearance. Establish traces/benchmarks and
optimize measured bottlenecks:

- Rust: project traversal, hashing/revisions, search/replace allocations,
  persistence serialization, log parsing, lock duration/contention, process
  supervision, event throughput, and PDF IPC copies;
- React: render counts, large tree/search lists, reducer/event batching, session
  object churn, CodeMirror reconfiguration, PDF page rendering, text extraction,
  search scans, and lazy chunk boundaries;
- resource limits: memory under large PDFs/logs/projects, worker/task cleanup,
  file descriptors, threads, timers, observers, retained build history, editor
  state cache, and recovery/replace-history retention;
- build/release: frontend chunks, PDF worker, Rust binary size, compile times,
  LTO settings, and startup cost.

Every optimization PR must include before/after data on the same machine,
fixture, build mode, and run protocol, plus a correctness regression guard.

## Phase 6 — consolidation and final review

- Re-run every automated gate and platform matrix from a clean checkout.
- Re-audit dependencies and workflows after all changes.
- Confirm every file-ledger row and finding has a status and evidence.
- Remove expired exceptions and ensure remaining exceptions name owners/dates.
- Perform keyboard, screen-reader, IME, high-contrast, reduced-motion,
  permission-failure, disk-failure, process-kill, and recovery smoke tests.
- Update architecture, support, privacy, limitations, security, and release docs.
- Produce `docs/reviews/final-report.md` with changes, residual risks, benchmark
  results, uncompleted work, and exact release recommendation.

The review is complete only when the final report is approved; a clean lint run
alone is not completion.

## Finding severity and handling

| Severity | Definition | Required handling |
| --- | --- | --- |
| Critical | Credible source loss, arbitrary command execution, project-root escape, credential/release compromise | Stop the wave; isolate and fix before other work or release. |
| High | Recoverable data corruption, broad permission bypass, last-good PDF loss, unsafe race with realistic trigger | Fix in current wave before merge. |
| Medium | Incorrect state/error handling, significant accessibility failure, unbounded resource use, misleading UI | Fix in wave or open a scheduled issue with owner and gate. |
| Low | Local maintainability/style issue with limited behavior risk | Fix only when low churn; otherwise record for a cleanup PR. |

## Required PR evidence

Every review PR must state:

- finding IDs and files reviewed;
- threat/failure scenario and why the fix is correct;
- external rules adopted or rejected;
- tests added and commands run;
- security, performance, compatibility, accessibility, and user-context impact;
- dependency/permission/schema changes;
- before/after measurements for performance work;
- residual risks, exceptions, and follow-up issues;
- confirmation that generated output and unrelated user changes are absent.

## AGENTS.md workflow to enforce

The repository-level `AGENTS.md` should require the following operating method
for every substantial implementation or review wave:

1. Read mandatory docs and inspect `git status`, current branch, remote, recent
   history, and overlapping user changes before editing.
2. Never perform review mutations directly on the protected default branch.
   If the worktree is clean, create a descriptive branch such as
   `review/rust-filesystem-boundary` or `feature/workspace-persistence`. If it is
   dirty, preserve the user's work and ask before switching or branching when
   ownership is ambiguous.
3. Record scope, invariants, risks, and verification in a plan. Update the file
   ledger for review work.
4. Make cohesive changes; do not mix unrelated cleanup, dependency updates, or
   formatting. Use the smallest safe dependency and permission scope.
5. Run narrow checks while working, then the full applicable repository gates.
6. Inspect the final diff, status, ignored/generated files, dependency/permission
   changes, and accidental secret/path/content exposure.
7. Commit intentionally with a message describing one logical change. Do not
   amend, rebase, force-push, or rewrite user commits without explicit approval.
8. Push and open a draft PR only when the user requested publishing or invoked
   this workflow for delivery. The PR must use the evidence template above.
9. Monitor CI, address failures from the branch, keep the PR draft until all
   required checks and review findings pass, then request review. Never merge,
   close, or delete the branch unless the user explicitly authorizes it.
10. Update roadmap/audit/review ledgers in the same PR when status changes.

This workflow is also summarized directly in the repository `AGENTS.md` so
future agents encounter it before modifying source.
