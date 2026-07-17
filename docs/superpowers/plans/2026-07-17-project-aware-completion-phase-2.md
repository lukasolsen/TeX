# Project-Aware Completion Phase 2: Project Symbols Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete LaTeX cross-reference completion by offering project labels, citation keys, and file paths inside their matching command arguments.

**Architecture:** A new `Argument` source-context variant detects the cursor inside `\command{…}`. A pure `latex_symbols` module classifies commands and extracts labels/keys; a `latex_project_scan` module performs one bounded project walk, overlaying the active unsaved buffer over its on-disk copy. The existing `latex_completions` command orchestrates: argument contexts scan and match project symbols, every other context keeps the Phase 1 catalog path. The completion contract gains new kinds, a `project` provenance, and an optional defining-file `source`, surfaced in the popup.

**Tech Stack:** Rust, Tauri 2, Serde, TypeScript strict mode, React 19, CodeMirror 6, Vitest, Bun.

**Design reference:** `docs/superpowers/specs/2026-07-17-project-aware-completion-phase-2-design.md`

## Global Constraints

- Every project path is resolved through `ProjectAccess`; no completion reads outside the approved root, and symlinked path components are rejected exactly as `source_read` already enforces.
- Local-first only: no network, telemetry, external TeX execution, or content persistence.
- No caching or Tauri managed state — on-demand scanning is the intended baseline; the index is Phase 3.
- No package gating for symbols: a label, key, or file path is valid project data in its argument regardless of declared packages.
- All contract additions are backward-compatible with Phase 1 items; the frontend completion-source control flow is otherwise unchanged.
- Use TDD for every behavior change. Intermediate task commits run `cargo test` / `bun run test` (warnings allowed while modules are being wired); only the final task runs `cargo clippy -- -D warnings` and denies warnings.
- File paths in completions use forward slashes on every platform.

## File structure

- `src-tauri/src/latex_completion.rs` — MODIFY. Add the `Argument` context variant and its detection helpers (Task 1); add the new contract types, the `resolve_completions` dispatcher, and symbol-to-item mapping (Task 4).
- `src-tauri/src/latex_symbols.rs` — CREATE. Pure command classification, label/citation extractors, and prefix matching/ranking/dedup (Task 2).
- `src-tauri/src/latex_project_scan.rs` — CREATE. Bounded project walk producing `ProjectSources` with the active-buffer overlay (Task 3).
- `src-tauri/src/project_search.rs` — MODIFY. Make `ignored_name` shareable (Task 3).
- `src-tauri/src/lib.rs` — MODIFY. Register the two new modules (Task 4).
- `src/domain/latex-completion.ts` + `.test.ts` — MODIFY. New kinds, `project` provenance, optional `source` (Task 5).
- `src/features/editor/latex-completion.ts` + `.test.ts` — MODIFY. Kind labels and provenance summary for project symbols (Task 6).

---

### Task 1: Detect the mandatory-argument context

**Files:**
- Modify: `src-tauri/src/latex_completion.rs`

**Interfaces:**
- Consumes: the existing `completion_context(source: &str, position: usize) -> CompletionContext`, `is_escaped`, and `query`.
- Produces: `CompletionContext::Argument { from: usize, command: String, prefix: String }`, detected for a cursor inside `\command{…}` (tolerating one `[…]` option group before the brace), with `prefix` taken from the last comma so citation lists complete their final key. `query` returns no items for an `Argument` context (filesystem resolution arrives in Task 4).

- [ ] **Step 1: Write the failing argument-context tests**

Add these tests inside the existing `mod tests` block in `src-tauri/src/latex_completion.rs` (after `proposes_the_nearest_open_environment_when_ending`):

```rust
#[test]
fn detects_a_reference_argument_with_a_colon_name() {
    assert_eq!(
        completion_context("\\ref{sec:i", 10),
        CompletionContext::Argument {
            command: "ref".into(),
            from: 5,
            prefix: "sec:i".into(),
        }
    );
}

#[test]
fn takes_the_final_key_in_a_citation_list() {
    let source = "\\cite{a, b, cu";
    assert_eq!(
        completion_context(source, source.len()),
        CompletionContext::Argument {
            command: "cite".into(),
            from: source.len() - 2,
            prefix: "cu".into(),
        }
    );
}

#[test]
fn detects_an_argument_after_an_optional_group() {
    let source = "\\includegraphics[width=5cm]{fi";
    assert_eq!(
        completion_context(source, source.len()),
        CompletionContext::Argument {
            command: "includegraphics".into(),
            from: source.len() - 2,
            prefix: "fi".into(),
        }
    );
}

#[test]
fn treats_an_empty_argument_as_a_blank_prefix() {
    assert_eq!(
        completion_context("\\ref{", 5),
        CompletionContext::Argument {
            command: "ref".into(),
            from: 5,
            prefix: String::new(),
        }
    );
}

#[test]
fn suppresses_an_argument_inside_a_comment() {
    assert_eq!(completion_context("% \\ref{se", 9), CompletionContext::None);
}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: the five new tests fail (the `Argument` variant does not exist yet); a compile error on the missing enum variant is the first failure.

- [ ] **Step 3: Add the `Argument` variant and the `query` arm**

In `src-tauri/src/latex_completion.rs`, add the variant to `CompletionContext`:

```rust
#[derive(Clone, Debug, Eq, PartialEq)]
enum CompletionContext {
    None,
    Command { from: usize, prefix: String },
    BeginEnvironment { from: usize, prefix: String },
    EndEnvironment { from: usize, prefix: String },
    Argument { from: usize, command: String, prefix: String },
}
```

In `query`, add an arm so the pure catalog path returns nothing for an argument context (real resolution is added in Task 4). Place it after the `EndEnvironment` arm:

```rust
        CompletionContext::Argument { .. } => Vec::new(),
```

- [ ] **Step 4: Replace the brace branch with a unified brace scanner**

In `completion_context`, delete only the existing block that begins `if name_start > line_start && source[..name_start].ends_with('{') {` through its closing `}` (the `match command { "begin" => …, "end" => …, _ => None }` block). Leave the `let prefix = …` binding and the command-prefix `if` block above it exactly as they are. In place of the deleted block, insert the brace scanner so the tail of the function reads:

```rust
    // (unchanged) the command-prefix block ends here:
    if name_start > line_start && source[..name_start].ends_with('\\') {
        let from = name_start - '\\'.len_utf8();
        if !is_escaped(source, from) {
            return CompletionContext::Command { from, prefix };
        }
    }

    if let Some(brace_open) = enclosing_brace(source, line_start, position) {
        if let Some(command) = owning_command(source, line_start, brace_open) {
            let (from, prefix) = argument_prefix(source, brace_open, position);
            return match command.as_str() {
                "begin" => CompletionContext::BeginEnvironment { from, prefix },
                "end" => CompletionContext::EndEnvironment { from, prefix },
                _ => CompletionContext::Argument { from, command, prefix },
            };
        }
    }

    CompletionContext::None
}
```

Add these helper functions immediately after `completion_context` (above `is_escaped`):

```rust
/// The byte index of the innermost unescaped `{` open at `position` on its line,
/// or `None` when the cursor is not inside a brace group.
fn enclosing_brace(source: &str, line_start: usize, position: usize) -> Option<usize> {
    let mut stack = Vec::new();
    for (offset, character) in source[line_start..position].char_indices() {
        let index = line_start + offset;
        match character {
            '{' if !is_escaped(source, index) => stack.push(index),
            '}' if !is_escaped(source, index) => {
                stack.pop();
            }
            _ => {}
        }
    }
    stack.pop()
}

/// The command name that owns the group opened at `brace_open`, skipping one
/// optional `[…]` group between the command and the brace. `None` when no
/// backslash-prefixed name precedes the group.
fn owning_command(source: &str, line_start: usize, brace_open: usize) -> Option<String> {
    let mut name_end = brace_open;
    if source[line_start..name_end].ends_with(']') {
        name_end = matching_bracket(source, line_start, name_end)?;
    }
    let mut name_start = name_end;
    while name_start > line_start {
        let character = source[..name_start].chars().next_back()?;
        if !character.is_ascii_alphabetic() {
            break;
        }
        name_start -= character.len_utf8();
    }
    if name_start == name_end || !source[..name_start].ends_with('\\') {
        return None;
    }
    let backslash = name_start - '\\'.len_utf8();
    if backslash < line_start || is_escaped(source, backslash) {
        return None;
    }
    Some(source[name_start..name_end].to_owned())
}

/// Given `close` one past a `]`, returns the index of the matching unescaped `[`
/// searching back to `line_start`.
fn matching_bracket(source: &str, line_start: usize, close: usize) -> Option<usize> {
    let mut depth = 0_usize;
    let mut index = close;
    for character in source[line_start..close].chars().rev() {
        index -= character.len_utf8();
        if is_escaped(source, index) {
            continue;
        }
        match character {
            ']' => depth += 1,
            '[' => {
                depth -= 1;
                if depth == 0 {
                    return Some(index);
                }
            }
            _ => {}
        }
    }
    None
}

/// The replacement start and typed prefix inside a brace group, measured from the
/// last comma so comma-separated citation lists complete their final key.
fn argument_prefix(source: &str, brace_open: usize, position: usize) -> (usize, String) {
    let content_start = brace_open + '{'.len_utf8();
    let content = &source[content_start..position];
    let after_comma = content.rfind(',').map_or(0, |index| index + ','.len_utf8());
    let trimmed = content[after_comma..].trim_start();
    (position - trimmed.len(), trimmed.to_owned())
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: all `latex_completion` tests pass, including the five new argument tests and the unchanged Phase 1 environment/command tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/latex_completion.rs
git commit -m "feat: detect LaTeX mandatory-argument completion context"
```

---

### Task 2: Pure project-symbol extraction and matching

**Files:**
- Create: `src-tauri/src/latex_symbols.rs`

**Interfaces:**
- Consumes: nothing beyond `std`.
- Produces:
  - `pub(crate) enum SymbolKind { Label, Citation, File }` (derives `Clone, Copy, Debug, Eq, Hash, PartialEq`).
  - `pub(crate) enum ArgumentTarget { Label, Citation, SourceFile, BibFile, ImageFile }` (derives `Clone, Copy, Debug, Eq, PartialEq`).
  - `pub(crate) struct ResolvedSymbol { pub kind: SymbolKind, pub label: String, pub source: String }` (derives `Clone, Debug, Eq, PartialEq`).
  - `pub(crate) fn classify_command(command: &str) -> Option<ArgumentTarget>`.
  - `pub(crate) fn labels_in(content: &str) -> Vec<String>`.
  - `pub(crate) fn bibitem_keys_in(content: &str) -> Vec<String>`.
  - `pub(crate) fn bib_keys_in(bib: &str) -> Vec<String>`.
  - `pub(crate) fn match_symbols(symbols: Vec<ResolvedSymbol>, prefix: &str) -> Vec<ResolvedSymbol>`.
  - `pub(crate) fn file_extensions(target: ArgumentTarget) -> &'static [&'static str]`.
  - `pub(crate) fn format_file_label(relative: &str, target: ArgumentTarget) -> String`.

- [ ] **Step 1: Write the failing pure-logic tests**

Create `src-tauri/src/latex_symbols.rs` with only the test module first, so the file exists and the tests name every symbol the module must export:

```rust
#[cfg(test)]
mod tests {
    use super::{
        bib_keys_in, bibitem_keys_in, classify_command, format_file_label, labels_in,
        match_symbols, ArgumentTarget, ResolvedSymbol, SymbolKind,
    };

    #[test]
    fn extracts_labels_including_colon_names() {
        assert_eq!(
            labels_in("text \\label{sec:intro} more \\label{fig:plot}"),
            vec!["sec:intro", "fig:plot"]
        );
    }

    #[test]
    fn ignores_a_command_longer_than_label() {
        assert!(labels_in("\\labelfoo{x}").is_empty());
    }

    #[test]
    fn extracts_bibtex_and_bibitem_keys() {
        assert_eq!(bib_keys_in("@article{knuth1984,\n  title = {x}\n}"), vec!["knuth1984"]);
        assert_eq!(
            bibitem_keys_in("\\bibitem{lamport1994} x \\bibitem[LT]{knuth1984} y"),
            vec!["lamport1994", "knuth1984"]
        );
    }

    #[test]
    fn skips_bibtex_string_and_comment_entries() {
        assert!(bib_keys_in("@string{pub = {ACM}}\n@comment{ignore me}").is_empty());
    }

    #[test]
    fn classifies_commands_to_their_targets() {
        assert_eq!(classify_command("eqref"), Some(ArgumentTarget::Label));
        assert_eq!(classify_command("citep"), Some(ArgumentTarget::Citation));
        assert_eq!(classify_command("input"), Some(ArgumentTarget::SourceFile));
        assert_eq!(classify_command("includegraphics"), Some(ArgumentTarget::ImageFile));
        assert_eq!(classify_command("section"), None);
    }

    #[test]
    fn filters_ranks_and_deduplicates_matches() {
        let symbols = vec![
            ResolvedSymbol { kind: SymbolKind::Label, label: "sec:intro".into(), source: "b.tex".into() },
            ResolvedSymbol { kind: SymbolKind::Label, label: "sec".into(), source: "a.tex".into() },
            ResolvedSymbol { kind: SymbolKind::Label, label: "sec:intro".into(), source: "a.tex".into() },
            ResolvedSymbol { kind: SymbolKind::Label, label: "other".into(), source: "a.tex".into() },
        ];
        let matched: Vec<(String, String)> = match_symbols(symbols, "sec")
            .into_iter()
            .map(|symbol| (symbol.label, symbol.source))
            .collect();
        assert_eq!(
            matched,
            vec![
                ("sec".to_owned(), "a.tex".to_owned()),
                ("sec:intro".to_owned(), "a.tex".to_owned()),
            ]
        );
    }

    #[test]
    fn formats_file_labels_by_target() {
        assert_eq!(
            format_file_label("chapters/intro.tex", ArgumentTarget::SourceFile),
            "chapters/intro"
        );
        assert_eq!(
            format_file_label("figures/plot.png", ArgumentTarget::ImageFile),
            "figures/plot.png"
        );
    }
}
```

Register the module so the tests compile. In `src-tauri/src/lib.rs`, add `mod latex_symbols;` in alphabetical position immediately after the `mod latex_fixtures;` line.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_symbols`

Expected: compilation failure — the referenced items do not exist yet.

- [ ] **Step 3: Implement the pure symbol module**

Prepend the implementation above the `mod tests` block in `src-tauri/src/latex_symbols.rs`:

```rust
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum SymbolKind {
    Label,
    Citation,
    File,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ArgumentTarget {
    Label,
    Citation,
    SourceFile,
    BibFile,
    ImageFile,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ResolvedSymbol {
    pub kind: SymbolKind,
    pub label: String,
    pub source: String,
}

/// Maps a command name to the project symbol its mandatory argument consumes.
pub(crate) fn classify_command(command: &str) -> Option<ArgumentTarget> {
    match command {
        "ref" | "eqref" | "pageref" | "autoref" | "cref" | "Cref" | "vref" | "nameref" => {
            Some(ArgumentTarget::Label)
        }
        "cite" | "citep" | "citet" | "citeauthor" | "citeyear" | "textcite" | "parencite"
        | "footcite" | "nocite" | "autocite" => Some(ArgumentTarget::Citation),
        "input" | "include" | "subfile" => Some(ArgumentTarget::SourceFile),
        "bibliography" | "addbibresource" => Some(ArgumentTarget::BibFile),
        "includegraphics" => Some(ArgumentTarget::ImageFile),
        _ => None,
    }
}

/// Label names defined by `\label{name}` in one source's content.
pub(crate) fn labels_in(content: &str) -> Vec<String> {
    command_arguments(content, "\\label", false)
}

/// Citation keys defined by `\bibitem{key}` or `\bibitem[mark]{key}` in .tex content.
pub(crate) fn bibitem_keys_in(content: &str) -> Vec<String> {
    command_arguments(content, "\\bibitem", true)
}

/// Citation keys from BibTeX/biblatex entries (`@type{key,`), ignoring the
/// non-reference `@string`, `@preamble`, and `@comment` entry types.
pub(crate) fn bib_keys_in(bib: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for (at, _) in bib.match_indices('@') {
        let rest = &bib[at + '@'.len_utf8()..];
        let type_len = rest
            .find(|character: char| !character.is_ascii_alphabetic())
            .unwrap_or(rest.len());
        if type_len == 0 {
            continue;
        }
        let entry_type = rest[..type_len].to_ascii_lowercase();
        if matches!(entry_type.as_str(), "string" | "preamble" | "comment") {
            continue;
        }
        let Some(after_brace) = rest[type_len..].trim_start().strip_prefix('{') else {
            continue;
        };
        let end = after_brace
            .find(|character: char| character == ',' || character == '}' || character.is_whitespace())
            .unwrap_or(after_brace.len());
        let key = after_brace[..end].trim();
        if !key.is_empty() {
            keys.push(key.to_owned());
        }
    }
    keys
}

/// Filters symbols to those whose label starts with `prefix`, orders an exact
/// match first then alphabetically by label and source, and drops duplicate
/// `(kind, label)` pairs keeping the best-ranked occurrence.
pub(crate) fn match_symbols(mut symbols: Vec<ResolvedSymbol>, prefix: &str) -> Vec<ResolvedSymbol> {
    symbols.retain(|symbol| symbol.label.starts_with(prefix));
    symbols.sort_by(|left, right| {
        let left_exact = left.label == prefix;
        let right_exact = right.label == prefix;
        right_exact
            .cmp(&left_exact)
            .then_with(|| left.label.cmp(&right.label))
            .then_with(|| left.source.cmp(&right.source))
    });
    let mut seen = HashSet::new();
    symbols.retain(|symbol| seen.insert((symbol.kind, symbol.label.clone())));
    symbols
}

/// The file extensions a file-reference argument accepts, lowercased.
pub(crate) fn file_extensions(target: ArgumentTarget) -> &'static [&'static str] {
    match target {
        ArgumentTarget::SourceFile => &["tex"],
        ArgumentTarget::BibFile => &["bib"],
        ArgumentTarget::ImageFile => &["png", "jpg", "jpeg", "pdf", "eps"],
        ArgumentTarget::Label | ArgumentTarget::Citation => &[],
    }
}

/// Formats a project-relative path for insertion: forward slashes throughout,
/// and no `.tex` suffix for `\input`-style source commands.
pub(crate) fn format_file_label(relative: &str, target: ArgumentTarget) -> String {
    let slashed = relative.replace('\\', "/");
    match target {
        ArgumentTarget::SourceFile => {
            slashed.strip_suffix(".tex").unwrap_or(&slashed).to_owned()
        }
        _ => slashed,
    }
}

/// The braced argument of each `command` occurrence, requiring a word boundary
/// after the command name and accepting one optional `[…]` group when
/// `allow_optional` is set.
fn command_arguments(content: &str, command: &str, allow_optional: bool) -> Vec<String> {
    content
        .match_indices(command)
        .filter_map(|(start, _)| {
            let after = start + command.len();
            match content[after..].chars().next() {
                Some(character) if character.is_ascii_alphabetic() => None,
                _ => braced_argument(&content[after..], allow_optional),
            }
        })
        .collect()
}

/// The content of a `{…}` group that follows optional whitespace and, when
/// `allow_optional` is set, one `[…]` group.
fn braced_argument(rest: &str, allow_optional: bool) -> Option<String> {
    let rest = rest.trim_start();
    let rest = if allow_optional && rest.starts_with('[') {
        rest[rest.find(']')? + ']'.len_utf8()..].trim_start()
    } else {
        rest
    };
    let inner = rest.strip_prefix('{')?;
    let close = inner.find('}')?;
    let value = inner[..close].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_owned())
    }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_symbols`

Expected: all seven `latex_symbols` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/latex_symbols.rs src-tauri/src/lib.rs
git commit -m "feat: extract and rank LaTeX project symbols"
```

---

### Task 3: Bounded project scan with active-buffer overlay

**Files:**
- Create: `src-tauri/src/latex_project_scan.rs`
- Modify: `src-tauri/src/project_search.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `crate::source_read::{read_source, valid_relative_path}`, `crate::project_search::ignored_name`.
- Produces:
  - `pub(crate) struct ProjectSources { pub files: Vec<PathBuf>, pub texts: Vec<(PathBuf, String)> }` — `files` is every walked file (project-relative, including images); `texts` is the `.tex`/`.bib` contents with the overlay applied.
  - `pub(crate) fn scan_project(root: &Path, active_relative: &Path, active_content: &str) -> ProjectSources`.

- [ ] **Step 1: Share the traversal ignore-policy**

In `src-tauri/src/project_search.rs`, change the signature `fn ignored_name(name: &std::ffi::OsStr) -> bool {` to `pub(crate) fn ignored_name(name: &std::ffi::OsStr) -> bool {`. Make no other change.

- [ ] **Step 2: Write the failing scan tests**

Create `src-tauri/src/latex_project_scan.rs` with the test module first:

```rust
#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::scan_project;

    fn temp_root(tag: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("tex-scan-{tag}-{unique}"));
        fs::create_dir(&root).expect("create temp root");
        root
    }

    #[test]
    fn overlays_the_active_buffer_over_stale_disk() {
        let root = temp_root("overlay");
        fs::write(root.join("main.tex"), "\\label{old}").expect("write");
        let sources = scan_project(&root, Path::new("main.tex"), "\\label{new}");
        let text = sources
            .texts
            .iter()
            .find(|(path, _)| path == Path::new("main.tex"))
            .map(|(_, content)| content.as_str())
            .expect("active text present");
        assert!(text.contains("new"));
        assert!(!text.contains("old"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn represents_an_unsaved_active_file_absent_on_disk() {
        let root = temp_root("unsaved");
        let sources = scan_project(&root, Path::new("draft.tex"), "\\label{fresh}");
        assert!(sources.files.iter().any(|path| path == Path::new("draft.tex")));
        assert!(sources
            .texts
            .iter()
            .any(|(path, content)| path == Path::new("draft.tex") && content.contains("fresh")));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn gathers_files_and_texts_across_the_tree() {
        let root = temp_root("tree");
        fs::create_dir(root.join("chapters")).expect("subdir");
        fs::write(root.join("refs.bib"), "@book{key,}").expect("bib");
        fs::write(root.join("chapters/intro.tex"), "\\label{sec:intro}").expect("tex");
        fs::write(root.join("plot.png"), [0x89_u8, 0x50, 0x4e, 0x47]).expect("png");
        let sources = scan_project(&root, Path::new("main.tex"), "");

        assert!(sources.files.iter().any(|path| path == Path::new("plot.png")));
        assert!(sources
            .texts
            .iter()
            .any(|(path, _)| path == Path::new("chapters/intro.tex")));
        assert!(sources
            .texts
            .iter()
            .any(|(path, content)| path == Path::new("refs.bib") && content.contains("key")));
        assert!(!sources
            .texts
            .iter()
            .any(|(path, _)| path == Path::new("plot.png")));
        fs::remove_dir_all(root).ok();
    }
}
```

Register the module: in `src-tauri/src/lib.rs`, add `mod latex_project_scan;` in alphabetical position immediately after the `mod latex_fixtures;` line (above `mod latex_symbols;`).

- [ ] **Step 3: Run the tests and verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_project_scan`

Expected: compilation failure — `scan_project` and `ProjectSources` do not exist yet.

- [ ] **Step 4: Implement the bounded scan and overlay**

Prepend the implementation above the `mod tests` block in `src-tauri/src/latex_project_scan.rs`:

```rust
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::project_search::ignored_name;
use crate::source_read::{read_source, valid_relative_path};

const MAX_SCAN_FILES: usize = 2_048;
const MAX_SCAN_ENTRIES: usize = 4_096;
const MAX_SCAN_DEPTH: usize = 32;

pub(crate) struct ProjectSources {
    pub files: Vec<PathBuf>,
    pub texts: Vec<(PathBuf, String)>,
}

/// Walks the project once (bounded, skipping symlinks and ignored directories),
/// then reads `.tex`/`.bib` contents with the active file's unsaved buffer
/// overlaid over its on-disk copy. A new active file absent on disk is still
/// represented by its buffer.
pub(crate) fn scan_project(
    root: &Path,
    active_relative: &Path,
    active_content: &str,
) -> ProjectSources {
    let mut files = Vec::new();
    let mut entries = 0_usize;
    collect(root, 0, &mut entries, &mut files);

    if valid_relative_path(active_relative) && !files.iter().any(|path| path == active_relative) {
        files.push(active_relative.to_path_buf());
    }

    let mut texts = Vec::new();
    for relative in &files {
        if !is_text_source(relative) {
            continue;
        }
        let content = if relative == active_relative {
            active_content.to_owned()
        } else {
            match read_source(root, relative) {
                Ok(document) => document.content,
                Err(_) => continue,
            }
        };
        texts.push((relative.clone(), content));
    }

    ProjectSources { files, texts }
}

fn collect(root: &Path, depth: usize, entries: &mut usize, files: &mut Vec<PathBuf>) {
    collect_dir(root, root, depth, entries, files);
}

fn collect_dir(
    root: &Path,
    directory: &Path,
    depth: usize,
    entries: &mut usize,
    files: &mut Vec<PathBuf>,
) {
    if files.len() >= MAX_SCAN_FILES || depth > MAX_SCAN_DEPTH {
        return;
    }
    let Ok(read) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in read.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() || ignored_name(&entry.file_name()) {
            continue;
        }
        *entries += 1;
        if *entries > MAX_SCAN_ENTRIES {
            return;
        }
        if file_type.is_dir() {
            collect_dir(root, &entry.path(), depth + 1, entries, files);
        } else if file_type.is_file() {
            if let Ok(relative) = entry.path().strip_prefix(root) {
                files.push(relative.to_path_buf());
            }
        }
        if files.len() >= MAX_SCAN_FILES {
            return;
        }
    }
}

fn is_text_source(path: &Path) -> bool {
    matches!(
        path.extension().and_then(OsStr::to_str).map(str::to_ascii_lowercase).as_deref(),
        Some("tex") | Some("bib")
    )
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_project_scan`

Expected: all three scan tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/latex_project_scan.rs src-tauri/src/project_search.rs src-tauri/src/lib.rs
git commit -m "feat: scan project sources with an active-buffer overlay"
```

---

### Task 4: Resolve project symbols in the completion command

**Files:**
- Modify: `src-tauri/src/latex_completion.rs`

**Interfaces:**
- Consumes: `CompletionContext::Argument` (Task 1); `latex_symbols::{classify_command, labels_in, bibitem_keys_in, bib_keys_in, match_symbols, file_extensions, format_file_label, ArgumentTarget, ResolvedSymbol, SymbolKind}` (Task 2); `latex_project_scan::{scan_project, ProjectSources}` (Task 3).
- Produces: `CompletionItem` values now carry a `source: Option<String>` field and may have kind `Label`/`Citation`/`File` and provenance `Project`; the command routes through `resolve_completions(root: &Path, request: &CompletionRequest) -> CompletionResponse`. The serialized contract adds kinds `"label"`, `"citation"`, `"file"`, provenance `"project"`, and an optional `"source"` string.

- [ ] **Step 1: Write the failing end-to-end test**

Add this test inside the existing `mod tests` block in `src-tauri/src/latex_completion.rs`, and add the imports it needs to the module's `use super::…` line (extend it to include `resolve_completions` and `CompletionRequest`):

```rust
#[test]
fn completes_a_project_label_inside_a_ref_argument() {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("tex-completion-ref-{unique}"));
    fs::create_dir(&root).expect("create temp root");
    fs::write(root.join("intro.tex"), "\\label{sec:intro}\n").expect("write source");
    let canonical = root.canonicalize().expect("canonical root");

    let request = CompletionRequest {
        project_path: canonical.to_string_lossy().into_owned(),
        relative_path: "main.tex".into(),
        content: "\\ref{sec".into(),
        position: 8,
    };
    let response = resolve_completions(&canonical, &request);

    assert_eq!(response.items[0].label, "sec:intro");
    assert_eq!(response.items[0].source.as_deref(), Some("intro.tex"));
    assert!(matches!(response.items[0].provenance, CompletionProvenance::Project));

    fs::remove_dir_all(root).ok();
}
```

Extend the test import to (add `CompletionProvenance` too):

```rust
    use super::{
        completion_context, resolve_completions, query, query_labels, CompletionContext,
        CompletionProvenance, CompletionRequest,
    };
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion::tests::completes_a_project_label`

Expected: compilation failure — `resolve_completions`, the `source` field, and the new enum variants do not exist yet.

- [ ] **Step 3: Extend the contract types**

In `src-tauri/src/latex_completion.rs`, add the module imports near the top (below the existing `use crate::{project_access::ProjectAccess, source_read};` line):

```rust
use crate::latex_project_scan::{scan_project, ProjectSources};
use crate::latex_symbols::{
    bib_keys_in, bibitem_keys_in, classify_command, file_extensions, format_file_label, labels_in,
    match_symbols, ArgumentTarget, ResolvedSymbol, SymbolKind,
};
use std::path::Path;
```

Add the `source` field to `CompletionItem` (after `insert_text`):

```rust
    insert_text: String,
    /// The project-relative file that defines a project symbol, so the editor can
    /// name its origin; `None` for catalog items and for file suggestions.
    source: Option<String>,
```

Extend `CompletionKind`:

```rust
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum CompletionKind {
    Command,
    Environment,
    Snippet,
    Label,
    Citation,
    File,
}
```

Extend `CompletionProvenance`:

```rust
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum CompletionProvenance {
    Core,
    Package,
    Local,
    Project,
}
```

In the `item(...)` helper, add `source: None` to the returned struct literal so every catalog item keeps the field:

```rust
    CompletionItem {
        label,
        detail,
        kind,
        provenance,
        requires,
        from,
        to,
        insert_text,
        source: None,
    }
```

- [ ] **Step 4: Add the orchestrator and symbol mapping**

In `src-tauri/src/latex_completion.rs`, add these functions after `query` (and before `query_labels`):

```rust
fn resolve_completions(root: &Path, request: &CompletionRequest) -> CompletionResponse {
    match completion_context(&request.content, request.position) {
        CompletionContext::Argument { from, command, prefix } => CompletionResponse {
            items: symbol_items(root, request, &command, from, request.position, &prefix),
        },
        _ => query(&request.content, request.position),
    }
}

fn symbol_items(
    root: &Path,
    request: &CompletionRequest,
    command: &str,
    from: usize,
    to: usize,
    prefix: &str,
) -> Vec<CompletionItem> {
    let Some(target) = classify_command(command) else {
        return Vec::new();
    };
    let sources = scan_project(root, Path::new(&request.relative_path), &request.content);
    let resolved = match target {
        ArgumentTarget::Label => text_symbols(&sources, SymbolKind::Label, labels_in),
        ArgumentTarget::Citation => citation_symbols(&sources),
        ArgumentTarget::SourceFile | ArgumentTarget::BibFile | ArgumentTarget::ImageFile => {
            file_symbols(&sources, target)
        }
    };
    match_symbols(resolved, prefix)
        .into_iter()
        .map(|symbol| symbol_item(symbol, from, to))
        .collect()
}

fn text_symbols(
    sources: &ProjectSources,
    kind: SymbolKind,
    extract: fn(&str) -> Vec<String>,
) -> Vec<ResolvedSymbol> {
    sources
        .texts
        .iter()
        .flat_map(|(path, content)| {
            let source = path.to_string_lossy().replace('\\', "/");
            extract(content)
                .into_iter()
                .map(move |label| ResolvedSymbol { kind, label, source: source.clone() })
        })
        .collect()
}

fn citation_symbols(sources: &ProjectSources) -> Vec<ResolvedSymbol> {
    sources
        .texts
        .iter()
        .flat_map(|(path, content)| {
            let source = path.to_string_lossy().replace('\\', "/");
            let is_bib = path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"));
            let keys = if is_bib { bib_keys_in(content) } else { bibitem_keys_in(content) };
            keys.into_iter().map(move |label| ResolvedSymbol {
                kind: SymbolKind::Citation,
                label,
                source: source.clone(),
            })
        })
        .collect()
}

fn file_symbols(sources: &ProjectSources, target: ArgumentTarget) -> Vec<ResolvedSymbol> {
    let extensions = file_extensions(target);
    sources
        .files
        .iter()
        .filter_map(|path| {
            let extension = path
                .extension()
                .and_then(|extension| extension.to_str())?
                .to_ascii_lowercase();
            if !extensions.contains(&extension.as_str()) {
                return None;
            }
            let relative = path.to_string_lossy();
            Some(ResolvedSymbol {
                kind: SymbolKind::File,
                label: format_file_label(&relative, target),
                source: relative.replace('\\', "/"),
            })
        })
        .collect()
}

fn symbol_item(symbol: ResolvedSymbol, from: usize, to: usize) -> CompletionItem {
    let (kind, detail) = match symbol.kind {
        SymbolKind::Label => (CompletionKind::Label, "Cross-reference label."),
        SymbolKind::Citation => (CompletionKind::Citation, "Bibliography entry."),
        SymbolKind::File => (CompletionKind::File, "Project file."),
    };
    let source = match symbol.kind {
        SymbolKind::File => None,
        SymbolKind::Label | SymbolKind::Citation => Some(symbol.source),
    };
    CompletionItem {
        label: symbol.label.clone(),
        detail,
        kind,
        provenance: CompletionProvenance::Project,
        requires: None,
        from,
        to,
        insert_text: symbol.label,
        source,
    }
}
```

- [ ] **Step 5: Route the command through the orchestrator**

In the `latex_completions` command, capture the resolved root and dispatch through `resolve_completions`. Replace the body from `access` through the final `Ok(...)`:

```rust
    let root = access
        .resolve(&request.project_path)
        .map_err(|_| unavailable())?;
    let relative = std::path::Path::new(&request.relative_path);
    if !source_read::valid_relative_path(relative) || !source_read::is_readable_source(relative) {
        return Err(unavailable());
    }
    if request.content.len() > source_read::MAX_SOURCE_BYTES as usize {
        return Err(unavailable());
    }
    Ok(resolve_completions(&root, &request))
```

- [ ] **Step 6: Run the completion tests and verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: every `latex_completion` test passes, including `completes_a_project_label_inside_a_ref_argument` and the unchanged Phase 1 tests.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/latex_completion.rs
git commit -m "feat: resolve LaTeX project symbols in completion command"
```

---

### Task 5: Extend the frontend completion contract

**Files:**
- Modify: `src/domain/latex-completion.ts`
- Modify: `src/domain/latex-completion.test.ts`

**Interfaces:**
- Consumes: the camel-cased `CompletionResponse` from Task 4, now with `kind` values `label`/`citation`/`file`, provenance `project`, and an optional `source` string.
- Produces: `LatexCompletionKind` and `LatexCompletionProvenance` gain the new members; `LatexCompletionItem` gains `source: string | null`; `parseLatexCompletionResponse` accepts and validates them.

- [ ] **Step 1: Write the failing contract tests**

Add these tests inside the `describe("LaTeX completion contract", …)` block in `src/domain/latex-completion.test.ts`:

```ts
it("parses a project label with its defining file", () => {
  expect(
    parseLatexCompletionResponse({
      items: [
        {
          label: "sec:intro",
          detail: "Cross-reference label.",
          kind: "label",
          provenance: "project",
          requires: null,
          source: "intro.tex",
          from: 5,
          to: 8,
          insertText: "sec:intro",
        },
      ],
    })
  ).toMatchObject({
    items: [{ kind: "label", provenance: "project", source: "intro.tex" }],
  })
})

it("parses a file suggestion with no defining source", () => {
  expect(
    parseLatexCompletionResponse({
      items: [
        {
          label: "figures/plot.png",
          detail: "Project file.",
          kind: "file",
          provenance: "project",
          requires: null,
          source: null,
          from: 0,
          to: 2,
          insertText: "figures/plot.png",
        },
      ],
    })
  ).toMatchObject({ items: [{ kind: "file", source: null }] })
})

it("rejects a completion with an unknown kind", () => {
  expect(() =>
    parseLatexCompletionResponse({
      items: [
        {
          label: "x",
          detail: "x",
          kind: "gremlin",
          provenance: "core",
          requires: null,
          source: null,
          from: 0,
          to: 1,
          insertText: "x",
        },
      ],
    })
  ).toThrow()
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test src/domain/latex-completion.test.ts`

Expected: the "project label" and "file suggestion" tests fail (unknown kind/provenance rejected), and the response type lacks `source`.

- [ ] **Step 3: Extend the types and parser**

In `src/domain/latex-completion.ts`, widen the unions:

```ts
export type LatexCompletionKind =
  | "command"
  | "environment"
  | "snippet"
  | "label"
  | "citation"
  | "file"
export type LatexCompletionProvenance =
  | "core"
  | "package"
  | "local"
  | "project"
```

Add `source` to the item type (after `insertText`):

```ts
  insertText: string
  source: string | null
```

In `parseLatexCompletionResponse`, extend the `kind` and `provenance` allowed lists and parse `source`. The returned object becomes:

```ts
      return {
        label: nonEmptyString(item.label, "LaTeX completion label", 512),
        detail: stringValue(item.detail, "LaTeX completion detail", 4_096),
        kind: enumValue(item.kind, "LaTeX completion kind", [
          "command",
          "environment",
          "snippet",
          "label",
          "citation",
          "file",
        ]),
        provenance: enumValue(item.provenance, "LaTeX completion provenance", [
          "core",
          "package",
          "local",
          "project",
        ]),
        requires: nullableString(item.requires, "LaTeX completion requirement", 128),
        from,
        to,
        insertText: nonEmptyString(item.insertText, "LaTeX completion insertion", 16_384),
        source: nullableString(item.source ?? null, "LaTeX completion source", 1_024),
      }
```

(`item.source ?? null` treats an absent field as `null`, keeping Phase 1 fixtures that omit `source` valid.)

- [ ] **Step 4: Run the contract test and typecheck**

Run: `bun run test src/domain/latex-completion.test.ts && bun run typecheck`

Expected: all contract tests pass and TypeScript typechecks.

- [ ] **Step 5: Commit**

```bash
git add src/domain/latex-completion.ts src/domain/latex-completion.test.ts
git commit -m "feat: accept LaTeX project symbols in completion contract"
```

---

### Task 6: Present project symbols in the editor popup

**Files:**
- Modify: `src/features/editor/latex-completion.ts`
- Modify: `src/features/editor/latex-completion.test.ts`

**Interfaces:**
- Consumes: the `LatexCompletionItem` type with new kinds, `project` provenance, and `source` from Task 5.
- Produces: `latexCompletionKindLabel` names the new kinds; `latexCompletionSourceSummary` attributes a project symbol to its file. The completion source, option mapping, and info panel are otherwise unchanged — they already read `item.kind`, `item.provenance`, and (now) `item.source`.

- [ ] **Step 1: Write the failing presentation tests**

Add these tests to `src/features/editor/latex-completion.test.ts` inside the `describe("LaTeX completion presentation", …)` block:

```ts
it("names the project-symbol kinds", () => {
  expect(latexCompletionKindLabel("label")).toBe("Label")
  expect(latexCompletionKindLabel("citation")).toBe("Citation")
  expect(latexCompletionKindLabel("file")).toBe("File")
})

it("attributes a project symbol to its defining file", () => {
  expect(
    latexCompletionSourceSummary({
      provenance: "project",
      requires: null,
      source: "intro.tex",
    })
  ).toBe("Defined in intro.tex")
  expect(
    latexCompletionSourceSummary({
      provenance: "project",
      requires: null,
      source: null,
    })
  ).toBe("A file in this project")
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `bun run test src/features/editor/latex-completion.test.ts`

Expected: the two new tests fail — `latexCompletionKindLabel` returns `null` for the new kinds and `latexCompletionSourceSummary` does not handle `project`.

- [ ] **Step 3: Extend the presentation helpers**

In `src/features/editor/latex-completion.ts`, extend `KIND_LABELS`:

```ts
const KIND_LABELS: Record<LatexCompletionKind, string> = {
  command: "Command",
  environment: "Environment",
  snippet: "Template",
  label: "Label",
  citation: "Citation",
  file: "File",
}
```

Replace `latexCompletionKindLabel` so it covers every kind by construction:

```ts
/** Plain-language name for a completion kind, or `null` for an unrecognized value. */
export function latexCompletionKindLabel(kind: string): string | null {
  return kind in KIND_LABELS ? KIND_LABELS[kind as LatexCompletionKind] : null
}
```

Extend `latexCompletionSourceSummary` to accept an optional `source` and handle `project`:

```ts
/** A sentence explaining where a suggestion comes from, avoiding LaTeX jargon. */
export function latexCompletionSourceSummary(
  item: Pick<LatexCompletionItem, "provenance" | "requires"> & {
    readonly source?: string | null
  }
): string {
  switch (item.provenance) {
    case "local":
      return "Defined in this project"
    case "package":
      return item.requires
        ? `Provided by the ${item.requires} package`
        : "Provided by a loaded package"
    case "core":
      return "Built into LaTeX"
    case "project":
      return item.source ? `Defined in ${item.source}` : "A file in this project"
  }
}
```

- [ ] **Step 4: Run the focused tests and typecheck**

Run: `bun run test src/features/editor/latex-completion.test.ts && bun run typecheck`

Expected: all completion-source tests pass and TypeScript typechecks. (`renderInfo` already calls `latexCompletionSourceSummary(item)` with the full item, so the defining-file line appears with no further change.)

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-completion.ts src/features/editor/latex-completion.test.ts
git commit -m "feat: attribute LaTeX project symbols in completion popup"
```

---

### Task 7: Verify Phase 2 end to end

**Files:**
- Modify only files required by failed checks.

**Interfaces:**
- Consumes: the complete Phase 2 implementation.
- Produces: a verified, reviewable increment with every required check passing and no warnings.

- [ ] **Step 1: Run formatting and all required verification**

Run:

```bash
bun run lint
bun run typecheck
bun run build
bun run test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits successfully with no warnings. If `bun run test` reports jsdom worker errors of the form `LRUCache is not a constructor`, the `node_modules` install has drifted from `bun.lock`; run `bun install` once (it does not modify the lockfile) and re-run the suite.

- [ ] **Step 2: Inspect the final diff for scope and safety**

Run: `git diff --check master...HEAD && git diff --stat master...HEAD && git status --short`

Expected: no whitespace errors, no generated files, no lockfile edits, and only completion-related source, tests, spec, and plan changes.

- [ ] **Step 3: Commit any verification-only corrections deliberately**

If verification requires source corrections, stage each corrected file by its explicit path and commit with `git commit -m "fix: harden LaTeX project-symbol completion"`. Otherwise, do not create an empty commit.

## Self-review notes

- **Spec coverage:** argument context (Task 1); label/citation/file extractors and command-gated exposure (Tasks 2, 4); project scan with overlay and duplicate handling (Tasks 2, 3); contract additions and defining-file surfacing (Tasks 5, 6); bounds/safety reuse of `ProjectAccess`/`source_read` (Tasks 3, 4); verification against `AGENTS.md` (Task 7). No caching is introduced, matching the Phase 3 boundary.
- **Type consistency:** `SymbolKind`, `ArgumentTarget`, and `ResolvedSymbol` are defined in Task 2 and consumed with identical signatures in Task 4; `scan_project`/`ProjectSources` defined in Task 3 and consumed in Task 4; the serialized kind/provenance/source strings introduced in Task 4 match the parser unions in Task 5 and the presentation maps in Task 6.
