# Phase 0 foundation

Phase 0 establishes contracts and proof points before TeX is allowed to open user projects or execute a compiler. The application intentionally exposes no filesystem or shell capability in this phase.

## Decisions made

| Area | Decision |
| --- | --- |
| Product boundary | Local-first desktop application; source, PDFs, paths, and logs remain on-device by default. |
| UI boundary | React renders typed state only. Rust owns filesystem, process, persistence, and validation concerns. |
| Permission boundary | The Tauri capability set is limited to core and logging. Filesystem, dialog, and shell permissions are deferred until their project-level scopes are designed and tested. |
| Security baseline | Content Security Policy is enabled for production and development. External link opening is not implemented because the Phase 0 UI has no external-navigation need. |
| Build policy | No build execution or project-provided command is available before command validation, consent, and output isolation are implemented. |
| Persistence policy | Project metadata must not modify a source tree by default. The storage location and recovery format require a dedicated design before Phase 1. |
| Renderer gate | A PDF renderer is acceptable only if it supports keyboard operation, text selection, find, outline, and state restoration across atomic PDF updates. |

## Required technical spikes

These are implementation gates, not user-facing features. Each must use the fixtures below and document test-machine/engine versions and percentile timings.

1. **Root selection:** detect `\\documentclass`, configured roots, magic comments, and build metadata; report multiple candidates instead of selecting silently. The initial `\\documentclass` and magic-comment spike is implemented as an unexposed Rust service and fixture test; configured roots/build metadata are Phase 1 work.
2. **Atomic PDF replacement:** retain last-good PDF while a replacement is incomplete, locked, invalid, or paired with a failed build; restore page, normalized page position, zoom, layout, and focus after success.
3. **Diagnostic extraction:** run a controlled fixture build, retain raw logs, expose the first actionable diagnostic, and map it to a source file/line without hiding uncertainty.
4. **SyncTeX:** enable and query forward/inverse navigation through the supported SyncTeX interface; report unavailable or stale data without changing editor position unexpectedly.
5. **File-watch resilience:** debounce events, ignore output directories, and handle create/modify/remove/rename sequences without rebuild loops.
6. **Recovery:** simulate termination mid-edit, a write error, and an external edit; prove that user content remains recoverable and that no external change is silently overwritten.

## Fixture suite

Maintain non-sensitive, versioned fixtures under `tests/fixtures/` when Phase 1 project access begins:

- `article`: basic single-file PDFLaTeX document.
- `thesis`: multi-file document with nested inputs, bibliography, images, and non-ASCII paths.
- `custom-class`: custom class and macro-heavy document.
- `failure`: deliberate syntax and bibliography failures with known diagnostics.
- `large`: a representative large project used for indexing, search, build, and viewer budgets.

Fixtures must be deterministic, redistributable, and include expected root, command profile, output, diagnostics, and SyncTeX behavior. Do not use a real user's project as a benchmark fixture.

## Performance protocol

Report cold and warm startup, keystroke latency, project-open time, project-search latency, build-start time, and PDF update time as p50/p95/p99 values. Record hardware, operating system, app build mode, TeX distribution/engine, fixture revision, and run count. The 300 ms startup target is not accepted until this protocol is in place.

## Exit criteria

- The Phase 0 shell builds with no user project access enabled.
- Rust capability flags demonstrate that project and build access remain disabled.
- CI runs frontend lint/type/build and Rust format/clippy/test checks.
- The technical spikes and fixture protocol are ready before Phase 1 begins.
