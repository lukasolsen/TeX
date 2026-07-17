# TeX Backend Audit — `src-tauri`

**Scope:** The entire Rust/Tauri backend reachable from `main.rs` (`tauri_native_lib::run()` in `lib.rs`), ~9,000 lines across 24 modules, plus `tauri.conf.json`, `capabilities/`, and `Cargo.toml`.
**Date:** 2026-07-17
**Method:** Manual review of the security-critical primitives (`project_access.rs`, `source_read.rs`, `source_edit.rs`, `bounded_io.rs`, `process_support.rs`) plus four focused sub-audits over the FS handlers, the process/build/terminal layer, the search/scan/watch/completion layer, and the persistence/config/window layer. Every finding below is anchored to a specific line.

> `main.rs` itself is a two-line entry point (`fn main() { tauri_native_lib::run() }`); there is nothing to review there. The real surface is the library crate.

---

## 1. Executive summary

The backend is, overall, **well-architected for security**. The core defenses are real and correct:

- **`ProjectAccess` authority model** — frontend paths never grant access on their own. A path only resolves if it canonicalizes to a root approved during this session, verified by **device + inode identity** (so replacing a root at the same pathname invalidates approval).
- **Path containment** — `resolve_source_path` rejects non-`Normal` components, walks each segment rejecting **symlinks**, canonicalizes, and enforces `starts_with(root)` + `is_file`.
- **Process safety** — all compiler/terminal/synctex spawns use **direct exec with explicit argv arrays** (no `sh -c` in production), with **process-group kill**, **hard timeouts**, and **bounded output capture** that keeps draining to avoid pipe-full deadlock.
- **Hardening posture** — `#![forbid(unsafe_code)]`, clippy `deny`s on `unwrap`/`expect`/`panic`, atomic writes (`AtomicWriteFile`), size caps (`MAX_*_BYTES`) on every read, a tight CSP (`default-src 'self'`, no remote content, `withGlobalTauri: false`), and a minimal webview capability set (no fs/shell/http exposed).

The findings are therefore **not** a broken security model — they are **specific gaps** in that model plus a cluster of **performance/DoS** and **resource-leak** issues concentrated in the interactive (completion/search/watch) and process-lifecycle code.

No issue found is remotely exploitable by a network attacker. The realistic threat actors are: (a) a **malicious/crafted project directory** the user opens, (b) a **compromised or buggy frontend/webview** calling commands in a loop, and (c) a **concurrent local filesystem writer** racing TOCTOU windows. The two items that most deserve near-term attention are the **`latexmk` argument injection via a dash-prefixed root filename** (path to code execution) and the **completion/search DoS** (multi-GB synchronous disk reads per keystroke).

### Severity counts

| Severity | Count | Themes |
|---|---|---|
| **HIGH** | 3 | Argument injection → code exec; completion re-scan DoS; O(n²) completion parse |
| **MEDIUM** | 10 | Concurrent-write data loss; delete TOCTOU; startup over-approval; resource leaks; sync UI-thread blocking; watcher issues |
| **LOW** | 11 | Case-sensitivity, redundant syscalls, ID collisions, dead code, unbounded windows, env-var gaps |

---

## 2. Priority remediation order

Fix in roughly this sequence; the first three are the ones with security or hard-DoS impact.

1. **H-1** — `--`/`./` guard the compiler root-file argument, and reject leading-dash filenames. *(Security, small change.)*
2. **H-2 / H-3 / M-6** — Make completion/search/replace `async` + `spawn_blocking`, cache the project scan, and linearize `open_environments`. *(Kills the interactive DoS.)*
3. **M-2** — Re-validate the delete target after the confirmation dialog. *(Destructive-command TOCTOU.)*
4. **M-8** — Scope startup approval to the actually-opened project.
5. **M-1 / M-9** — Serialize per-file saves and the shared state read-modify-write to stop lost updates.
6. **M-4 / M-5 / M-7 / M-10** — Reap dead terminals, GC replace backups, filter tree-watch noise, watch selectively to avoid inotify exhaustion.
7. **M-3** — Fix the recovery-draft size asymmetry so crash recovery works for large files.
8. LOW items as cleanup.

---

## 3. HIGH severity

### H-1 — Dash-prefixed root filename passed to the compiler as a raw positional (argument injection → code execution)
- **File:** `src-tauri/src/build_system.rs:436` (validation gap in `src-tauri/src/source_read.rs:103`)
- **Category:** Security
- **What:** `arguments.push(root_file.clone())` appends the root file as the final argv element with **no `./` prefix and no `--` end-of-options separator**. `root_file` is validated only through `resolve_source_path`, and `valid_relative_path` (`source_read.rs:103`) accepts any `Component::Normal` name — **including names beginning with `-`**. So a file named e.g. `-shell-escape.tex` or `-usepretex=...tex` that exists in the project passes validation and is handed to `pdflatex`/`xelatex`/`lualatex`/**`latexmk`** as an *option* token, not an input file.
- **Impact:** A crafted project (or one the user is tricked into creating a file in) turns the filename into a compiler flag. **`latexmk` is the worst case**: it interprets `-e`, `-r`, `-jobname`, `-usepretex`, etc., several of which execute arbitrary code — i.e. opening a malicious project and building it can run attacker code. Even the plain TeX engines let an attacker toggle unintended options (`-shell-escape`, output redirection). This bypasses the shell-escape consent gate entirely because consent only scans *custom-command arguments*, not the engine's positional filename.
- **Fix (research):**
  - **Immediate:** prefix the positional when relative — `format!("./{root_file}")`. `./name` is treated as a filename by all four engines and defuses leading-dash interpretation. This is the most portable single fix.
  - **Defense in depth:** insert a literal `--` argument immediately before the filename for engines that honor it (latexmk does).
  - **Root cause:** extend `valid_relative_path` (or the root-file-specific validation) to reject any path component whose file-name starts with `-`. This also protects synctex and any future positional-filename use. Add a unit test with a `-foo.tex` fixture.

### H-2 — Completion re-scans and re-reads the entire project on every request
- **File:** `src-tauri/src/latex_completion.rs:647` (command) → `:719` → `latex_project_scan::scan_project`
- **Category:** Performance / DoS
- **What:** `latex_completions` is a **synchronous** `#[tauri::command]`. For any argument context (`\ref{`, `\cite{`, `\input{`, `\includegraphics{`, …) it calls `symbol_items` → `scan_project`, which walks the whole tree (up to `MAX_SCAN_FILES = 2048`) and calls `read_source` on **every** `.tex`/`.bib` file (each up to `MAX_SOURCE_BYTES = 2 MB`). There is **no cache**: every keystroke inside an argument re-walks the tree and re-reads/re-parses every source file. `read_source` additionally re-`canonicalize`s the root and runs `reject_symlink_components` (a `symlink_metadata` syscall per component) for each of the 2048 files.
- **Impact:** On a large project a single completion request can read **multiple GB** from disk and parse it, synchronously, on the UI thread. An untrusted/looping frontend can invoke it in a tight loop for sustained multi-GB disk + CPU load — a straightforward DoS — and even normal typing produces severe interactive latency.
- **Fix (research):**
  - **Cache the scan** keyed by `(root, per-file revision/mtime)`, invalidated by the existing watcher (`watch_system`). The watcher already tracks project-file changes, so wire an index invalidation to it.
  - **Precompute an incremental symbol index** (labels, bib keys, file names) maintained on file save + watch events, so completion is a lookup, not a full scan.
  - **At minimum:** make the command `async` and offload to `tauri::async_runtime::spawn_blocking`, and debounce/throttle requests. Reuse the open-buffer overlay but skip re-reading unchanged files.

### H-3 — `open_environments` is O(n²) on the edited buffer
- **File:** `src-tauri/src/latex_completion.rs:1072-1090` (helper `braced_values` at `:1060-1069`)
- **Category:** Performance / DoS
- **What:** For an `\end{`-completion context, `query` calls `open_environments(source)`. It loops over every `\begin{` via `match_indices`, and for each occurrence calls `braced_values(&source[start..], "\\begin")`, which runs `match_indices("\\begin")` over the **entire remaining source** and `.collect()`s all matches into a `Vec` before taking `.next()`. Inner scan is O(n) per `\begin`; outer loop is over every `\begin` → **O(n²)**. The `\end{` loop is identical. `source` is bounded only by 2 MB. Confirmed by reading the code: `braced_values` at line 1061 scans the whole slice and collects.
- **Impact:** A 2 MB buffer densely packed with `\begin` tokens makes **every keystroke after `\end{`** take quadratic time — up to billions of operations — blocking the command thread. Untrusted content can trigger this deliberately; a large legitimate document degrades noticeably.
- **Fix (research):** Rewrite `open_environments` as a single linear pass: iterate `match_indices("\\begin{")` / `("\\end{")` and read only the immediate `{…}` group at that offset (as `braced_argument` in `latex_symbols.rs` already does) instead of re-scanning the tail. Never `.collect()` all matches to take the first — use `.next()` on the lazy iterator, or better, index the brace group directly.

---

## 4. MEDIUM severity

### M-1 — Lost-update race between concurrent saves
- **File:** `src-tauri/src/source_edit.rs:52-61`
- **Category:** Bug / Data-loss
- **What:** `save_project_source` is optimistic-concurrency: read disk bytes (`:52`), compare `revision_for_content(&current) != expected_revision` (`:53`), then `atomic_write` (`:61`). **No lock spans read→check→write.** Two in-flight saves starting from the same `expected_revision` (autosave + manual, or two rapid saves) both pass the check and both write; the second silently overwrites the first. `AtomicWriteFile` makes each write atomic but the compare-and-swap is not, so the "external-change" guard only catches changes made *before* the call started.
- **Impact:** A user edit that passed the guard is lost with no error surfaced.
- **Fix (research):** Serialize writes per canonical path with a `Mutex` held across read-check-write, stored in Tauri managed state (a `Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>` interned per path), mirroring the `ProjectAccess` ownership pattern. Alternatively re-stat `(len, mtime)` under the lock immediately before `commit()` and abort if it changed since the pre-write read.

### M-2 — Delete target not re-validated after the async confirmation dialog (TOCTOU)
- **File:** `src-tauri/src/project_files.rs:118-151`
- **Category:** Security
- **What:** `delete_project_entry` calls `resolve_entry` (canonicalize + symlink-component rejection + containment) at `:118`, then `.await`s an interactive confirm dialog (`:121-145`) that can block arbitrarily long, then deletes the captured `target` via `spawn_blocking(delete_entry)` (`:146`). `delete_entry` (`:151-158`) re-checks only `target.is_dir()` (which **follows** symlinks) before `remove_dir_all`/`remove_file`. **No symlink/containment re-check after the dialog.**
- **Impact:** If any path component of `target` is swapped for a symlink during the dialog window, the delete follows it — `remove_dir_all` can destroy files **outside** the project root. Requires a concurrent local writer (not frontend-only), but it is a delete-outside-root TOCTOU on the most destructive command.
- **Fix (research):** Re-run `resolve_entry` (or at least `symlink_metadata` on the full path + `starts_with(root)`) **inside** `delete_entry`, immediately before deletion. Best practice: open the parent directory handle and delete by name with `O_NOFOLLOW` semantics (e.g. `cap-std` / `openat`-style APIs) so a swapped component cannot redirect the op.

### M-3 — Recovery drafts can be saved but become permanently unloadable
- **File:** `src-tauri/src/source_edit.rs:81-95` (save) and `:109` (load)
- **Category:** Data-loss
- **What:** `save_recovery_draft` bounds only the raw `content` (`:81`), then serializes the whole `RecoveryDraft` to JSON and writes it uncapped (`:93-95`). `load_recovery_draft` reads that JSON with a budget of only `MAX_SOURCE_BYTES + 16 KiB` (`:109`). JSON escaping can far exceed a 16 KiB margin: 2 MB of newlines/quotes each escape to 2 bytes (~4 MB), control chars to `\uXXXX` (6 bytes). The encoded draft then exceeds the load limit, `bounded_io::read` returns `InvalidData`, and load fails with `unavailable()`.
- **Impact:** Crash-recovery **silently breaks for exactly the large/escape-heavy files it matters for** — the draft is written but can never be read back.
- **Fix (research):** Make the budgets symmetric and account for JSON overhead. Either measure/cap the *encoded* length on save, or store `content` as a separate raw side file loaded under `MAX_SOURCE_BYTES` with a small JSON metadata sidecar. If keeping one JSON blob, size the load limit to a realistic worst case (`MAX_SOURCE_BYTES * 6 + overhead`).

### M-4 — Dead terminal sessions are never reaped
- **File:** `src-tauri/src/terminal_system.rs:114` (match) / `:283` (`supervise_terminal`)
- **Category:** Resource-leak
- **What:** When a shell exits on its own, `supervise_terminal` only flips `running=false` and emits `Exit`; it holds no handle to the controller map, so the `TerminalSession` (master PTY fd, writer, killer, scrollback) stays in `sessions` forever. `open_terminal` matches an existing session by `project_root` **before** checking `running` (`:114-123`), so a dead session is returned as-is and can't be respawned. Dead sessions still count toward `MAX_SESSIONS` (`:124`).
- **Impact:** After `MAX_SESSIONS` shells exit naturally, `open_terminal` returns `terminal-capacity-reached` forever (absent explicit `close_terminal` per session); each lingering session leaks a PTY fd; a project whose shell exited gets a dead descriptor instead of a fresh shell.
- **Fix (research):** Give the supervisor thread a cloned/weak handle to the `TerminalController` (or an `mpsc` to a reaper) to remove the session on exit. Minimum viable: in `open_terminal`, treat a matched session with `running == false` as absent — drop it and spawn fresh — and skip dead sessions when counting against `MAX_SESSIONS`.

### M-5 — Replace-transaction backups are never garbage-collected
- **File:** `src-tauri/src/project_search.rs:193, 200-204, 260`
- **Category:** Resource-leak
- **What:** Every successful `replace_project_sources` writes a backup JSON (up to `MAX_TRANSACTION_BYTES = 40 MB`) into `app_data/replace-history/` (`:193`). The only deletion is a *successful* `undo_project_replace` (`:260`). If the user never undoes, files accumulate unbounded. On the `WriteSetFailure::Restored` branch (`:200-201`) it returns `unavailable()` after the backup was already persisted, leaving an **orphan** whose `after_revision` can never match disk (files were rolled back), so undo can never clean it either.
- **Impact:** Unbounded app-data growth; permanently-unusable orphaned backups after any partial-write rollback.
- **Fix (research):** Delete the transaction file on the `Restored` path. Add TTL/count pruning of `replace-history/` (on startup or after each replace: drop entries older than N days or beyond a max count). Consider persisting the backup only *after* the write set is confirmed applied.

### M-6 — Heavy FS/search/completion commands run synchronously on the UI thread
- **File:** `src-tauri/src/project_search.rs:106` & `:119`; `src-tauri/src/latex_completion.rs:647`
- **Category:** Performance
- **What:** `search_project_sources`, `replace_project_sources`, and `latex_completions` are **non-`async`** `#[tauri::command]`s, which Tauri runs on the main thread. Their bounded-but-large work (traversal of up to 2048 files / 4096 entries, reading up to 2048 × 2 MB, regex per file, per-file `canonicalize` + symlink stats) blocks the UI/IPC thread for the whole operation.
- **Impact:** A large project freezes the window during search/replace/completion. Combined with H-2/H-3 this is the interactive DoS surface. *(Note: the search regex itself is safe — `literal_matcher` uses `regex::escape`, so no ReDoS, and results are capped at `MAX_SEARCH_RESULTS`.)*
- **Fix (research):** Make these `async` and offload with `tauri::async_runtime::spawn_blocking` (or a dedicated worker pool), returning results to the webview on completion.

### M-7 — Tree watcher reacts to build noise (missing ignore filter)
- **File:** `src-tauri/src/watch_system.rs:395-401` (vs. `run_watch`/`is_ignored` at `:433-512`)
- **Category:** Performance
- **What:** `run_tree_watch` treats an event as significant using only `classify_event(...).is_some() && paths.any(|p| p.starts_with(&root))` — it **never applies `is_ignored`**, unlike the build watcher. Writes under `.git`, `build/`, `dist/`, `target/`, and generated extensions (`.aux`, `.log`, `.fls`, …) all mark `last_event` and drive `PROJECT_FILES_EVENT` refreshes.
- **Impact:** During a build (which churns many aux files) the tree watcher continually resets its debounce and spams project-file refreshes, forcing the frontend to re-scan from pure build noise.
- **Fix (research):** Apply the same `is_ignored` / generated-file filtering (and relative-path strip) in `run_tree_watch` before setting `last_event`. Factor the build watcher's filter into a shared helper so the two paths can't drift.

### M-8 — `load_startup_state` grants filesystem authority to every recent project
- **File:** `src-tauri/src/persistence.rs:275, 358-367`
- **Category:** Security
- **What:** `load_startup_state` (a read-style command the frontend can call at will) invokes `approve_restorable_projects`, looping over **all** `Available` recent projects (up to `MAX_RECENT_PROJECTS = 12`) plus the last workspace, calling `access.approve(...)` on each. `approve` is the full authority grant that `resolve` checks for every read/write/build command. *(Note: it does re-canonicalize + capture device/inode, so it is not blind string trust — but it grants far more than the active project.)*
- **Impact:** Least-privilege violation: 12 directories the user isn't working in become writable/buildable for the whole session, amplifying the blast radius of any other `resolve`-gated bug (M-2, L-6) across all of them. A read command producing durable authority is also surprising.
- **Fix (research):** Approve **lazily** — only the project actually opened via `open_project`/`record_project_opened`. `load_startup_state` should return the recents list for display **without** approving them. Add a project-marker re-check before re-approving on restore (see L-4).

### M-9 — Concurrent read-modify-write on the shared state file loses updates across windows
- **File:** `src-tauri/src/persistence.rs:343-355` (also `375-408`, `287-298`, `253-255`)
- **Category:** Bug / Data-loss
- **What:** Every mutator (`save_workspace_state`, `record_project_opened`, `forget_recent_project`, `save_app_preferences`) does an **unsynchronized** `read_state` → mutate → `write_state`. `write_state` is atomic per write, but nothing locks across the read→write cycle, and the app supports **multiple windows** (`create_new_window`). Window A reads, B reads, A writes, B writes → B clobbers A's change (a just-added recent project or preference is lost).
- **Impact:** Silent loss of recents/preferences/workspace state under multi-window use.
- **Fix (research):** Hold a process-wide `Mutex` (a `Mutex<()>` file-guard in managed state) across read+mutate+write, or use an optimistic version/mtime check with retry. Atomic write alone does not prevent lost updates.

### M-10 — Recursive watcher registers OS watches on excluded/huge subtrees
- **File:** `src-tauri/src/watch_system.rs:324` & `:384`
- **Category:** Resource-leak
- **What:** Both watchers call `watcher.watch(&root, RecursiveMode::Recursive)`. `notify` registers an inotify watch for **every** subdirectory; `is_ignored` filtering happens only *after* events arrive. So `.git`, `node_modules`, `build`, `target`, etc. all consume kernel watch descriptors even though their events are discarded.
- **Impact:** A large project can exhaust `fs.inotify.max_user_watches` (default 8192), making `watch()` fail (→ `finish_with_error`) or degrading other apps' watchers; wasted descriptors even on success.
- **Fix (research):** Watch selectively — walk the tree reusing the `ignored_name` / generated-dir skip logic and add watches only for directories of interest, updating as directories are created/removed. Alternatively detect `ENOSPC` from `watch()` and surface a clear degraded state.

---

## 5. LOW severity

### L-1 — `.tex` extension match is case-sensitive during root scanning
- **File:** `src-tauri/src/root_detection.rs:146`
- **Category:** Robustness
- **What:** `collect_tex_files` compares `extension == "tex"` case-sensitively, unlike `is_readable_source`/`resolve_pdf` which lowercase first. `Main.TEX`/`chapter.Tex` are skipped as root candidates on case-sensitive filesystems.
- **Fix:** `extension.to_str().is_some_and(|e| e.eq_ignore_ascii_case("tex"))`.

### L-2 — Full contents of every `.tex` file read on project open
- **File:** `src-tauri/src/root_detection.rs:43-64` (`:50`), from `project_open.rs:159`
- **Category:** Performance
- **What:** `detect_root_candidates` reads each candidate file **entirely** via `read_utf8(path, MAX_SOURCE_BYTES)` (up to 2 MB × up to 1024 files ≈ ~2 GB worst case) plus a `canonicalize` per file, only to scan for `\documentclass` and a `% !TeX root =` comment that live near the top.
- **Fix:** Read only a bounded prefix (first N KiB, or line-by-line with `BufReader` stopping early). Consider a smaller per-file budget for detection and running it off the command thread.

### L-3 — `project_root` re-canonicalized once per magic-comment file
- **File:** `src-tauri/src/root_detection.rs:183`
- **Category:** Performance
- **What:** `magic_comment_root` calls `project_root.canonicalize()` for every `.tex` file containing a `% !TeX root =` line, recomputing the same value.
- **Fix:** Canonicalize the root once in `detect_root_candidates` and pass it down.

### L-4 — Approved roots are fully determined by the persisted state file
- **File:** `src-tauri/src/persistence.rs:358-367` (+ `project_access.rs` `approve`)
- **Category:** Security
- **What:** Restored roots go through `approve` (re-canonicalize + device/inode) — good — but `approve` accepts *any* path that currently resolves to a directory. The approved set is whatever `workspace-state.json` lists. Anyone able to write that file (loose `app_data` perms, another local process) can have the app approve arbitrary directories (`/etc`, `$HOME`) as first-class roots. Within a normal single-user `app_data` trust boundary this is low.
- **Fix:** Persist a provenance marker per root (only stored after a native selection), or require a lightweight project-marker check before re-approving on restore, so a hand-written recents entry cannot mint authority. Pairs with M-8.

### L-5 — Build-command consent stored as plain booleans in on-disk config
- **File:** `src-tauri/src/project_config.rs:59-63, 138-139, 203-216`
- **Category:** Security
- **What:** `custom_command_consent` / `shell_escape_consent` are serialized into config JSON; `validate_configuration` only checks the flag is `true`, and `establish_native_consent` skips re-prompting when the stored command+consent match. Editing the `app_data` config to set `consent: true` beside an arbitrary absolute `executable` yields a "consented" custom command run without a fresh prompt. *(Mitigation: config lives under `app_data/project-build-configurations/{sha256(root)}.json`, **not** in the project dir, so an untrusted project directory cannot inject it; `canonical_child` rejects absolute/`..`/symlink components and requires the executable be an absolute real file.)*
- **Fix:** Treat consent as a session-scoped grant tied to a hash of the exact command, held in Rust-owned managed state (like `ProjectAccess`), or HMAC the stored record — not a bare bool read back from a file the process can't vouch for.

### L-6 — Replace/undo write path re-canonicalizes without re-checking containment
- **File:** `src-tauri/src/project_search.rs:159-162` & `:244-247`
- **Category:** Security
- **What:** The write target is recomputed as `root.join(&path).canonicalize()` and passed to `atomic_write` **without** the `starts_with(project_root)` check that `resolve_source_path` enforces. Validation happened earlier in `read_source`, leaving a TOCTOU gap where a swapped symlink component could be followed and written through. Narrow (needs a local racer).
- **Fix:** After canonicalizing, assert `absolute_path.starts_with(&root)` (ideally reuse `resolve_source_path`) before writing; reject otherwise.

### L-7 — Environment settings allow duplicate keys and unvalidated path values
- **File:** `src-tauri/src/project_config.rs:242-249`; also applied at `build_system.rs:569`
- **Category:** Security / Robustness
- **What:** Env validation checks only that the name is in `ALLOWED_ENVIRONMENT_KEYS`, has no control chars, and is ≤ 4096 bytes. The count cap doesn't prevent duplicate keys, and values like `TEXINPUTS=/etc:` or `openin_any=a` / `openout_any=a` / `TEXMFOUTPUT=/` are accepted with no containment check — and env settings are applied to the child compiler at `build_system.rs:569`, **bypassing** the shell-escape consent scan (which only inspects arguments). TeX honors these to read/write outside the project.
- **Impact:** A local config can redirect LaTeX's I/O search paths / access controls outside the approved root during a build without triggering the consent dialog. Bounded by `app_data` trust.
- **Fix:** Reject duplicate keys; for path-bearing keys validate each entry resolves within the root (reuse `canonical_child`) or gate the TeX access-control vars (`openin_any`, `openout_any`, `TEXMFOUTPUT`, `TEXMFCNF`, `TEXINPUTS`) behind the same native consent as custom commands.

### L-8 — `matching_bracket` can underflow `depth` on an escaped `]`
- **File:** `src-tauri/src/latex_completion.rs:129`
- **Category:** Robustness
- **What:** `owning_command` calls `matching_bracket` whenever the slice ends with a literal `]`, even if escaped (`\]`). Inside, the trailing `]` is skipped by the `is_escaped` guard, so `depth` can be `0` when an earlier unescaped `[` runs `depth -= 1`. E.g. `\includegraphics[a\]{`. Debug builds **panic** (arithmetic overflow) → crashes the completion command on attacker-crafted content typed per keystroke; release wraps to `usize::MAX` → wrong result.
- **Fix:** Use `checked_sub`/`saturating_sub` and bail to `None` on underflow; better, treat an escaped closing bracket as "not a bracket group" before calling `matching_bracket`.

### L-9 — `run_bounded` abandons its reader threads on timeout
- **File:** `src-tauri/src/process_support.rs:62`
- **Category:** Robustness
- **What:** `let status = wait_for_group(...)?;` propagates on timeout, dropping the `stdout_reader`/`stderr_reader` `JoinHandle`s unjoined. `wait_for_group` kills the group first (closing pipes → readers hit EOF and exit), so it's not a steady-state leak, but the error path never joins them and relies implicitly on pipe closure; a grandchild holding the pipe open despite the group kill could leave a reader lingering.
- **Fix:** Join (or explicitly kill+wait then drop) both reader handles before returning the timeout error, mirroring the cleanup on the `spawn_stream_reader` error branches (`:47-60`).

### L-10 — `create_new_window` is unbounded
- **File:** `src-tauri/src/window_management.rs:35-38`
- **Category:** Robustness
- **What:** Increments an `AtomicU64` and builds a window with no cap on total open windows. A buggy/compromised frontend can loop to exhaust memory/GPU (local app DoS).
- **Fix:** Count `app.webview_windows()` before building and reject past a sane limit.

### L-11 — Miscellaneous robustness nits
- **`persistence.rs:637-646`** `retain_bounded` iterates an unordered `HashMap` and keeps the first `limit` entries, so which viewer states survive truncation is nondeterministic. *Fix:* sort by a last-used timestamp before truncating, or use an insertion-ordered structure.
- **`persistence.rs:548, 599-608`** A parse failure *or* an over-`MAX_STATE_BYTES` file both route to `corrupted_state()` → `default()` with `writable:true`, and the next save overwrites the file, permanently discarding recents/preferences with no backup. *Fix:* rename the original aside (`workspace-state.corrupt-<ts>.json`) before writing defaults, and distinguish "too large" from "malformed".
- **`project_search.rs:422-430`** `transaction_id` hashes `SystemTime::now()` ns + path; two replaces in the same nanosecond collide and overwrite a prior backup. *Fix:* add a random nonce or monotonic counter, or refuse to overwrite an existing file.
- **`watch_system.rs:444-448`** The guard `Create|Modify && path.exists() && path.symlink_metadata().is_err()` is effectively never true (exists() implies lstat succeeds), so it's dead code costing two syscalls per event. *Fix:* if the intent is to drop symlinks, check `symlink_metadata()?.file_type().is_symlink()`; otherwise remove it.
- **`watch_system.rs:337, 395, 411, 462-467`** Watch threads wake every 50 ms to poll the stop channel; up to 16 threads × 20 wakeups/s idle. Debounce is purely trailing with no max cap, so sustained activity can delay a flush indefinitely. *Fix:* derive `recv_timeout` from the pending deadline (or use a `Condvar`), and add a max-debounce ceiling (~2 s) that forces a flush.
- **`terminal_system.rs:113`** `open_terminal` holds the sessions mutex across `openpty`/`spawn_command`/thread creation, so writes/resizes/closes for other terminals block during new-terminal setup. *Fix:* reserve the slot under the lock, run `spawn_session` unlocked, re-acquire only to insert.

---

## 6. What's already done well (do not regress)

- **No `sh -c` in production** — every spawn (build, terminal, synctex, reveal) uses explicit argv arrays with direct exec. Argument injection (H-1) is the *only* residual command-surface issue, and it's a positional-filename problem, not a shell one.
- **`synctex.rs`** — argv-array spec strings, frontend numbers coerced to validated `u32`/finite-`f64`, inverse-search outputs canonicalized + `starts_with(root)` + `is_file` + `.tex` checked, output time/size-bounded. Clean.
- **`build_operations.rs`** — `clean_auxiliary_files` re-validates every path via `canonical_child`, dedupes, and gates deletion behind a native confirm; `reveal_path` uses absolute binaries with the target as a discrete arg. Clean.
- **`process_support.rs`** — process-group spawn, hard-deadline kill+wait, bounded drain that avoids pipe-full deadlock, truncation surfaced as an error. (Only nit: L-9.)
- **`latex_symbols.rs`** — all parsers single-pass linear, char-boundary-safe slicing, no panicking indexers, no user regex. Clean.
- **Config / capabilities** — CSP is tight (`default-src 'self'`, no remote content, dev relaxations confined to `devCsp`), `withGlobalTauri:false`, `removeUnusedCommands:true`; `capabilities/default.json` grants only `event` + a small window-control set — no fs/shell/http to the webview. `window_management` loads only local `WebviewUrl::default()`.
- **Crate hardening** — `#![forbid(unsafe_code)]`, clippy `deny`s on `unwrap`/`expect`/`panic`, atomic writes, size caps on every read, mutex-poisoning handled by returning errors rather than panicking.

---

## 7. Suggested test additions

- **H-1:** fixture project containing `-shell-escape.tex`; assert the build invocation passes `./-shell-escape.tex` (or `--` then the name) and that `valid_relative_path` rejects leading-dash names.
- **M-1 / M-9:** concurrency tests spawning two simultaneous saves / two window state writes from the same base revision; assert no update is lost.
- **M-2:** symlink-swap TOCTOU test around the delete confirmation (swap a component between resolve and delete; assert refusal).
- **M-3:** round-trip a recovery draft whose content is ~2 MB of newlines/quotes; assert it loads back.
- **H-3:** benchmark/regression test on a 2 MB buffer full of `\begin{...}` to guard the linear rewrite of `open_environments`.
