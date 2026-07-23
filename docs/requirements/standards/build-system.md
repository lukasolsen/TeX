# Build system standard

This document decides how TeX builds a LaTeX project, how it judges the result, and how it
explains that result to the person who asked for it. `ui-ux-requirements.md` decides what an
interface must *do* and `design-manual.md` decides what it must *look like*; this document
decides what the build must *be*. All three are mandatory.

Every rule here is checkable. Where a rule contradicts current behaviour, the current
behaviour is the defect — the remediation phases in §13 name each one.

The governing judgement: **TeX is a LaTeX build system, not a process runner.** Running a
binary and streaming its bytes is the easy half. Knowing what a run means, what it produced,
what went wrong, and how to say so in a sentence a person can act on is the product.

---

## 1. The model

One vocabulary, used by the Rust layer, the TypeScript layer, the UI, and this document.

| Term | Meaning |
| --- | --- |
| **Run** | One deliberate build of one project. Owns an id, a status, a log, diagnostics, and artifacts. |
| **Pass** | One execution of one tool inside a run: `pdflatex` #1, `biber`, `pdflatex` #2. |
| **Artifact** | A file the run produced. The PDF is the artifact the user wants; everything else is auxiliary. |
| **Diagnostic** | A resolved problem: a severity, a sentence, and — where knowable — a source location. |
| **Profile** | An engine choice the user makes. A profile is not a command; it selects one. |
| **Invocation** | The exact executable, argv, working directory, and environment a run will use. |

Rules:

- A run runs. The UI never says *compile*, *job*, *task*, or *build job*.
- Passes are progress, not history. A run has one entry in the run list regardless of how
  many passes it took.
- The user selects a profile, never a command line. A command line is something TeX shows
  them, not something it asks them to compose.

## 2. Engine model

**latexmk is the build system.** TeX does not orchestrate LaTeX passes itself. Reimplementing
rerun-to-fixed-point, bibliography sequencing, index generation, and dependency tracking is a
large and subtle surface that a mature tool already covers.

| Profile | Wire value | Executable and flags | Resolves references |
| --- | --- | --- | --- |
| pdfLaTeX | `latexmkPdf` | `latexmk -pdf` | yes |
| XeLaTeX | `xeLatex` | `latexmk -pdfxe` | yes |
| LuaLaTeX | `luaLatex` | `latexmk -pdflua` | yes |
| Single pass (pdfLaTeX) | `pdfLatex` | `pdflatex`, executed exactly once | **no** |

Rules:

- The wire enum `BuildEngine` keeps its four values, so no persisted preference is
  invalidated. What changes is which executable each resolves to and how it is described.
  `pdfLatex` already ran exactly one `pdflatex`, so that profile keeps its behaviour and
  gains an honest label.
- Single pass exists for pdfLaTeX only. It answers *"what does the engine report right
  now"*, which is a debugging question; tripling the profile list to offer the same
  diagnostic for three engines would cost more than it returns.
- Every profile carries `resolvesReferences`. The picker badges the single-pass profile
  **No references**, and a tool banner never offers it as able to build the project. Single
  pass is never a default and never the fallback for a missing latexmk.
- When `latexmk` is absent, the three real profiles are unavailable and route into the
  installer in `src-tauri/src/latex_install.rs`, which already installs latexmk and the
  bibliography tools for a minimal distribution. TeX does not silently degrade a
  reference-resolving profile into a single pass. Degrading silently is how a build reports
  **Succeeded** on a document full of `??`.
- A profile's `available` flag reflects the executable that profile actually needs.

## 3. Bibliography

The `bibliographyTool` setting this replaced was inert: *Biber* and *None* produced
byte-identical commands. Keeping a four-value setting mapped onto flags that do not
distinguish biber from bibtex would have been the same defect in new clothes — latexmk
chooses biber or bibtex from the presence of a `.bcf`, and that choice is correct.

So the setting does not claim to choose a tool. It controls what it can actually control:
**whether the bibliography runs.**

| Setting | Effect |
| --- | --- |
| `automatic` (default) | `-bibtex-cond` — run the bibliography tool when a `.bib` exists |
| `always` | `-bibtex` — always run it; a missing bibliography becomes an error |
| `never` | `-bibtex-` — never run it |

Rules:

- The control is labelled **Bibliography** with the options *Automatic*, *Always run*, and
  *Never run*. It never names a tool it does not select.
- Which tool actually ran is **reported, not configured**. The run summary names it — "biber
  ran once" — read from the pass sequence. Reporting what happened is truthful; offering a
  choice that does nothing is not.
- Persisted `biber` and `bibtex` values migrate to `always`; `none` migrates to `never`.
  The schema version increments and the migration is total — an unknown value is not an
  error, it resolves to `automatic`.

## 4. The invocation contract

**Fixed for every run.** Not configurable, not overridable by project settings:

| Argument | Why |
| --- | --- |
| `-interaction=nonstopmode` | TeX must never wait for a terminal that does not exist |
| `-file-line-error` | produces `file:line: message`, the only locatable error format |
| `-synctex=1` | two-way navigation is a product guarantee, not an option |
| `-recorder` | the `.fls` file is how TeX knows which files a run actually read |
| `./`-prefixed relative root | a filename beginning with `-` must not become an option token |

The `./` prefix and its comment in `validate_build_with_resolver` are a security control
closing the argument-injection finding in `docs/backend-audit.md` (H-1). Do not remove or
"simplify" either.

**Child environment.** Set in `command_for`, before project settings are applied:

| Variable | Value | Why |
| --- | --- | --- |
| `max_print_line` | `10000` | TeX wraps its log at 79 columns. Unwrapped, most multi-line diagnostics become single parseable lines. |
| `error_line` | `254` | keeps the error context line intact |
| `half_error_line` | `238` | keeps the context line's continuation intact |

These are web2c settings. TeX Live honours them; other distributions may not. **The log
parser must not depend on them** — they improve fidelity, they are not a correctness
precondition. §6 requires the parser to rejoin wrapped lines regardless.

**Configurable**, and nothing else is: root file, output directory, bibliography, shell
escape, the TeX environment allowlist, stop-at-first-error, and a fully custom command.

**Forbidden**: any argument assembled by string concatenation, any shell, any user text
reaching argv without validation, any project-supplied value reaching the fixed set above.

### 4.1 Shell escape

Reaching shell escape only by abandoning the safe engine for a custom command would silently
discard SyncTeX, `-file-line-error`, the output directory, and the injection guard — pushing
anyone using `minted` or TikZ externalization off every safety rail the product has.

So it is a consented per-project boolean applied to the standard invocation, reusing the
two-stage native consent in `establish_native_consent`
(`src-tauri/src/project_config.rs`). Consent is per project, re-requested when the project's
custom command changes, and never inferred from a previous project.

### 4.2 Output directory

The setting must work end to end or not exist.

- Create the directory when it is absent instead of rejecting the configuration. Requiring
  the user to create a folder in their file manager before a text field will validate is not
  a safety property.
- Extend `TEXINPUTS` for the run so a later pass finds the `.aux` the earlier pass wrote
  into the output directory.
- `preferredPdf` in `src/features/projects/project-model.ts` consults it, so the viewer and
  `reveal_project_output` resolve to the same file. They currently disagree.
- The path validation in `canonical_child` stays exactly as strict as it is today.

## 5. Outcome

**Status is not the exit code.** latexmk can exit 0 having produced nothing; a
`nonstopmode` engine routinely exits non-zero having produced a usable PDF.

| Status | Condition |
| --- | --- |
| `succeeded` | the tool exited 0 **and** the PDF exists with an mtime at or after the run's start |
| `succeededWithProblems` | a fresh PDF exists, but the run reported error diagnostics |
| `failed` | no fresh PDF |
| `cancelled` | the user stopped it — latched **before** the wait completes |
| `timedOut` | the deadline elapsed |

Rules:

- **Every terminal status carries a `reason` sentence.** "Failed" is a word, not an outcome.
  A timeout currently reports as `failed` with its explanation buried in a log line; that is
  the failure mode this rule exists to prevent.
- **A failed run that produced a fresh PDF still updates the viewer**, labelled *from a
  failed build*. `ui-ux-requirements.md` requires retaining the last known-good PDF; it does
  not require hiding a newer one. Hiding it makes the user rebuild to see work that already
  exists on disk.
- **Cancellation is graceful.** On Unix: SIGINT, then SIGKILL after 2 s. On Windows, where
  no equivalent exists, kill the group and treat the auxiliary state as suspect. An
  ungraceful kill leaves latexmk's `.fdb_latexmk` inconsistent, which is precisely the state
  that produces the "replayed an earlier failure" condition the panel already has to
  apologise for.
- **The cancel flag is read before the wait, not after.** Reading it afterwards reports a
  build the user stopped *after* it succeeded as `cancelled`.
- **Building while a build runs queues or restarts. It never errors.** Watch mode already
  models this correctly. A red panel state for pressing the primary button twice is a defect,
  not a guard rail.

## 6. Diagnostics

**The `.log` file is the source of truth. The stream is for liveness only.**

The current parser regexes a stdout stream that TeX has already wrapped at 79 columns, so the
`l.NN` context line and the source excerpt — the two things that tell a person *where* they
are — are discarded by construction.

Pipeline, in order:

1. **Read** the log after the run, bounded, through `bounded_io::read`. Resolve its path from
   the output directory when one is configured.
2. **Rejoin** wrapped lines. A continuation is a line that does not begin a new record.
3. **Classify** into the taxonomy in §6.1.
4. **Locate**: `file:line:` from `-file-line-error`; the `l.NN` marker; the line number
   embedded in warning prose (*"undefined on input line 88"*), which is currently thrown away.
5. **Deduplicate** across passes.
6. **Translate** per §7.
7. **Rank**: errors before warnings; within a severity, by file then line; unlocated last.

Rules:

- **A diagnostic is never deleted because its log line aged out.** Log retention keeps the
  **head and the tail** — errors happen early, and evicting the oldest lines evicts the
  error. Diagnostics are retained independently of log entries on both sides of the IPC.
  Today `updateRun` filters diagnostics to retained log sequences while retention keeps only
  the newest entries, so a long build empties its own Problems list.
- Identical `(code, file, line, message)` diagnostics from repeated passes collapse to one,
  carrying a pass count when it exceeds one. latexmk runs the engine two or three times;
  showing each warning three times teaches people to ignore the panel.
- The `l.NN` context line and the source excerpt belong to the diagnostic that owns them and
  are shown with it.
- Severity is never decided by substring search for the word "warning". It is decided by the
  record's classified form.
- An unrecognised record is **kept**, as `compiler-message`, with the compiler's own wording.
  Never drop what was not understood.

### 6.1 Taxonomy

A closed set of codes, in the same shape as `LatexDiagnosticCode` in
`src/domain/latex-diagnostics.ts`, so the build panel and the editor Problems panel speak one
language. Minimum set:

`undefined-control-sequence`, `missing-package`, `missing-file`, `undefined-reference`,
`undefined-citation`, `missing-dollar`, `runaway-argument`, `too-many-braces`,
`overfull-box`, `underfull-box`, `rerun-limit`, `bibliography-failed`, `compiler-message`.

Adding a code requires adding its template, its detection, and a log fixture in the same
change.

## 7. Voice

This section decides how the product feels, and it is as checkable as the rest.

The precedent is already in this codebase. `documentDiagnostics()` in
`src/domain/latex-diagnostics.ts` writes:

> `\begin{figure} is never closed. Add \end{figure}.`

It names the thing and the resolution, in one sentence, without jargon and without blame.
Every compiler diagnostic adopts that form.

| Rule | |
| --- | --- |
| Name the thing, then the resolution, in one sentence | `\qed isn't a known command here. The amsthm package defines it — add \usepackage{amsthm}.` |
| Never scold, never blame, never say "you" | not *"You forgot a closing brace"* |
| The compiler's own words stay one keystroke away | every translated diagnostic exposes its raw log line and jumps to it |
| No exclamation marks, no "Oops", no apology, no praise | — |
| Severity is a word before it is a colour | `Error` / `Warning`, per `design-manual.md` §11 |
| Warnings are not styled as failures | the destructive colour is reserved for errors |
| A count is a fact, not a verdict | `2 errors · 14 warnings`, never *"Build broken"* |
| Unknown is stated, never guessed | `The compiler did not report a source location.` |
| One action per problem | a diagnostic offers at most one thing to do |

Two boundaries:

- **Explain, do not translate away.** The raw compiler text is always reachable. A person
  who knows TeX must never have to fight the UI to see what the engine actually said.
- **The vocabulary is LaTeX's own.** *Root file*, *preamble*, *pass*, *auxiliary*,
  *diagnostic*. TeX borrows the explanatory posture of a good assistant — calm, specific,
  evidence one click away — and none of any product's visual identity or branded phrasing.

## 8. Progress and time

`ui-ux-requirements.md` already bans an indefinite spinner as the only evidence of work. The
build panel currently breaks that rule for the entire duration of a build.

| Signal | Source |
| --- | --- |
| Current pass | latexmk's `Run number N of rule 'pdflatex'` |
| Pages shipped | the `[12]` page markers in the stream |
| Bibliography running | the biber/bibtex pass announcement |
| Elapsed time | the run clock |
| Result summary | `Output written on main.pdf (14 pages, 482913 bytes)` |

Rules:

- Timestamps are **milliseconds**. `u64` seconds cannot render `2.4 s`, and a build tool that
  cannot state its own elapsed time reads as unfinished.
- Log events **batch on a 16–50 ms flush**. One IPC event per log line is 5–20k events, each
  a JSON round-trip and a reducer pass, for one real document.
- Progress is derived from output TeX already produces. Do not invent a percentage.

## 9. Tool inventory

`get_build_profiles` reports four executables. A missing tool must explain itself rather than
fail mysteriously, so the inventory is complete and surfaced in one place.

| Tool | Purpose | When absent |
| --- | --- | --- |
| `latexmk` | the build system | reference-resolving profiles unavailable → installer |
| `biber`, `bibtex` | bibliography | citations explained as unresolvable, with the reason |
| `makeindex`, `makeglossaries` | index, glossary | stated when the document needs one |
| `synctex` | two-way navigation | navigation disabled **with a reason** |
| `kpsewhich` | resolve a missing file to a package | §10 unavailable |
| `tlmgr` / `mpm` | install a package | §10 unavailable |
| `chktex` | source lint | the feature is absent, not broken |
| `texcount` | word count | the feature is absent, not broken |

`synctex` is today a hard dependency of `src-tauri/src/synctex.rs` that is never reported. If
it is missing, two-way navigation fails with a generic "unavailable" and the user has no way
to learn why. That is the exact failure this table exists to eliminate.

**Distribution identity is required.** The panel's details show which distribution TeX chose
and where — *"TeX Live 2025 · /usr/local/texlive/2025/bin/x86_64-darwin"*. A user with two
distributions installed currently cannot tell which one is building their document, and
neither can anyone reading their bug report.

## 10. Recovering from a missing package

`! LaTeX Error: File 'algorithm2e.sty' not found.` is the most common LaTeX failure there is.
It is currently a dead end with a red icon. It becomes the shortest path in the product:

1. Classify as `missing-package`; extract the file name.
2. Resolve file → package (`tlmgr search --global --file`, or the distribution's equivalent).
3. Offer **one** action on the diagnostic: `Install algorithm2e`.
4. Consent through a native dialog naming the exact package and the exact command, following
   `establish_native_consent` and `run_tlmgr` in `src-tauri/src/latex_install.rs`.
5. Reconcile: re-detect tools, then offer to rebuild.

Rules:

- **TeX never installs anything without a named, per-package consent.** No silent
  auto-install, even on distributions that support it.
- The action reconciles the state it changed, per `ui-ux-requirements.md`.
  `src/features/build/use-latex-install.ts` is the reference implementation and is named
  there for this reason.
- When resolution fails, say so and name the file. An unresolvable package is still a better
  diagnostic than a raw compiler line.

## 11. Errors and messages

- `BuildError.message` is an owned `String`. `&'static str` is the reason every failure
  currently shares a sentence.
- **One code, one meaning, one message shape.** `build-tool-unavailable` currently carries
  two different strings from two call sites. Codes are a contract; frontends branch on them.
- **Each cause gets its own sentence.** `unavailable()` currently answers for an unresolvable
  project path, a root that is not a directory, a failed canonicalisation, a missing custom
  executable, and a poisoned mutex. A user whose custom command was deleted should read
  *"The custom build command /opt/tools/build.sh no longer exists. Update it in build
  settings."*
- **Configuration errors name the field.** `invalid_configuration()` currently answers for
  the root file, the output directory, generated directories, and environment values alike,
  and the dialog renders it as one alert after save.
- Messages never contain document contents, and never contain an absolute path that is not
  necessary to the user's next action (`code-quality.md`).

## 12. Panel anatomy

Every state below is rendered deliberately, per the UI state table in
`ui-ux-requirements.md`. Surfaces, type, density, and elevation follow `design-manual.md`.

| State | Must show |
| --- | --- |
| Initial | the real next action; if no root file is chosen, how to choose one |
| Ready | the selected profile, the resolved command, and an enabled Build |
| Pending | immediate acknowledgement; Build does not stay enabled-but-inert |
| Running | current pass, pages shipped, elapsed time, and Stop |
| Succeeded | the outcome, counts, duration, and page count |
| Succeeded with problems | the same, plus the first problem and a route to it |
| Failed | the reason sentence, the first diagnostic, and the raw log |
| Timed out | the deadline that was reached and what to try |
| Cancelled | that the user stopped it, and that auxiliary state may be stale |
| Tool missing | which tool, what it is for, and the installer |

Rules:

- The root-file control is a **picker over the project's `.tex` files**, not a free-text
  input. TeX already knows every file in the project.
- Build, Stop, and the profile selector never move between states.
- The panel holds its geometry while a log streams. The log scrolls; the chrome does not
  reflow.
- Outcome routing follows the feedback table in `design-manual.md` §10: a build the user is
  watching reports in the panel, not as a notification.

## 13. Checklist before changing the build path

1. Does every control in the changed surface affect the command that actually runs?
2. Does the profile the user selected resolve their references, and does the UI say so?
3. Is the status derived from the artifact, or only from the exit code?
4. Does every terminal state carry a sentence explaining itself?
5. Can a diagnostic outlive the log line that produced it?
6. Is the raw compiler text still reachable from every translated diagnostic?
7. Does any message say "you", scold, or celebrate?
8. During the longest plausible run, what does the user see other than a spinner?
9. If a required tool is missing, does the UI name it and offer the next step?
10. Does each error code carry exactly one message shape?
11. After this action succeeds, what state is now stale, and where is it re-derived?
12. Does the panel hold its geometry on a 20,000-line log?

---

## 14. Remediation phases

The current implementation predates this standard. These phases bring it into line; delete
this section when they are complete. Each is one cohesive branch and pull request per
`AGENTS.md`.

All phases are **done**. Delete this section once the changes have shipped.

**P0 — Truthfulness. Done.** No control may claim an effect it does not have. Route the three real
profiles through latexmk; label single-pass mode honestly; replace `bibliographyTool` with
the Bibliography setting in §3 and migrate persisted values; honour `outputDirectory` in
`preferredPdf`. Split the duplicated `build-tool-unavailable` message; remove the dead
comment claiming a `PATH` override that `ALLOWED_ENVIRONMENT_KEYS` does not permit.
*Files:* `src-tauri/src/build_system.rs`, `src-tauri/src/project_config.rs`,
`src/domain/build.ts`, `src/services/build-contract.ts`,
`src/features/projects/project-model.ts`,
`src/features/build/build-configuration-dialog.tsx`.

**P1 — Diagnostic truth. Done.** Set the web2c environment in `command_for`; read the `.log` as the
authoritative diagnostic set; rejoin wrapped lines; capture the `l.NN` context; extract line
numbers from warning prose; deduplicate across passes; retain head and tail of the log and
stop deleting diagnostics with their log lines. Introduce the §6.1 taxonomy and the §7
translation layer, mirroring `src/domain/latex-diagnostics.ts`.
*Files:* `build_system.rs` (parser extracted to its own module), `src/domain/build.ts`,
`src/features/build/build-problems.tsx`.

**P2 — Outcome truth. Done.** The §5 status set with `reason`; PDF-freshness corroboration;
SIGINT-then-SIGKILL; read the cancel flag before the wait; queue instead of erroring on
build-while-running; show a failed run's fresh PDF, labelled.
*Files:* `build_system.rs`, `src/features/build/use-project-build.ts`,
`src/pages/project-workspace-page.tsx`.

**P3 — Feel. Done.** Millisecond timestamps; batched log events; pass and page progress; elapsed
time; the result summary. Owned `BuildError.message` and per-field configuration errors; the
root-file picker.

**P4 — Tools. Done.** The §9 inventory and distribution identity; report `synctex` availability;
shell escape as a consented first-class flag; output-directory creation and `TEXINPUTS`.

**P5 — Package recovery. Done.** §10 end to end.

### Verification

Narrow checks during implementation, the full set at handoff, per `AGENTS.md`:

```sh
bun run lint && bun run typecheck && bun run test && bun run build
```

```sh
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml
```

Fixture coverage. Each of these already exists and each is currently a failing case:

| Fixture | Must demonstrate |
| --- | --- |
| `latex-projects/biblatex-biber/` | citations resolve; the run summary names the tool that ran |
| `latex-projects/output-directory/` | the viewer and Reveal PDF resolve to the same file |
| `latex-projects/broken-build/` | a translated diagnostic, a real location, jump-to-source, raw log reachable |
| `latex-projects/nasa-technical-report/` | table of contents and `\ref` resolve; pass progress is visible |
| `latex-projects/large-project/` | an early error survives to the end of a long log; the panel holds geometry |
| `latex-projects/unicode-project/` | non-ASCII paths in diagnostics map to the right file |

New Rust tests: argument construction per profile × bibliography setting; log parsing against
captured `.log` fixtures, one per taxonomy code; deduplication across passes; status
derivation over exit code × PDF freshness × cancel flag × deadline.

Manual, in `bun run tauri dev`: build each fixture; stop a build mid-run and confirm
`cancelled` with a usable `.fdb_latexmk`; rename a `.sty` to force `missing-package` and walk
the install flow; verify the keyboard and screen-reader paths through Problems.
