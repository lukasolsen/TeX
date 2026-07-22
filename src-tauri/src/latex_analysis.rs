//! Project-wide LaTeX analysis: the conclusions that need every file in view.
//!
//! `latex_scan` says where a file names a symbol. This module decides what that
//! means for the project — whether a `\ref` resolves anywhere, whether a key is
//! defined twice, and where a symbol's definition and uses live.
//!
//! Every conclusion here is guarded so that uncertainty produces silence. If
//! the scan could not see the whole project, if a macro builds label or
//! citation keys where a textual scan cannot follow, or if the project has no
//! symbols of that kind at all, the corresponding check reports nothing. A
//! false "undefined reference" trains users to ignore the gutter, which costs
//! more than the missed true positive.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::latex_project_scan::{scan_project_cached, ProjectSources, ScanCache};
use crate::latex_scan::{scan_bib, scan_latex, MacroFacts, Occurrence, Role};
use crate::{project_access::ProjectAccess, source_read};

/// Ceiling on locations returned for one symbol, so a key cited a thousand
/// times cannot produce an unbounded IPC payload.
const MAX_LOCATIONS: usize = 500;
/// Ceiling on diagnostics for one file, so a badly broken document reports its
/// first problems rather than thousands of derived ones.
const MAX_DIAGNOSTICS: usize = 200;
/// Ceiling on the source line echoed back with a location.
const MAX_PREVIEW: usize = 200;

const IMAGE_EXTENSIONS: &[&str] = &["pdf", "png", "jpg", "jpeg", "eps", "svg", "ps"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRequest {
    project_path: String,
    relative_path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SymbolRequest {
    project_path: String,
    relative_path: String,
    content: String,
    /// 1-based line of the cursor in the active buffer.
    line: u32,
    /// 1-based column of the cursor, in UTF-16 code units.
    column: u32,
}

/// A span in a file, addressed by line and column rather than byte offset so
/// the editor can map it onto its own document without agreeing on an encoding.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    line: u32,
    column: u32,
    end_line: u32,
    end_column: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    code: &'static str,
    severity: &'static str,
    message: String,
    #[serde(flatten)]
    span: Span,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResponse {
    diagnostics: Vec<Diagnostic>,
    /// False when a ceiling or an unreadable file stopped the project scan, so
    /// the editor can explain that the result is partial instead of implying a
    /// clean bill of health.
    complete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolLocation {
    path: String,
    #[serde(flatten)]
    span: Span,
    /// The trimmed source line, for a result list the user can read.
    preview: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolResponse {
    /// `None` when the cursor is not on a resolvable symbol.
    symbol: Option<SymbolInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolInfo {
    name: String,
    kind: &'static str,
    definitions: Vec<SymbolLocation>,
    references: Vec<SymbolLocation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisError {
    code: &'static str,
    message: &'static str,
}

fn unavailable() -> AnalysisError {
    AnalysisError {
        code: "analysis-unavailable",
        message: "TeX could not analyse this project. Your files were not changed.",
    }
}

/// Byte offsets of each line start, for converting between offsets and the
/// line/column addressing the editor uses.
struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    fn new(text: &str) -> Self {
        let mut starts = vec![0_usize];
        starts.extend(
            text.match_indices('\n')
                .map(|(offset, _)| offset + '\n'.len_utf8()),
        );
        Self { starts }
    }

    fn line_of(&self, offset: usize) -> usize {
        match self.starts.binary_search(&offset) {
            Ok(index) => index,
            Err(index) => index.saturating_sub(1),
        }
    }

    /// The 1-based line and UTF-16 column of `offset`.
    fn position(&self, text: &str, offset: usize) -> (u32, u32) {
        let line = self.line_of(offset);
        let start = self.starts.get(line).copied().unwrap_or(0);
        let column = text
            .get(start..offset)
            .map_or(0, |slice| slice.encode_utf16().count());
        (
            u32::try_from(line + 1).unwrap_or(u32::MAX),
            u32::try_from(column + 1).unwrap_or(u32::MAX),
        )
    }

    /// The byte offset of a 1-based line and UTF-16 column, clamped into `text`.
    fn offset_of(&self, text: &str, line: u32, column: u32) -> usize {
        let index = (line.max(1) as usize) - 1;
        let start = match self.starts.get(index) {
            Some(start) => *start,
            None => return text.len(),
        };
        let end = self
            .starts
            .get(index + 1)
            .copied()
            .unwrap_or(text.len())
            .min(text.len());
        let Some(slice) = text.get(start..end) else {
            return start;
        };
        let mut remaining = (column.max(1) as usize) - 1;
        let mut offset = start;
        for character in slice.chars() {
            let units = character.len_utf16();
            if remaining < units {
                break;
            }
            remaining -= units;
            offset += character.len_utf8();
        }
        offset
    }

    fn line_text<'a>(&self, text: &'a str, offset: usize) -> &'a str {
        let line = self.line_of(offset);
        let start = self.starts.get(line).copied().unwrap_or(0);
        let end = self
            .starts
            .get(line + 1)
            .copied()
            .unwrap_or(text.len())
            .min(text.len());
        text.get(start..end).unwrap_or("").trim_end_matches('\n')
    }
}

fn preview_of(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.len() <= MAX_PREVIEW {
        return trimmed.to_owned();
    }
    let mut end = MAX_PREVIEW;
    while end > 0 && !trimmed.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &trimmed[..end])
}

/// One named symbol occurrence, resolved to a readable location.
struct Site {
    path: String,
    span: Span,
    preview: String,
}

impl Site {
    fn location(&self) -> SymbolLocation {
        SymbolLocation {
            path: self.path.clone(),
            span: Span {
                line: self.span.line,
                column: self.span.column,
                end_line: self.span.end_line,
                end_column: self.span.end_column,
            },
            preview: self.preview.clone(),
        }
    }
}

#[derive(Default)]
struct ProjectIndex {
    label_definitions: HashMap<String, Vec<Site>>,
    label_references: HashMap<String, Vec<Site>>,
    citation_definitions: HashMap<String, Vec<Site>>,
    citation_references: HashMap<String, Vec<Site>>,
    /// Every project-relative file path, with forward slashes.
    files: HashSet<String>,
    facts: MacroFacts,
    complete: bool,
}

fn normalized(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn build_index(sources: &ProjectSources) -> ProjectIndex {
    let mut index = ProjectIndex {
        complete: sources.complete,
        ..ProjectIndex::default()
    };
    for path in &sources.files {
        index.files.insert(normalized(path));
    }

    for (path, content) in &sources.texts {
        let file = normalized(path);
        let lines = LineIndex::new(content);
        let is_bib = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("bib"));

        let occurrences = if is_bib {
            scan_bib(content)
        } else {
            let scan = scan_latex(content);
            index.facts.defines_labels |= scan.facts.defines_labels;
            index.facts.defines_citations |= scan.facts.defines_citations;
            index.facts.sets_graphics_path |= scan.facts.sets_graphics_path;
            scan.occurrences
        };

        for occurrence in occurrences {
            let bucket = match occurrence.role {
                Role::LabelDefinition => &mut index.label_definitions,
                Role::LabelReference => &mut index.label_references,
                Role::CitationDefinition => &mut index.citation_definitions,
                Role::CitationReference => &mut index.citation_references,
                Role::FileReference => continue,
            };
            let sites = bucket.entry(occurrence.name.clone()).or_default();
            if sites.len() >= MAX_LOCATIONS {
                continue;
            }
            sites.push(site_of(&file, content, &lines, &occurrence));
        }
    }
    index
}

fn site_of(file: &str, content: &str, lines: &LineIndex, occurrence: &Occurrence) -> Site {
    let (line, column) = lines.position(content, occurrence.start);
    let (end_line, end_column) = lines.position(content, occurrence.end);
    Site {
        path: file.to_owned(),
        span: Span {
            line,
            column,
            end_line,
            end_column,
        },
        preview: preview_of(lines.line_text(content, occurrence.start)),
    }
}

/// A symbol name a textual scan can resolve. A name carrying a macro parameter
/// or a control sequence is assembled at build time, so its absence from the
/// index says nothing.
fn is_resolvable_name(name: &str) -> bool {
    !name.is_empty() && !name.contains('#') && !name.contains('\\')
}

fn parent_directory(relative: &str) -> &str {
    match relative.rfind('/') {
        Some(index) => &relative[..index],
        None => "",
    }
}

/// Normalizes a `/`-separated path, resolving `.` and `..`; `None` when the
/// path escapes above the project root.
fn normalize_relative(path: &str) -> Option<String> {
    let slashed = path.replace('\\', "/");
    let mut segments: Vec<&str> = Vec::new();
    for segment in slashed.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop()?;
            }
            other => segments.push(other),
        }
    }
    Some(segments.join("/"))
}

/// The project-relative paths a file reference could denote.
///
/// Both resolutions LaTeX distributions actually use are accepted — relative to
/// the including file, and relative to the project root — because flagging a
/// reference that resolves under the other convention would be a false
/// positive. Missing extensions are filled in per command.
fn candidate_paths(name: &str, including: &str, command: &str) -> Vec<String> {
    let default_extensions: &[&str] = match command {
        "input" | "include" | "subfile" | "import" | "subimport" | "includefrom"
        | "subincludefrom" => &["tex"],
        "bibliography" | "addbibresource" => &["bib"],
        "includegraphics" => IMAGE_EXTENSIONS,
        _ => &[],
    };
    let basename = name.rsplit('/').next().unwrap_or(name);
    let mut spellings = vec![name.to_owned()];
    if !basename.contains('.') {
        for extension in default_extensions {
            spellings.push(format!("{name}.{extension}"));
        }
    }

    let directory = parent_directory(including);
    let mut candidates = Vec::new();
    for spelling in spellings {
        let relative_to_file = if directory.is_empty() {
            spelling.clone()
        } else {
            format!("{directory}/{spelling}")
        };
        for candidate in [relative_to_file, spelling] {
            if let Some(normal) = normalize_relative(&candidate) {
                if !normal.is_empty() && !candidates.contains(&normal) {
                    candidates.push(normal);
                }
            }
        }
    }
    candidates
}

#[tauri::command]
pub fn latex_project_diagnostics(
    request: AnalysisRequest,
    access: State<'_, ProjectAccess>,
    scan_cache: State<'_, ScanCache>,
) -> Result<AnalysisResponse, AnalysisError> {
    let root = access
        .resolve(&request.project_path)
        .map_err(|_| unavailable())?;
    let relative = Path::new(&request.relative_path);
    if !source_read::valid_relative_path(relative) || !source_read::is_readable_source(relative) {
        return Err(unavailable());
    }
    if request.content.len() > source_read::MAX_SOURCE_BYTES as usize {
        return Err(unavailable());
    }
    let sources = scan_project_cached(&scan_cache, &root, relative, &request.content);
    Ok(diagnose(&sources, &normalized(relative), &request.content))
}

fn diagnose(sources: &ProjectSources, relative: &str, content: &str) -> AnalysisResponse {
    let index = build_index(sources);
    let lines = LineIndex::new(content);
    let mut diagnostics = Vec::new();

    let is_bib = relative.to_ascii_lowercase().ends_with(".bib");
    let occurrences = if is_bib {
        scan_bib(content)
    } else {
        scan_latex(content).occurrences
    };

    // "Undefined" is only decidable with a complete view of the project, and
    // only in a project that defines symbols of that kind at all — an early
    // draft with no \label yet must not have every \ref underlined.
    let check_labels =
        index.complete && !index.facts.defines_labels && !index.label_definitions.is_empty();
    let check_citations =
        index.complete && !index.facts.defines_citations && !index.citation_definitions.is_empty();
    let check_files = index.complete;

    for occurrence in occurrences {
        if diagnostics.len() >= MAX_DIAGNOSTICS {
            break;
        }
        if !is_resolvable_name(&occurrence.name) {
            continue;
        }
        let span = || {
            let (line, column) = lines.position(content, occurrence.start);
            let (end_line, end_column) = lines.position(content, occurrence.end);
            Span {
                line,
                column,
                end_line,
                end_column,
            }
        };

        match occurrence.role {
            Role::LabelReference if check_labels => {
                if !index.label_definitions.contains_key(&occurrence.name) {
                    diagnostics.push(Diagnostic {
                        code: "undefined-label",
                        severity: "warning",
                        message: format!(
                            "No \\label{{{}}} is defined in this project, so this reference will print as ??.",
                            occurrence.name
                        ),
                        span: span(),
                    });
                }
            }
            Role::CitationReference if check_citations => {
                if !index.citation_definitions.contains_key(&occurrence.name) {
                    diagnostics.push(Diagnostic {
                        code: "undefined-citation",
                        severity: "warning",
                        message: format!(
                            "No bibliography entry named {} exists in this project.",
                            occurrence.name
                        ),
                        span: span(),
                    });
                }
            }
            Role::LabelDefinition => {
                // Duplicates inside one file are reported in the editor as the
                // user types; only a clash with another file needs the project.
                if let Some(other) = index
                    .label_definitions
                    .get(&occurrence.name)
                    .and_then(|sites| sites.iter().find(|site| site.path != relative))
                {
                    diagnostics.push(Diagnostic {
                        code: "duplicate-label",
                        severity: "warning",
                        message: format!(
                            "\\label{{{}}} is also defined in {} on line {}. References to it resolve to only one of the two.",
                            occurrence.name, other.path, other.span.line
                        ),
                        span: span(),
                    });
                }
            }
            Role::CitationDefinition => {
                if let Some(other) =
                    index
                        .citation_definitions
                        .get(&occurrence.name)
                        .and_then(|sites| {
                            sites.iter().find(|site| {
                                site.path != relative
                                    || site.span.line != lines.position(content, occurrence.start).0
                            })
                        })
                {
                    diagnostics.push(Diagnostic {
                        code: "duplicate-citation",
                        severity: "warning",
                        message: format!(
                            "The bibliography key {} is also defined in {} on line {}. Only one entry will be used.",
                            occurrence.name, other.path, other.span.line
                        ),
                        span: span(),
                    });
                }
            }
            Role::FileReference if check_files => {
                if occurrence.command == "includegraphics" && index.facts.sets_graphics_path {
                    continue;
                }
                let candidates = candidate_paths(&occurrence.name, relative, &occurrence.command);
                if !candidates
                    .iter()
                    .any(|candidate| index.files.contains(candidate))
                {
                    diagnostics.push(Diagnostic {
                        code: "missing-file",
                        severity: "error",
                        message: format!(
                            "\\{} refers to {}, which is not a file in this project.",
                            occurrence.command, occurrence.name
                        ),
                        span: span(),
                    });
                }
            }
            _ => {}
        }
    }

    AnalysisResponse {
        diagnostics,
        complete: index.complete,
    }
}

#[tauri::command]
pub fn latex_symbol_at(
    request: SymbolRequest,
    access: State<'_, ProjectAccess>,
    scan_cache: State<'_, ScanCache>,
) -> Result<SymbolResponse, AnalysisError> {
    let root = access
        .resolve(&request.project_path)
        .map_err(|_| unavailable())?;
    let relative = Path::new(&request.relative_path);
    if !source_read::valid_relative_path(relative) || !source_read::is_readable_source(relative) {
        return Err(unavailable());
    }
    if request.content.len() > source_read::MAX_SOURCE_BYTES as usize {
        return Err(unavailable());
    }
    let sources = scan_project_cached(&scan_cache, &root, relative, &request.content);
    Ok(SymbolResponse {
        symbol: resolve_symbol(
            &sources,
            &normalized(relative),
            &request.content,
            request.line,
            request.column,
        ),
    })
}

fn resolve_symbol(
    sources: &ProjectSources,
    relative: &str,
    content: &str,
    line: u32,
    column: u32,
) -> Option<SymbolInfo> {
    let lines = LineIndex::new(content);
    let offset = lines.offset_of(content, line, column);
    let is_bib = relative.to_ascii_lowercase().ends_with(".bib");
    let occurrences = if is_bib {
        scan_bib(content)
    } else {
        scan_latex(content).occurrences
    };
    let occurrence = occurrences
        .into_iter()
        .find(|candidate| offset >= candidate.start && offset <= candidate.end)?;

    let index = build_index(sources);
    let (kind, definitions, references) = match occurrence.role {
        Role::LabelDefinition | Role::LabelReference => (
            "label",
            index.label_definitions.get(&occurrence.name),
            index.label_references.get(&occurrence.name),
        ),
        Role::CitationDefinition | Role::CitationReference => (
            "citation",
            index.citation_definitions.get(&occurrence.name),
            index.citation_references.get(&occurrence.name),
        ),
        Role::FileReference => {
            let target = candidate_paths(&occurrence.name, relative, &occurrence.command)
                .into_iter()
                .find(|candidate| index.files.contains(candidate))?;
            return Some(SymbolInfo {
                name: occurrence.name,
                kind: "file",
                definitions: vec![SymbolLocation {
                    path: target,
                    span: Span {
                        line: 1,
                        column: 1,
                        end_line: 1,
                        end_column: 1,
                    },
                    preview: String::new(),
                }],
                references: Vec::new(),
            });
        }
    };

    Some(SymbolInfo {
        name: occurrence.name,
        kind,
        definitions: definitions
            .map_or_else(Vec::new, |sites| sites.iter().map(Site::location).collect()),
        references: references
            .map_or_else(Vec::new, |sites| sites.iter().map(Site::location).collect()),
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{candidate_paths, diagnose, normalize_relative, resolve_symbol, LineIndex};
    use crate::latex_project_scan::ProjectSources;

    fn sources(files: &[(&str, &str)]) -> ProjectSources {
        ProjectSources {
            files: files.iter().map(|(path, _)| PathBuf::from(path)).collect(),
            texts: files
                .iter()
                .filter(|(path, _)| path.ends_with(".tex") || path.ends_with(".bib"))
                .map(|(path, content)| (PathBuf::from(path), (*content).to_owned()))
                .collect(),
            complete: true,
        }
    }

    fn codes(files: &[(&str, &str)], active: &str) -> Vec<String> {
        let content = files
            .iter()
            .find(|(path, _)| *path == active)
            .map_or("", |(_, content)| *content);
        diagnose(&sources(files), active, content)
            .diagnostics
            .into_iter()
            .map(|diagnostic| diagnostic.code.to_owned())
            .collect()
    }

    #[test]
    fn accepts_a_reference_defined_in_another_file() {
        let files = [
            ("main.tex", "\\input{intro}\\ref{sec:intro}"),
            ("intro.tex", "\\label{sec:intro}"),
        ];
        assert!(codes(&files, "main.tex").is_empty());
    }

    #[test]
    fn reports_a_reference_defined_nowhere() {
        let files = [
            ("main.tex", "\\ref{sec:missing}"),
            ("intro.tex", "\\label{sec:intro}"),
        ];
        assert_eq!(codes(&files, "main.tex"), vec!["undefined-label"]);
    }

    #[test]
    fn stays_silent_when_the_project_defines_no_labels_yet() {
        assert!(codes(&[("main.tex", "\\ref{sec:todo}")], "main.tex").is_empty());
    }

    #[test]
    fn stays_silent_when_a_macro_builds_label_keys() {
        let files = [(
            "main.tex",
            "\\newcommand{\\tag}[1]{\\label{t:#1}}\\label{a}\\ref{t:one}",
        )];
        assert!(codes(&files, "main.tex").is_empty());
    }

    #[test]
    fn stays_silent_when_the_project_scan_was_incomplete() {
        let mut incomplete = sources(&[
            ("main.tex", "\\ref{sec:missing}"),
            ("intro.tex", "\\label{sec:intro}"),
        ]);
        incomplete.complete = false;
        let response = diagnose(&incomplete, "main.tex", "\\ref{sec:missing}");
        assert!(response.diagnostics.is_empty());
        assert!(!response.complete);
    }

    #[test]
    fn reports_a_label_defined_in_two_files() {
        let files = [
            ("main.tex", "\\label{sec:intro}"),
            ("intro.tex", "\\label{sec:intro}"),
        ];
        let diagnostics = diagnose(&sources(&files), "main.tex", "\\label{sec:intro}").diagnostics;
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, "duplicate-label");
        assert!(diagnostics[0].message.contains("intro.tex"));
    }

    #[test]
    fn does_not_report_a_label_defined_once() {
        let files = [
            ("main.tex", "\\label{sec:intro}"),
            ("intro.tex", "\\label{sec:other}"),
        ];
        assert!(codes(&files, "main.tex").is_empty());
    }

    #[test]
    fn resolves_citations_against_a_bib_file() {
        let files = [
            ("main.tex", "\\cite{knuth1984}\\cite{absent}"),
            ("refs.bib", "@article{knuth1984, title={x}}"),
        ];
        assert_eq!(codes(&files, "main.tex"), vec!["undefined-citation"]);
    }

    #[test]
    fn stays_silent_on_citations_when_no_bibliography_exists() {
        assert!(codes(&[("main.tex", "\\cite{anything}")], "main.tex").is_empty());
    }

    #[test]
    fn reports_a_bibliography_key_defined_twice() {
        let files = [
            ("refs.bib", "@article{k, title={a}}"),
            ("more.bib", "@book{k, title={b}}"),
        ];
        assert_eq!(codes(&files, "refs.bib"), vec!["duplicate-citation"]);
    }

    #[test]
    fn reports_an_input_of_a_file_that_does_not_exist() {
        let files = [("main.tex", "\\input{chapters/ghost}")];
        assert_eq!(codes(&files, "main.tex"), vec!["missing-file"]);
    }

    #[test]
    fn accepts_an_input_resolved_from_the_project_root() {
        let files = [
            ("chapters/one.tex", "\\input{shared/macros}"),
            ("shared/macros.tex", ""),
        ];
        assert!(codes(&files, "chapters/one.tex").is_empty());
    }

    #[test]
    fn accepts_a_graphic_whose_extension_is_left_to_latex() {
        let files = [
            ("main.tex", "\\includegraphics{figures/plot}"),
            ("figures/plot.pdf", ""),
        ];
        assert!(codes(&files, "main.tex").is_empty());
    }

    #[test]
    fn stays_silent_on_graphics_when_a_graphics_path_is_declared() {
        let files = [(
            "main.tex",
            "\\graphicspath{{images/}}\\includegraphics{plot}",
        )];
        assert!(codes(&files, "main.tex").is_empty());
    }

    #[test]
    fn ignores_a_reference_whose_key_is_macro_built() {
        let files = [
            ("main.tex", "\\ref{sec:#1}\\label{sec:real}"),
            ("other.tex", "\\label{sec:other}"),
        ];
        assert!(codes(&files, "main.tex").is_empty());
    }

    #[test]
    fn finds_a_definition_and_every_use_of_a_label() -> Result<(), Box<dyn std::error::Error>> {
        let files = [
            ("main.tex", "\\ref{sec:intro} and \\ref{sec:intro}"),
            ("intro.tex", "\\section{I}\\label{sec:intro}"),
        ];
        let symbol = resolve_symbol(
            &sources(&files),
            "main.tex",
            "\\ref{sec:intro} and \\ref{sec:intro}",
            1,
            7,
        )
        .ok_or("cursor is on a label reference")?;

        assert_eq!(symbol.name, "sec:intro");
        assert_eq!(symbol.kind, "label");
        assert_eq!(symbol.definitions.len(), 1);
        assert_eq!(symbol.definitions[0].path, "intro.tex");
        assert_eq!(
            symbol.definitions[0].preview,
            "\\section{I}\\label{sec:intro}"
        );
        assert_eq!(symbol.references.len(), 2);
        Ok(())
    }

    #[test]
    fn resolves_no_symbol_away_from_an_occurrence() {
        let files = [("main.tex", "plain words only")];
        assert!(resolve_symbol(&sources(&files), "main.tex", "plain words only", 1, 3).is_none());
    }

    #[test]
    fn resolves_a_file_reference_to_its_target() -> Result<(), Box<dyn std::error::Error>> {
        let files = [("main.tex", "\\input{intro}"), ("intro.tex", "")];
        let symbol = resolve_symbol(&sources(&files), "main.tex", "\\input{intro}", 1, 9)
            .ok_or("cursor is on a file reference")?;
        assert_eq!(symbol.kind, "file");
        assert_eq!(symbol.definitions[0].path, "intro.tex");
        Ok(())
    }

    #[test]
    fn addresses_positions_in_utf16_columns() {
        let text = "Grüße 😀 \\label{end}\nsecond";
        let lines = LineIndex::new(text);
        let offset = text.find("end").unwrap_or(0);
        let (line, column) = lines.position(text, offset);
        assert_eq!(line, 1);
        assert_eq!(lines.offset_of(text, line, column), offset);
    }

    #[test]
    fn rejects_a_path_that_escapes_the_project_root() {
        assert_eq!(normalize_relative("../outside"), None);
        assert_eq!(
            normalize_relative("chapters/../shared/x.tex").as_deref(),
            Some("shared/x.tex")
        );
    }

    #[test]
    fn offers_both_resolutions_of_an_input_path() {
        let candidates = candidate_paths("shared/macros", "chapters/one.tex", "input");
        assert!(candidates.contains(&"chapters/shared/macros.tex".to_owned()));
        assert!(candidates.contains(&"shared/macros.tex".to_owned()));
    }
}
