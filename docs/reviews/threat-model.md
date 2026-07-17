# TeX desktop threat model

Model revision: 1  
Review date: 2026-07-16  
Architecture revision: `59693fb`
Scope: local desktop application, build toolchain, project files, application
state, webview, dependencies, CI, and release automation

## Security objectives

1. Never read, mutate, delete, watch, or execute against a directory that Rust
   has not associated with an explicit native selection or validated persisted
   approval.
2. Preserve source, recoverable edits, workspace context, and last-good PDF
   through failure, cancellation, external change, and stale completion.
3. Do not execute a custom command or shell escape without native consent bound
   to the exact project configuration.
4. Bound attacker-controlled file, parser, process, event, rendering, and log
   work so the editor remains recoverable.
5. Keep document content, private paths, credentials, and release authority out
   of unintended IPC, logs, errors, workflows, and artifacts.

## Assets and impact

| Asset | Required property | Principal impact |
| --- | --- | --- |
| LaTeX source and project entries | integrity, availability, conflict detection, recovery | source loss or corruption |
| Recovery drafts and workspace state | confidentiality, integrity, bounded restoration | loss of unsaved work or unsafe restoration |
| PDFs, SyncTeX, compiler output | integrity, availability, origin/size bounds | misleading output, memory/CPU exhaustion, stale navigation |
| Approved project roots | unforgeable authority, root identity continuity | arbitrary filesystem access |
| Build configuration and consent | integrity, exact executable/argument binding | arbitrary command execution |
| Build/watch processes and events | bounded lifetime, ordered terminal state | orphan processes, stale UI, resource exhaustion |
| Logs and diagnostics | bounded evidence, redaction, injection resistance | document/path disclosure or misleading diagnostics |
| Dependencies and workflows | provenance, immutability, least privilege | developer/release compromise |
| Release token and artifacts | confidentiality, integrity, traceability | malicious release publication |

## Actors and assumptions

| Actor/input | Capability assumed | Trust decision |
| --- | --- | --- |
| Normal user | selects projects, edits source, configures builds | trusted for deliberate native confirmations; mistakes remain recoverable |
| Compromised webview | invokes exposed commands/events with arbitrary payloads | untrusted; cannot grant project or process authority |
| Malicious or compromised project | controls names, source, build output, watcher events, TeX diagnostics, PDF/SyncTeX bytes | untrusted even after root approval; approval grants bounded project workflow access, not unrestricted process consent |
| Concurrent local process | can replace project files/directories and emit event storms | untrusted external changer; conflict and identity checks required |
| Malformed application state | controls persisted JSON after corruption/tampering | untrusted; schema/version/bounds validation required |
| Dependency/workflow attacker | may compromise mutable tags, packages, build scripts, or PR input | untrusted; immutable pins and policy gates required |
| Same-account host attacker | can already read/write user files and application state | outside confidentiality boundary; TeX must still fail safely and avoid amplifying accidental damage |

The operating system, native file picker result, bundled Rust code, and verified
release inputs are trusted only within their documented contracts. The system
WebView and TeX executables remain patch/update dependencies.

## Trust boundaries and data flow

```text
User ──native dialog/confirmation──> Rust authority registry
                                       │
Untrusted webview ──typed IPC──────────┤ command adapter
                                       ↓
                              domain validation/service
                                ↙               ↘
                    project/app filesystem     process supervisor
                           ↑                         ↓
                  watcher/external change     output/parser/events
                           └──────── typed, bounded IPC ───────> webview

GitHub ref/lockfiles ── CI policy ──> build jobs ── release job/token ──> artifacts
```

Boundary rules:

- Paths from the webview are identifiers only. `ProjectAccess` establishes
  authority and compares canonical path plus filesystem identity.
- Relative project paths are revalidated at operation time. Symlink and
  ancestor-swap resistance remains an operation-specific responsibility.
- Build configuration is loaded by Rust. Webview-supplied configuration is
  ignored. New or changed custom process authority requires native confirmation.
- Events and non-void command responses enter TypeScript as `unknown` and pass
  bounded runtime contracts before feature code. Malformed event payloads are
  rejected without reducer dispatch or payload logging.

## IPC command review map

`Rust owner` names the authoritative validation layer. `Test strategy` records
existing evidence plus required adversarial coverage; an entry does not claim
all listed tests already exist.

| Command | Assets/input | Rust owner and controls | Test strategy / residual risk |
| --- | --- | --- | --- |
| `phase_zero_readiness` | feature flags | static readiness response; no authority | serialization/unit test; ensure flags remain truthful |
| `choose_project_folder` | native picker path | `project_open` + `ProjectAccess::approve`; canonical directory and identity | native smoke; cancellation; unavailable/permission path |
| `open_project` | approved root | `ProjectAccess::resolve`; bounded 2,048-entry/12-depth tree; skips symlinks/generated dirs | unapproved/replaced root; tree limits; permission loss |
| `create_project_entry` | approved root, parent, one name, kind | `ProjectAccess`; canonical parent; direct normal name; create-new semantics | traversal, nested name, symlink parent, collision, race |
| `rename_project_entry` | approved root, relative source, one name | `ProjectAccess`; no traversal/symlink components; no replacement | symlink, collision, root selection, ancestor-swap race |
| `delete_project_entry` | approved root, relative target | `ProjectAccess`; no traversal/symlink components; root prohibited | symlink-target regression; recursive failure/partial deletion; trusted confirmation review |
| `forget_recent_project` | application-state path key | persistence only; removes exact record and session approval | arbitrary key cannot touch source; active-session behavior |
| `load_startup_state` | persisted JSON/paths | schema migration and path validation; approves available persisted roots | corrupt/newer schema, oversized state, root replacement |
| `load_app_preferences` | persisted preferences | schema/default validation | malformed and oversized state |
| `save_app_preferences` | theme/accent | enum and exact hex validation; atomic app-state write | invalid value, permission/disk failure |
| `save_workspace_state` | project-relative UI context | approved root; path/type and numeric-state validation; atomic app-state write | unapproved root, malformed floats/ranges, stale files, size/count bounds |
| `load_project_build_configuration` | app-state configuration | approved root; schema/path/executable/consent validation | corrupt state, changed executable, control characters |
| `save_project_build_configuration` | paths, environment, custom command | approved root; structural bounds; exact native custom/shell confirmations; atomic write | forged booleans, changed args, cancel each prompt, newline spoofing |
| `read_project_pdf` | approved root, PDF path | extension, canonical containment, file type, 256 MiB limit | traversal/symlink/oversize; replacement race; malformed PDF handled in viewer |
| `project_pdf_revision` | approved root, PDF path | same PDF resolution; metadata-only revision hint | same-size/timestamp collision; replacement race |
| `read_project_source` | approved root, relative path | extension allowlist, canonical containment/file type, 2 MiB, UTF-8 | traversal/symlink, invalid UTF-8, permission loss, replacement race |
| `save_project_source` | approved root, content, expected revision | 2 MiB; contained existing source; mandatory SHA-256 revision conflict; atomic replacement | stale revision, external replacement, disk failure, ancestor race |
| `save_recovery_draft` | approved root, source identity/content | source existence, 2 MiB, app-data hashed key, atomic replacement | malformed revision, path alias, disk failure, recovery confidentiality |
| `load_recovery_draft` | approved root, source identity | approved root; hashed app-data key; embedded identity equality | oversized/corrupt record and alias handling |
| `discard_recovery_draft` | approved root, source identity | approved root; exact hashed app-data file only | forged identity, missing file, permission failure |
| `search_project_sources` | approved root, query/mode | literal escaped regex; 2,048 files, 500 returned matches, source size limits | query length, Unicode/case behavior, event-time changes |
| `replace_project_sources` | query, replacement, expected revisions/files | approved root; 128 files/32 MiB transaction/64 KiB replacement; revisions; atomic per-file writes and rollback | crash mid-transaction, rollback failure, symlink race, duplicate paths |
| `undo_project_replace` | transaction identifier | fixed 64-hex transaction key; approved canonical project; post-replace revisions; reverse rollback | corrupt/oversized transaction, rollback failure, ancestor race |
| `preview_build` | approved root, root, engine | Rust-loaded persisted configuration; same validator as start; fixed/consented executable | forged request configuration regression; executable replacement; PATH trust |
| `get_build_profiles` | host tool availability | fixed engine list; executable discovery only | PATH edge cases, executable permission, no project execution |
| `start_build` | approved root, root, engine | Rust config, path/consent validation, slot reserved before grouped spawn; 30-minute and retained-history budgets | executable replacement; process escaping its OS group/session |
| `stop_build` | approved root | approved active identity; process-group cancellation and wait | repeated stop, exactly-one terminal event |
| `get_build_history` | approved root | approved root; 10 runs, 500 entries and 512 KiB log text per run; 16 project histories | diagnostic duplication and redaction |
| `preview_clean_auxiliary_files` | approved root | no symlink traversal; extension allowlist; depth/file/entry limits and truncation flag | generated-name ambiguity and concurrent replacement |
| `clean_auxiliary_files` | approved root, preview list | deduplicated contained allowlist; native confirmation before deletion | ancestor race and partial auxiliary deletion |
| `reveal_project_output` | approved root and root file | Rust config; contained PDF; fixed platform executable; grouped 10-second deadline/wait | output replacement race and desktop-handler trust |
| `start_project_watch` | approved root | approved identity, validated Rust configuration, bounded active/channel/path state | notify backend loss beyond surfaced overflow |
| `stop_project_watch` | approved root | approved identity and owned watcher channel | lost receiver, repeated stop, terminal status ordering |
| `get_project_watch_status` | approved root | approved identity and controller state | stale thread/controller state |
| `acknowledge_project_watch_build` | approved root and queued state | approved identity; consumes only an active `BuildQueued` state and emits `Watching` | frontend crash between acknowledgement and build request |
| `start_project_tree_watch` | approved root | approved identity, one watcher per root | event storm/overflow and thread cleanup |
| `stop_project_tree_watch` | approved root | approved identity and owned stop channel | repeated stop and thread cleanup |
| `synctex_forward_search` | approved root, source/PDF coordinates | strict source/PDF paths; canonical executable; grouped 5-second/512 KiB limits; finite parsed output | executable replacement and malformed but bounded output |
| `synctex_inverse_search` | approved root, PDF coordinates | finite non-negative input; grouped bounded process; canonical contained `.tex` output | executable replacement and huge finite coordinates |

## External process map

| Process | Selection and arguments | Authority/consent | Supervision and residual risk |
| --- | --- | --- | --- |
| `latexmk`, `pdflatex`, `xelatex`, `lualatex` | fixed engine enum; canonical executable resolved from `PATH`; fixed arguments plus validated root/output | approved project; ordinary TeX build action | grouped supervision, 30-minute limit, bounded streaming/retention; PATH executable replacement and inherited tool environment remain residual |
| Custom build executable | existing canonical absolute file; separately supplied bounded/control-character-free arguments | native confirmation bound to changed command; shell escape confirmed separately | same grouped supervision; executable replacement after consent remains residual |
| `synctex` | canonical `PATH` executable; separate `view`/`edit` arguments; contained source/PDF | approved project; synchronization action | 5-second grouped deadline and 512 KiB per-stream capture; executable replacement remains residual |
| `explorer.exe`, `/usr/bin/open`, `/usr/bin/xdg-open` | fixed platform executable and contained output argument | approved contained built PDF | grouped 10-second deadline and wait; desktop handler/environment remains host-controlled |
| Fixture TeX processes | fixed test commands against repository fixtures | test-only | grouped 5-second probes/120-second builds and temporary output cleanup |

## Abuse-case register

| Threat | Primary control | Evidence/status | Residual action |
| --- | --- | --- | --- |
| Arbitrary frontend project root | Rust native approval and root identity registry | TEX-B-001 fixed in `ab6a217` | apply approved-root type deeper to reduce accidental bypass |
| Root replaced at same pathname | device/inode or volume/file-index identity comparison | regression in `project_access` | platform CI verification; child-operation races remain |
| Traversal/symlink escape | canonical containment, extension/type checks, symlink mutation rejection | broad unit coverage; TEX-B-002 fixed | handle-relative/ancestor-race hardening in Wave B |
| Forged custom command/shell consent | Rust-loaded config and native confirmations | TEX-C-001 fixed in `12a8355`; forged-request regression | test cancellation and command-change confirmation in platform smoke suite |
| Malicious TeX source | shell escape off by default; explicit shell/custom consent | configuration tests | document ordinary TeX trust limits; reduce inherited environment |
| Oversized/malformed source/PDF/state/output | bounded open-handle reads, process channels/capture, traversal and transaction budgets | Wave B/C regressions | add canvas/page/text bounds in Wave G |
| PDF decompression/render bomb | 256 MiB byte cap only | incomplete | bound page/canvas/text work and cancellation in Wave G |
| Watcher event storm/overflow | bounded callback channel, path set, active count, debounce and surfaced truncated reconciliation | overflow unit test; TEX-C-004 fixed | platform storm smoke evidence |
| Stale async completion | opaque build IDs, operation generations, bounded runtime event parsers and pending-event reconciliation | reducer/parser tests | complete feature-specific review in Waves E–G |
| Concurrent/partial writes | revisions and per-file atomic replacement | source/replace tests | durable multi-file recovery and ancestor-race review |
| Compromised dependency/action | immutable Action pins, lockfiles, frozen install, dependency review/audit/licence/source gates | TEX-A-001/002 fixed in `fb47327` | monitor advisories and owned exceptions |
| Malicious workflow input | restricted current PR permissions; release on tags | incomplete | audit expression interpolation, tag authority, artifact/release provenance |

## Logging and redaction

User-facing errors pass a bounded code/message classifier; malformed error
objects collapse to a generic non-destructive message. Build events retain
compiler text and validated relative file paths for diagnosis under line,
channel, byte, run, and project-history budgets. The model prohibits
document/recovery content, credentials, unrestricted environment values, and
unnecessary absolute paths in application logs. Runtime contracts reject
unknown security-relevant variants, non-finite numbers, oversized collections,
and malformed authority-bearing identifiers before presentation code.

## Phase 3 exit criteria

Every current IPC command and external process has a validation owner and test
strategy above. Critical findings TEX-B-001, TEX-B-002, and TEX-C-001 and all
confirmed high process/filesystem findings through Wave C are fixed with
regression evidence. Remaining risks are owned by Waves D–G and must be entered
as findings when source review confirms their exact scope.
The threat model must be updated whenever a command, plugin permission, process,
persisted schema, event contract, or release credential path changes.
