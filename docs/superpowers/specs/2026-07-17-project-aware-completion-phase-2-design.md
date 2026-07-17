# Project-Aware Completion Phase 2: Project Symbols Design

## Goal

Extend LaTeX completion beyond the active buffer's commands and environments to
the symbols a writer actually cross-references: the `\label{}`s they `\ref{}`,
the bibliography keys they `\cite{}`, and the files they `\input{}` or
`\includegraphics{}`. These symbols are meaningful only inside specific command
arguments, so completion must both recognise an *argument context* and draw its
suggestions from every source in the project, not just the file being edited.

## Scope

- Add source-context detection for a mandatory-argument position: the cursor
  inside `\command{…}`, tolerating an optional `[…]` group before the brace.
- Extract three project-symbol kinds from project sources:
  - labels from `\label{name}`,
  - citation keys from `.bib` entries (`@type{key,`) and `\bibitem{key}`,
  - file references (project-relative paths) for source and image files.
- Offer each symbol kind only in its matching argument commands.
- Scan project sources on demand through a single bounded directory walk,
  reusing the established readable-source traversal bounds, and overlay the
  active file's unsaved buffer over its on-disk copy.
- Extend the completion contract additively: new kinds, a `project` provenance,
  and an optional defining-file `source` field, surfaced in the popup.
- Preserve every Phase 1 behaviour and the existing pure catalog path.

## Non-goals

- Caching, incremental indexing, or Tauri managed state. On-demand scanning is
  the intended correct-but-unoptimised baseline; Phase 3 introduces the index
  and keeps this request path as a fallback.
- Resolving `\graphicspath`, TeX search paths, or the main-file include graph.
  File references are offered as project-root-relative paths.
- Package gating for symbols. A label, key, or file path is valid project data
  in its argument regardless of which packages are declared.
- Network access, external TeX execution, telemetry, or content persistence.

## Architecture

Phase 1 lives in `src-tauri/src/latex_completion.rs` (~770 lines of curated
catalog and logic). Rather than grow that file, the new subsystems become two
focused sibling modules, matching the repository's flat-module convention. Each
has a single responsibility and is testable in isolation.

### `latex_completion.rs` — orchestration and contract

Owns every serialisable type, source-context detection (now including the
`Argument` variant), the Phase 1 catalog path, and the glue that turns resolved
symbols into `CompletionItem` values.

The command resolves the project root as it does today, then delegates:

```rust
fn resolve_completions(root: &Path, request: &CompletionRequest) -> CompletionResponse
```

`resolve_completions` detects the context once and dispatches:

- `None` / `Command` / `BeginEnvironment` / `EndEnvironment` → the unchanged,
  pure Phase 1 catalog path.
- `Argument { command, from, prefix }` → classify the command; if it consumes
  symbols, run one project scan and feed it to the matching extractor, then map
  the results to `CompletionItem` values.

The existing pure `query`/`query_labels` test helpers continue to exercise the
catalog path; an `Argument` context yields no items from the pure path, because
symbol resolution requires the filesystem and is driven by the command.

### `latex_symbols.rs` — pure symbol logic

Holds command-to-symbol-kind classification, the extractors, and prefix
matching, ranking, and de-duplication. It has no filesystem or serialisation
dependency and returns neutral values:

```rust
pub(crate) enum SymbolKind { Label, Citation, File }

pub(crate) struct ResolvedSymbol {
    pub kind: SymbolKind,
    pub label: String,        // shown and inserted (paths already formatted)
    pub source: String,       // defining file's project-relative path
}
```

Extractors operate on in-memory content: `labels_in(content)`,
`bib_keys_in(bib)`, `bibitem_keys_in(content)`. Matching filters by prefix,
ranks exact-prefix first then alphabetically by label, and de-duplicates by
`(kind, label)` so a label defined in two files appears once, with the first
occurrence in deterministic path order winning. Nearly all Phase 2 logic lives
here and is tested on strings.

### `latex_project_scan.rs` — the I/O boundary

Performs one bounded directory walk that reuses the readable-source traversal
pattern (`MAX_FILES`, `MAX_DEPTH`, `MAX_ENTRIES`, skipping symlinks and ignored
names) and returns:

```rust
pub(crate) struct ProjectSources {
    pub files: Vec<PathBuf>,              // every walked file, project-relative
    pub texts: Vec<(PathBuf, String)>,    // .tex/.bib contents, overlay applied
}
```

The **active-buffer overlay**: the file whose project-relative path equals
`request.relative_path` contributes `request.content`, never its on-disk twin,
so unsaved labels and keys complete correctly and stale disk content is never
read for the active file. A new, unsaved active file that is absent on disk is
still represented by its buffer content.

One walk serves two consumers. Label and citation contexts read the `.tex` and
`.bib` texts; file-reference contexts filter `files` by the command's target
extensions and never read image bytes.

## Argument context detection

`completion_context` gains:

```rust
Argument { from: usize, command: String, prefix: String }
```

Detection scans the current line back from the cursor (stopping at an unescaped
`%`, as today). The cursor must sit inside a `{…}` group that follows a
`\command`, optionally with one `[…]` option group between the command and the
brace (for example `\includegraphics[width=5cm]{fi│}`). The prefix is the brace
content from the **last comma** to the cursor, so comma-separated citation lists
complete their final key (`\cite{a, b, cu│}` → prefix `cu`, `from` at `cu`'s
start). Unlike a command prefix, an argument prefix is not restricted to letters:
label names may contain `:`, `-`, and `_`, and paths contain `/` and `.`.

## Symbol kinds, commands, and insertion

| Kind | Argument commands | Symbol source | Inserted text |
| --- | --- | --- | --- |
| Label | `ref eqref pageref autoref cref Cref vref nameref` | `\label{}` across the project | the label name |
| Citation | `cite citep citet citeauthor citeyear textcite parencite footcite nocite autocite` | `.bib` `@type{key,` and `\bibitem{}` | the key |
| File (source) | `input include subfile` | project `.tex` paths | root-relative path without the `.tex` extension |
| File (bib) | `bibliography addbibresource` | project `.bib` paths | root-relative path |
| File (image) | `includegraphics` | `png jpg jpeg pdf eps` paths | root-relative path with extension |

Commands are matched case-sensitively against these curated sets; a command
outside every set produces no suggestions. File paths use forward slashes
regardless of platform.

## Ranking and de-duplication

Symbols rank exact-prefix matches first, then alphabetically by label, and
de-duplicate by `(kind, label)`. This orders results deterministically and
collapses duplicate labels or keys to a single entry. Symbol provenance is
`project`; the `source` field carries the defining file so the popup can name
it.

## Contract additions

All additions are backward-compatible with Phase 1 items.

- `CompletionKind` gains `label`, `citation`, `file`.
- `CompletionProvenance` gains `project`.
- `CompletionItem` gains `source: Option<String>`, the defining file's
  project-relative path (`None` for catalog items).

Frontend (`src/domain/latex-completion.ts`): extend the kind and provenance
string unions, accept an optional `source`, and reject unknown kinds and
provenance as before. `src/features/editor/latex-completion.ts` maps the new
kinds to CodeMirror option types and row badges, and the info panel renders
`Defined in <source>` when `source` is present; the completion-source control
flow is otherwise unchanged.

## Error handling and safety

- Every path is resolved through `ProjectAccess` and the readable-source rules;
  no completion reads outside the approved root, and symlinked components are
  rejected exactly as the source reader already enforces.
- A scan that hits its bounds simply returns fewer suggestions; completion never
  errors because a project is large. Unreadable individual files are skipped.
- Existing stable, user-safe `CompletionError` values are reused; no new
  error surface is introduced.

## Testing

Test-driven throughout, in this order per unit:

- `latex_symbols` (pure, the bulk): label extraction including duplicates;
  citation-key extraction from `.bib` entries and `\bibitem`; comma-separated
  prefix matching; file classification by command; prefix filtering; ranking;
  de-duplication.
- Context detection: `\ref{`, `\cite{a,b,cu`, `\includegraphics[opt]{fi`, empty
  prefix, and comment suppression.
- `latex_project_scan` (temp directories): the active-buffer overlay against a
  stale on-disk copy, labels gathered across two files, `.bib` key discovery,
  and traversal bounds.
- End-to-end command test resolving a temp project through an argument context.
- Frontend: contract parser accepts the new kinds, `project` provenance, and
  optional `source`, and rejects unknown values; the completion source maps a
  label suggestion and still returns `null` in prose.

## Verification

Before handoff, run the checks in `AGENTS.md`: `bun run lint`, `bun run
typecheck`, `bun run build`, `bun run test`, `cargo fmt --check`, `cargo clippy
--all-targets -- -D warnings`, and `cargo test`. Every command must exit
cleanly with no warnings.
