# TeX next roadmap

Status: proposed  
Created: 2026-07-16  
Source of truth: [`project-audit.md`](project-audit.md)

## Objective

Finish the reliability promises in the original product plan before expanding
TeX into optional convenience features. This roadmap includes all currently
known missing or partial requirements. It is ordered by dependency and risk,
not by visual impact.

Every milestone must preserve TeX's local-first boundary, last-known-good PDF,
unsaved source, reading position, focus, and truthful UI. A milestone is not
complete because its happy path works; its failure, cancellation, restoration,
keyboard, and accessibility states must also pass.

## Delivery rules

- Deliver one milestone or independently reviewable slice per branch and pull
  request. Do not combine broad cleanup with product behavior.
- Write or update the state model and tests before adding controls.
- Keep filesystem access, process execution, persistence, and validation in
  Rust. React receives typed state and invokes narrow commands.
- Add no dependency until the standard library and installed dependencies have
  been evaluated and the PR documents why the addition is necessary.
- Do not expose placeholder controls for later roadmap items.
- Update this roadmap and [`project-audit.md`](project-audit.md) when a release
  gate changes status.

## Milestone 0 — release policy and reproducible baseline

Purpose: make support claims and later performance/security findings
reproducible.

Deliverables:

- Decide and publish supported Windows, macOS, and Linux versions.
- Decide the Rust toolchain/MSRV policy, Bun version policy, supported TeX
  distributions, and minimum tested versions of `latexmk`, pdfLaTeX, XeLaTeX,
  LuaLaTeX, and SyncTeX.
- Resolve the repository's `master` working branch versus CI's `main` default
  branch assumption and configure one protected default branch.
- Add a concise privacy statement and known-limitations document.
- Conduct and document the original target-user research: observe 8–12 thesis,
  paper, book/report, and technical-document authors compiling and correcting
  real projects; convert recurring friction into evidence-backed issues without
  importing private project content.
- Record reference machines, fixture revisions, release/debug build modes, and
  p50/p95/p99 measurement procedures.
- Add dedicated BibLaTeX/biber, custom-class, large-project, invalid-PDF,
  file-watch storm, and output-directory fixtures.

Exit gate:

- A clean checkout can reproduce all current checks using documented tool
  versions, and support/benchmark claims name their environment.

## Milestone 1 — complete workspace restoration

Purpose: reopen the workbench exactly where the user left it.

Deliverables:

- Version the persisted workspace schema and define migrations or safe fallback
  for each schema change.
- Persist PDF pane open state and width.
- Persist build panel open state and height.
- Persist the selected project-sidebar tab and build-panel tab.
- Persist the selected build profile per project.
- Restore geometry only after validating it against the current window size;
  clamp invalid values and report partial restoration without looping.
- Preserve editor and PDF focus when returning from Settings.
- Add missing-path, smaller-window, schema-upgrade, and corrupted-state tests.

Exit gate:

- Tabs, root, source cursor/scroll, split geometry, open panels, PDF state, and
  focus survive restart on every supported platform or produce a specific safe
  restoration notice.

## Milestone 2 — resilient filesystem observation and watch mode

Purpose: replace polling-only awareness with a controlled project event model
and enable safe automatic builds.

Deliverables:

- Add a Rust-owned watcher whose events are treated as hints and followed by
  re-stat/re-read validation.
- Coalesce bursts, debounce edits, and model create/modify/remove/rename
  explicitly.
- Ignore `.git`, caches, configured output directories, auxiliary files, and
  TeX-generated loops.
- Reconcile project tree changes without discarding selected source or PDF.
- Show visible watch states: Off, Starting, Watching, Build queued, Building,
  Stopping, Error, and Paused for unsafe configuration.
- Never watch-run custom commands or `--shell-escape` without explicit,
  persisted project consent.
- Support Stop and manual Build while preserving one build controller per
  project.
- Test rename/remove races, atomic-save editor patterns, event storms, output
  loops, unavailable watches, and cancellation.

Exit gate:

- Repeated source saves produce one intended build, generated output produces
  no loop, and every watch transition remains visible and cancellable.

## Milestone 3 — project build configuration

Purpose: support real projects without weakening the process boundary.

Deliverables:

- Design a documented, versioned project configuration format and decide
  whether it lives outside the source tree by default or in an explicitly
  ignorable project file.
- Configure root, engine/profile, output directory, bibliography tool,
  generated-directory exclusions, and environment-relevant settings.
- Model custom commands as executable plus argument arrays; never as a shell
  string.
- Canonicalize executable, root, working directory, output, and generated paths
  before execution.
- Preview the exact invocation and impact before first use or changed consent.
- Add an explicit `--shell-escape` trust warning and separate consent record.
- Detect configured root/build metadata as root-selection evidence.
- Report executable and engine versions for terminal reproducibility.

Exit gate:

- Safe standard and custom profiles build fixtures without path escape, shell
  injection, hidden privilege expansion, or ambiguous output ownership.

## Milestone 4 — complete build and diagnostic commands

Purpose: make every build outcome understandable and keyboard reachable.

Deliverables:

- Add explicit Build and view semantics without moving PDF position unless the
  user requested navigation.
- Add conservative Clean auxiliary files with a previewed, validated file list
  and no source/PDF deletion.
- Add Reveal output using a validated project-local path and platform-native
  shell/open integration with least privilege.
- Add Go to first error, Next diagnostic, Previous diagnostic, Copy diagnostic,
  and Show corresponding log context to the command palette and keymap.
- Improve TeX warning/error classification while preserving raw output and
  labeling uncertain mappings.
- Map output-directory and generated-file locations deliberately.
- Decide whether bounded build history must survive restart; if yes, persist it
  outside project source with retention and redaction rules.
- Announce build completion and counts without focus theft.

Exit gate:

- A keyboard-only user can build, stop, inspect any run, navigate every mapped
  diagnostic, copy evidence, clean safely, and reveal output.

## Milestone 5 — PDF replacement and SyncTeX hardening

Purpose: satisfy the complete reading-context contract under repeated updates.

Deliverables:

- Capture and restore focus, selected text where technically possible, page,
  normalized logical position, zoom, rotation, layout, and outline state.
- Track active scrolling/selecting and defer document swaps until interaction
  ends, or offer a quiet explicit update action.
- Distinguish in-app build updates from external PDF rebuilds.
- Add request generations or cancellation for PDF load, search, outline, and
  both SyncTeX directions so stale responses cannot move current state.
- Announce successful replacement and clamped-page fallback politely.
- Test locked, partial, malformed, oversized, removed, replaced, and rapidly
  changing PDFs while always retaining the last readable document.
- Add automated 100-success and 100-failure update sequences on a multi-file
  SyncTeX fixture.

Exit gate:

- The stress suite has zero page-one, zoom, focus, stale-navigation, blank-PDF,
  or lost-last-good regressions.

## Milestone 6 — safe project operations

Purpose: make filesystem experimentation recoverable.

Deliverables:

- Replace permanent deletion with OS trash or a recoverable local trash design
  where supported.
- State and test fallback behavior where trash is unavailable.
- Add undo for supported delete and rename operations with conflict detection.
- Replace blocking browser prompts with accessible, explicit dialogs.
- Add command-palette routes for create, rename, delete, root selection, and
  other primary project operations.
- Add configurable generated/output exclusions to tree and search.

Exit gate:

- Supported operations are keyboard complete, path-safe, conflict-aware, and
  recoverable without suggesting an undo that cannot work.

## Milestone 7 — editing and navigation completion

Purpose: close remaining core editing gaps without broadening into a generic IDE.

Deliverables:

- Add explicit matching/navigation for LaTeX environment pairs.
- Design user-configurable snippets with local persistence and validation.
- Complete command coverage and platform-correct discoverable shortcuts.
- Add deterministic keyboard navigation through project-search results.
- Audit large-file behavior, IME composition, editor state retention, malformed
  LaTeX degradation, and hover/reference cancellation.
- Add bibliography assistance only after it has a scoped workflow and does not
  become a reference manager.

Exit gate:

- Editing, search, replace, reference navigation, and save/recovery pass the
  fixture suite with keyboard, IME, and screen-reader smoke coverage.

## Milestone 8 — qualification, security, and release gate

Purpose: convert implementation confidence into release evidence.

Deliverables:

- Execute [`code-review-plan.md`](code-review-plan.md) in bounded review waves.
- Measure startup, keystroke, file-switch, search, build-start, log-update, and
  PDF-replacement latency against published fixtures and percentile budgets.
- Run Windows/macOS/Linux keyboard, screen-reader, high-contrast, reduced-motion,
  scaling, and permission-failure checks.
- Add dependency vulnerability, license/source, secret, and workflow security
  gates appropriate to the repository's visibility and available GitHub plan.
- Publish supported versions, test conditions, limitations, privacy behavior,
  release recovery procedure, and security-reporting route.

Exit gate:

- Protected-branch checks pass on every supported platform, no release-blocking
  finding remains open, and every product claim links to reproducible evidence.

## Deferred until reliability gates pass

- Git-aware status beyond a minimal truthful dirty/clean indicator.
- Rich bibliography workflows.
- Import/export conveniences.
- Additional build presets.
- Any account, collaboration, cloud, telemetry, upload, or AI capability.

Each deferred feature requires a separate product decision and must identify
which LaTeX editing friction it removes.
