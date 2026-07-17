# Engineering review baseline

Baseline revision: 1  
Captured: 2026-07-16  
Baseline commit: `eb95280770d2a7b15703f4ebbd3af6ca7e4af767`  
Branch: `agent/engineering-hardening`  
Worktree: clean before baseline commands

## Purpose and reproducibility

This record describes the repository before engineering-standard adoption,
lint migration, or production hardening. It is evidence, not an assertion that
the current behavior is acceptable. Reproduce counts from the baseline commit
with `git ls-files`, `wc`, `rg`, `bun pm ls --all`, and `cargo tree --locked`.
Lockfiles are the authoritative dependency snapshots.

Generated directories (`dist`, `node_modules`, and `src-tauri/target`) are not
maintained files and are excluded from the file ledger. Generated build output
was inspected only to establish size and command-pruning evidence.

## Environment

| Field | Baseline value |
| --- | --- |
| Operating system | Arch Linux, kernel `7.0.10-arch1-1`, x86_64 |
| Machine | `arch-linux-x86_64-01`; hardware details are maintained in `docs/benchmarks/reference-machines.md` |
| System Rust | `rustc 1.95.0`, `cargo 1.95.0` |
| Declared/CI Rust | `1.88.0` in `rust-toolchain.toml`, `Cargo.toml`, and CI |
| Bun | `1.3.9` |
| Node | `22.22.2` (informational; Bun owns repository scripts) |
| TypeScript | `6.0.3` resolved |
| React | `19.2.7` resolved |
| Tauri | Rust `2.11.5`; JavaScript API `2.11.1`; CLI `2.11.4` resolved |
| TeX | TeX Live 2026; pdfTeX `1.40.29`; latexmk `4.87` |
| Benchmark readiness | WebView version, active storage/display, and power mode not recorded; no release performance claim is permitted |

The host uses distribution Rust rather than rustup, so local checks ran on
1.95.0. CI remains the authoritative MSRV gate at 1.88.0. A later workflow
review must decide whether local MSRV verification needs a repository command.

## Maintained inventory

The baseline contains 224 tracked files and 31,138 tracked lines totaling
1,583,248 bytes. The detailed assignment is in `file-ledger.md`.

| Area | Files | Lines | Review owner |
| --- | ---: | ---: | --- |
| Frontend under `src/` | 71 | 13,491 | Waves D–H |
| Rust under `src-tauri/src/` | 18 | 5,613 | Waves B–D |
| Fixtures under `tests/fixtures/` | 77 | 1,747 | Wave H |
| Markdown documentation | 22 | 2,439 | Waves A and H |
| Repository/configuration files | 16 | recorded per ledger | Wave A |
| Binary and visual assets | 24 | byte-reviewed/licence-reviewed | Wave H |

The categories overlap where a file is both configuration and documentation;
the ledger assigns exactly one primary wave and permits secondary reviewers.

## Automated gate baseline

Commands were run from the repository root against the clean baseline. All
passed. Durations are single warm diagnostic samples and are not benchmarks.

| Gate | Result | Evidence |
| --- | --- | --- |
| `bun run lint` | pass | ESLint 10.7.0; 3.867 s |
| `bun run typecheck` | pass | TypeScript 6.0.3; 0.108 s |
| `bun run test` | pass | 12 files, 44 tests; 0.784 s shell duration |
| `bun run build` | pass with chunk warning | Vite 8.1.4; 3.907 s shell duration |
| `cargo fmt --check` | pass | 0.076 s |
| `cargo clippy --locked --all-targets -- -D warnings` | pass | 1.418 s warm duration |
| `cargo test --locked` | pass | 52 tests; 16.829 s shell duration |
| `bun run tauri build --no-bundle` | pass | first release build; 151.960 s |

The Vite build reports `project-workspace-page` above its 500 kB warning
threshold. This is a measurement target, not proof of a user-visible defect.

## Artifact baseline

| Artifact | Raw size | Gzip where reported |
| --- | ---: | ---: |
| Complete frontend `dist/` | 3.2 MB allocated | not applicable |
| Application entry JavaScript | 296.03 kB | 92.02 kB |
| Workspace JavaScript | 1,187.01 kB | 368.98 kB |
| PDF.js worker | 1,255.06 kB | not reported |
| Application CSS | 91.69 kB | 15.56 kB |
| Workspace CSS | 231.88 kB | 41.93 kB |
| Linux release executable, no bundle | 6,093,984 bytes | not applicable |

The release build removed unused generated Tauri core, window, webview, and
plugin-filesystem commands. This build-time pruning does not replace capability
or command-level authorization review.

## Dependency baseline

| Ecosystem | Direct declarations | Lockfile resolution |
| --- | ---: | ---: |
| Frontend runtime | 25 | 572 `bun.lock` package entries across all frontend dependency classes |
| Frontend development | 16 | included above |
| Rust runtime | 9 | 454 Cargo packages total |
| Rust build | 1 | included above |

Frontend linting currently requires ESLint, TypeScript ESLint, React Hooks,
React Refresh, and globals packages. Oxlint is not installed. Rust has no
manifest lint table, advisory gate, source/license policy, or committed
dependency-policy configuration. Dependency advisories and licences have not
yet been adjudicated; absence of a gate is a Phase 4 Wave A finding candidate.

## Privileged architecture

### Webview and capabilities

One `main` window receives `core:default`, `dialog:default`, and `log:default`
through `src-tauri/capabilities/default.json`. The frontend uses the dialog
plugin to select a project directory. No frontend filesystem or shell plugin
permission is declared. Tauri global API injection is enabled by
`withGlobalTauri`, although application code imports the module API.

The production CSP is:

```text
default-src 'self'; connect-src ipc: http://ipc.localhost;
img-src 'self' asset: http://asset.localhost;
style-src 'self' 'unsafe-inline'; script-src 'self'
```

Development additionally permits the Vite HTTP and WebSocket origins. No
remote application content is configured.

### IPC and events

Rust registers 37 custom Tauri commands. They cover readiness, project open and
entry mutation, startup/preferences/workspace persistence, build
configuration, source/PDF/recovery I/O, project search/replace/undo, build
preview/control/history, auxiliary cleanup, output reveal, project/build tree
watching, and SyncTeX forward/inverse search.

The frontend centralizes invokes in `src/services/project-service.ts` and
`src/services/build-service.ts`; responses are trusted through TypeScript
generic annotations except for a shallow error parser. No runtime schema layer
or contract generation exists.

Three global event names cross the IPC boundary:

- `tex://build-event`
- `tex://watch-event`
- `tex://project-files-event`

Event payloads have no explicit protocol version. Build runs carry identifiers;
watch and project-tree ordering require full Phase 3 review.

### Filesystem and persisted state

Rust owns project enumeration, source/PDF reads, source and recovery writes,
project entry creation/rename/deletion, search replacement and undo state,
auxiliary cleanup, build configuration, recent projects, application
preferences, workspace restoration, and watcher registration. Atomic-write
helpers are used for source and persisted state paths, but durability,
symlink/root-swap behavior, rollback, and multi-file transaction semantics
remain unverified review questions.

Application state and recovery drafts are stored under Tauri's application data
directory. Project build configuration is stored inside the project. The
baseline documentation prohibits telemetry, accounts, cloud storage, AI calls,
and document uploads; no such integration was found in manifests or source.

### External processes

Production paths can execute a selected fixed TeX engine/latexmk, SyncTeX, and
the platform file viewer (`explorer.exe`, `/usr/bin/open`, or
`/usr/bin/xdg-open`). Build configuration may include separately supplied
arguments and shell-escape consent. Process environment, executable discovery,
tree cancellation, resource bounds, and project-provided TeX behavior require
Phase 3 and Wave C review.

### Logs

The log plugin writes to stdout and the application log directory. Compiler
output is retained in bounded build history and emitted to the frontend.
Document contents, absolute paths, argument redaction, log rotation, and parser
bounds require explicit verification; no claim of safe redaction is made here.

## Test matrix

The frontend baseline has 12 test files and 44 tests (35 direct `it`/`test`
declarations plus parameterized assertions). Coverage concentrates on reducers,
LaTeX parsing/highlighting, document tabs and outlines, project models,
workspace geometry, shortcuts, and PDF replacement state. It has no DOM,
accessibility, IPC-runtime-validation, CodeMirror lifecycle, or complete
workspace orchestration tests.

Rust has 52 unit/fixture tests covering path rejection, source/PDF reads,
atomic source writes, project entry constraints, persistence migration,
recovery behavior, build invocation boundaries, diagnostic parsing, watcher
filtering, SyncTeX parsing, root detection, fixture builds, and last-good PDF
retention. It has no dedicated fuzzing, property testing, race harness,
permission-loss matrix, process-tree cancellation integration test, or hostile
workflow test.

## Performance baseline status

`docs/benchmarks/README.md` defines startup, project-open, keystroke, file
switch, search, build-start, log-update, and PDF-replacement scenarios with
fixtures and sample requirements. The application does not yet emit all start
and completion marks required by that protocol, and this environment lacks a
completed WebView/power/storage record. Consequently, no UI latency sample is
published in this baseline.

The following are admissible diagnostic facts only:

- frontend release transformation: 2,225 modules in 605–610 ms;
- first no-bundle native release build: 151.960 s;
- workspace JavaScript: 1,187.01 kB minified, 368.98 kB gzip;
- 24-chapter `large-project`, broken-build, simple-article, NASA report, watch
  storm, invalid PDF, Unicode path, and multi-root fixtures are available.

Phase 5 may publish measurements only after implementing non-invasive marks or
a harness and collecting the protocol's required samples on a completed
reference environment.

## Hypothesis decisions

| Plan hypothesis | Baseline decision |
| --- | --- |
| CI listens to `main` while work uses `master` | disproved; CI targets `master` |
| Rust lacks `rust-version` | disproved; package and toolchain declare 1.88.0 |
| Rust lacks manifest lint policy | confirmed |
| ESLint must be replaced by Oxlint | confirmed as planned migration; equivalence not yet established |
| CI lacks RustSec/licence/source/dependency review | confirmed |
| Actions use mutable tags | confirmed for all third-party actions except Tauri action's named action tag; none use full SHAs |
| Release install is not frozen | disproved; release and CI use `bun install --frozen-lockfile` |
| Source ledger, threat model, and exception register are absent | confirmed at baseline |
| Benchmark harness is absent | confirmed; protocol exists, instrumentation/results do not |

## Phase 0 exit decision

The baseline is reproducible and production source is unchanged. The file
ledger contains the maintained inventory and review-wave assignment. Known
measurement gaps are explicit and must not be represented as successful
performance evidence.
