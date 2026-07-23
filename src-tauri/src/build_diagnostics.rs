//! Turns a LaTeX run's output into diagnostics a person can act on.
//!
//! The `.log` file is the source of truth. The live stream is the same text
//! with less of it — TeX wraps the stream, and the wrap splits a message away
//! from the `l.NN` context line that locates it — so the stream feeds liveness
//! and this module decides what the run actually reported.
//!
//! The pipeline is: rejoin wrapped lines, classify, locate, deduplicate across
//! passes, translate, rank. Every stage is pure and testable on captured log
//! text.

use std::{collections::HashMap, path::Path};

use serde::Serialize;

use crate::source_read::valid_relative_path;

/// TeX wraps its terminal and log output at this width unless `max_print_line`
/// says otherwise. A line of exactly this length is assumed to continue.
const DEFAULT_WRAP_WIDTH: usize = 79;
const MAX_DIAGNOSTICS: usize = 500;
const MAX_MESSAGE_BYTES: usize = 2_048;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

/// The closed set of problems TeX explains in its own words. Anything not
/// recognised stays `CompilerMessage` and keeps the compiler's wording; a
/// message that was not understood is never dropped.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticCode {
    UndefinedControlSequence,
    MissingPackage,
    MissingFile,
    UndefinedReference,
    UndefinedCitation,
    MissingDollar,
    RunawayArgument,
    TooManyBraces,
    OverfullBox,
    UnderfullBox,
    RerunLimit,
    BibliographyFailed,
    CompilerMessage,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDiagnostic {
    pub code: DiagnosticCode,
    pub severity: DiagnosticSeverity,
    /// One sentence naming what is wrong and what would resolve it.
    pub message: String,
    /// The compiler's own line, always kept so the translation never stands
    /// between a reader and what the engine said.
    pub raw: String,
    /// The `l.NN` source excerpt, when the engine printed one.
    pub context: Option<String>,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub mapping_uncertain: bool,
    /// How many passes reported this. latexmk runs the engine two or three
    /// times; the same warning from each is one problem, not three.
    pub occurrences: u32,
    /// The streamed log line this came from, when one matches.
    pub log_sequence: Option<u64>,
}

/// A classified record before translation and deduplication.
struct Record {
    code: DiagnosticCode,
    severity: DiagnosticSeverity,
    raw: String,
    detail: Option<String>,
    context: Option<String>,
    file: Option<String>,
    line: Option<u32>,
}

/// The full pipeline over one run's log text.
pub fn diagnostics_from_log(text: &str, project_root: &Path) -> Vec<BuildDiagnostic> {
    let lines = rejoin_wrapped_lines(text, DEFAULT_WRAP_WIDTH);
    let records = classify(&lines);
    let mut diagnostics = deduplicate(
        records
            .into_iter()
            .map(|record| translate(record, project_root)),
    );
    rank(&mut diagnostics);
    diagnostics.truncate(MAX_DIAGNOSTICS);
    diagnostics
}

/// Classifies one streamed line, for live feedback while the run is still
/// going. It sees no context line and no later passes, so it cannot name the
/// command in an `Undefined control sequence` or collapse repeats; the log pass
/// replaces everything it produced once the run ends.
pub fn diagnostic_from_stream_line(text: &str, project_root: &Path) -> Option<BuildDiagnostic> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    classify_line(trimmed).map(|record| translate(record, project_root))
}

/// Rejoins the lines TeX split at the wrap width.
///
/// A line of exactly `width` characters may have been cut mid-message, but a
/// natural line of that length also occurs — a real log holds both, sometimes
/// within a few lines of each other. So length alone does not decide it: a
/// following line that opens a record of its own is a new record, never a
/// continuation. That keeps a wrapped diagnostic whole without swallowing the
/// record after an innocent 79-character path.
pub fn rejoin_wrapped_lines(text: &str, width: usize) -> Vec<String> {
    let mut joined: Vec<String> = Vec::new();
    let mut pending: Option<String> = None;
    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        match pending.take() {
            Some(accumulated) if opens_record(line) => {
                joined.push(accumulated);
                pending = (line.chars().count() == width).then(|| line.to_owned());
                if pending.is_none() {
                    joined.push(line.to_owned());
                }
            }
            Some(mut accumulated) => {
                accumulated.push_str(line);
                if line.chars().count() == width {
                    pending = Some(accumulated);
                } else {
                    joined.push(accumulated);
                }
            }
            None => {
                if line.chars().count() == width {
                    pending = Some(line.to_owned());
                } else {
                    joined.push(line.to_owned());
                }
            }
        }
    }
    if let Some(accumulated) = pending {
        joined.push(accumulated);
    }
    joined
}

/// Whether a line begins a record rather than continuing the previous one.
/// Continuations are prose or path fragments; these openers never are.
fn opens_record(line: &str) -> bool {
    const OPENERS: [&str; 6] = [
        "! ",
        "l.",
        "Overfull ",
        "Underfull ",
        "Package: ",
        "Document Class: ",
    ];
    line.starts_with('!')
        || OPENERS.iter().any(|opener| line.starts_with(opener))
        || line.contains(" Warning: ")
        || line.contains(" Error: ")
}

fn classify(lines: &[String]) -> Vec<Record> {
    let mut records: Vec<Record> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(mut record) = classify_line(trimmed) {
            record.context = context_after(lines, index);
            records.push(record);
        }
    }
    records
}

/// The `l.NN …` excerpt TeX prints beneath an error, searched for only in the
/// few lines that belong to that error.
fn context_after(lines: &[String], index: usize) -> Option<String> {
    lines
        .iter()
        .skip(index + 1)
        .take(4)
        .find(|candidate| candidate.starts_with("l."))
        .map(|candidate| candidate.trim_end().to_owned())
}

fn classify_line(line: &str) -> Option<Record> {
    if let Some((file, number, remainder)) = file_line_message(line) {
        let mut record = classify_message(remainder.trim(), line)?;
        record.file = Some(file.to_owned());
        record.line = Some(number.max(1));
        return Some(record);
    }
    if let Some(rest) = line.strip_prefix('!') {
        return classify_message(rest.trim(), line);
    }
    classify_standalone(line)
}

/// Records that carry neither `!` nor a `file:line:` prefix: warnings, box
/// complaints, and the build tool's own failures.
fn classify_standalone(line: &str) -> Option<Record> {
    let lowered = line.to_ascii_lowercase();
    if line.starts_with("Overfull \\hbox") || line.starts_with("Overfull \\vbox") {
        return Some(Record {
            code: DiagnosticCode::OverfullBox,
            severity: DiagnosticSeverity::Warning,
            raw: line.to_owned(),
            detail: overfull_amount(line),
            context: None,
            file: None,
            line: trailing_line_range(line),
        });
    }
    if line.starts_with("Underfull \\hbox") || line.starts_with("Underfull \\vbox") {
        return Some(Record {
            code: DiagnosticCode::UnderfullBox,
            severity: DiagnosticSeverity::Warning,
            raw: line.to_owned(),
            detail: None,
            context: None,
            file: None,
            line: trailing_line_range(line),
        });
    }
    if lowered.contains("maximum runs") || lowered.contains("reached maximum") {
        return Some(Record {
            code: DiagnosticCode::RerunLimit,
            severity: DiagnosticSeverity::Warning,
            raw: line.to_owned(),
            detail: None,
            context: None,
            file: None,
            line: None,
        });
    }
    if lowered.starts_with("latexmk: failure in") || lowered.contains("error returned by biber") {
        return Some(Record {
            code: DiagnosticCode::BibliographyFailed,
            severity: DiagnosticSeverity::Error,
            raw: line.to_owned(),
            detail: None,
            context: None,
            file: None,
            line: None,
        });
    }
    if line.contains("Warning:") {
        return Some(warning_record(line));
    }
    None
}

fn warning_record(line: &str) -> Record {
    let reference = quoted_value(line);
    let source_line = input_line_number(line);
    let (code, detail) = if line.contains("Reference") && line.contains("undefined") {
        (DiagnosticCode::UndefinedReference, reference)
    } else if line.contains("Citation") && line.contains("undefined") {
        (DiagnosticCode::UndefinedCitation, reference)
    } else {
        (DiagnosticCode::CompilerMessage, None)
    };
    Record {
        code,
        severity: DiagnosticSeverity::Warning,
        raw: line.to_owned(),
        detail,
        context: None,
        file: None,
        line: source_line,
    }
}

/// Classifies the message body of a `!` error or a `file:line:` record.
fn classify_message(message: &str, raw: &str) -> Option<Record> {
    let record = |code, severity, detail| {
        Some(Record {
            code,
            severity,
            raw: raw.to_owned(),
            detail,
            context: None,
            file: None,
            line: None,
        })
    };
    if message.starts_with("Undefined control sequence") {
        return record(
            DiagnosticCode::UndefinedControlSequence,
            DiagnosticSeverity::Error,
            None,
        );
    }
    if message.contains("not found") && message.contains("File ") {
        let file = quoted_value(message);
        let code = match file.as_deref().and_then(package_name) {
            Some(_) => DiagnosticCode::MissingPackage,
            None => DiagnosticCode::MissingFile,
        };
        return record(code, DiagnosticSeverity::Error, file);
    }
    if message.starts_with("Missing $ inserted") {
        return record(
            DiagnosticCode::MissingDollar,
            DiagnosticSeverity::Error,
            None,
        );
    }
    if message.starts_with("Runaway argument") {
        return record(
            DiagnosticCode::RunawayArgument,
            DiagnosticSeverity::Error,
            None,
        );
    }
    if message.starts_with("Too many }") || message.contains("Extra }") {
        return record(
            DiagnosticCode::TooManyBraces,
            DiagnosticSeverity::Error,
            None,
        );
    }
    if message.contains("Warning:") {
        let mut warning = warning_record(raw);
        warning.raw = raw.to_owned();
        return Some(warning);
    }
    record(
        DiagnosticCode::CompilerMessage,
        DiagnosticSeverity::Error,
        Some(message.to_owned()),
    )
}

fn translate(record: Record, project_root: &Path) -> BuildDiagnostic {
    let command = record
        .context
        .as_deref()
        .and_then(trailing_command)
        .or_else(|| record.detail.clone());
    let message = match record.code {
        DiagnosticCode::UndefinedControlSequence => command.map_or_else(
            || {
                "A command on this line isn't defined. Check the spelling, or add the package that defines it.".to_owned()
            },
            |name| {
                format!("{name} isn't a known command here. Check the spelling, or add the package that defines it.")
            },
        ),
        DiagnosticCode::MissingPackage => record
            .detail
            .as_deref()
            .and_then(package_name)
            .map_or_else(
                || "A package this document loads isn't installed.".to_owned(),
                |package| format!("The package {package} isn't installed. Install it to build this document."),
            ),
        DiagnosticCode::MissingFile => record.detail.as_deref().map_or_else(
            || "A file this document includes is missing.".to_owned(),
            |file| format!("TeX could not find {file}. Check the path, or add the file to the project."),
        ),
        DiagnosticCode::UndefinedReference => record.detail.as_deref().map_or_else(
            || "A cross-reference has no matching label, so it prints as ??.".to_owned(),
            |name| format!("Nothing defines \\label{{{name}}}, so references to it print as ??."),
        ),
        DiagnosticCode::UndefinedCitation => record.detail.as_deref().map_or_else(
            || "A citation has no matching bibliography entry.".to_owned(),
            |key| {
                format!("Nothing in the bibliography matches \\cite{{{key}}}. Check the key, or add the entry to the .bib file.")
            },
        ),
        DiagnosticCode::MissingDollar => {
            "Math mode was needed here but never opened. Wrap the expression in $…$.".to_owned()
        }
        DiagnosticCode::RunawayArgument => {
            "An argument runs past where it should end, usually an unclosed { or a blank line inside a command.".to_owned()
        }
        DiagnosticCode::TooManyBraces => {
            "There is one } more than there are { in this group.".to_owned()
        }
        DiagnosticCode::OverfullBox => record.detail.as_deref().map_or_else(
            || "This line runs past the right margin.".to_owned(),
            |amount| format!("This line runs {amount} past the right margin."),
        ),
        DiagnosticCode::UnderfullBox => {
            "This line is stretched to fit, so its spacing will look loose.".to_owned()
        }
        DiagnosticCode::RerunLimit => {
            "latexmk stopped after its maximum number of runs. Some references may still be unresolved.".to_owned()
        }
        DiagnosticCode::BibliographyFailed => {
            "The bibliography tool did not finish, so citations will not resolve.".to_owned()
        }
        DiagnosticCode::CompilerMessage => record
            .detail
            .clone()
            .unwrap_or_else(|| record.raw.clone()),
    };
    let (file, mapping_uncertain) = resolve_file(record.file.as_deref(), project_root);
    BuildDiagnostic {
        code: record.code,
        severity: record.severity,
        message: truncate(message),
        raw: truncate(record.raw),
        context: record.context.map(truncate),
        file,
        line: record.line,
        mapping_uncertain,
        occurrences: 1,
        log_sequence: None,
    }
}

/// Collapses the same problem reported by more than one pass, keeping the first
/// occurrence and counting the rest.
fn deduplicate(diagnostics: impl Iterator<Item = BuildDiagnostic>) -> Vec<BuildDiagnostic> {
    let mut order: Vec<BuildDiagnostic> = Vec::new();
    let mut seen: HashMap<(DiagnosticCode, Option<String>, Option<u32>, String), usize> =
        HashMap::new();
    for diagnostic in diagnostics {
        let key = (
            diagnostic.code,
            diagnostic.file.clone(),
            diagnostic.line,
            diagnostic.message.clone(),
        );
        match seen.get(&key) {
            Some(index) => {
                if let Some(existing) = order.get_mut(*index) {
                    existing.occurrences = existing.occurrences.saturating_add(1);
                }
            }
            None => {
                seen.insert(key, order.len());
                order.push(diagnostic);
            }
        }
    }
    order
}

/// Errors before warnings; within a severity, by file then line; unlocated
/// last, because a problem TeX could place is the one to read first.
fn rank(diagnostics: &mut [BuildDiagnostic]) {
    diagnostics.sort_by(|left, right| {
        severity_rank(left.severity)
            .cmp(&severity_rank(right.severity))
            .then_with(|| left.file.is_none().cmp(&right.file.is_none()))
            .then_with(|| left.file.cmp(&right.file))
            .then_with(|| left.line.cmp(&right.line))
    });
}

const fn severity_rank(severity: DiagnosticSeverity) -> u8 {
    match severity {
        DiagnosticSeverity::Error => 0,
        DiagnosticSeverity::Warning => 1,
    }
}

fn resolve_file(file: Option<&str>, project_root: &Path) -> (Option<String>, bool) {
    let Some(file) = file else {
        return (None, false);
    };
    let candidate = Path::new(file.trim_start_matches("./"));
    let mapped = if candidate.is_absolute() {
        candidate.strip_prefix(project_root).ok()
    } else {
        Some(candidate)
    }
    .filter(|path| valid_relative_path(path));
    match mapped {
        Some(path) => (Some(path.to_string_lossy().into_owned()), false),
        None => (None, true),
    }
}

/// Splits a `-file-line-error` record. Scans for the first `:` followed by a
/// number and another `:`, so a Windows drive letter does not end the path.
pub fn file_line_message(text: &str) -> Option<(&str, u32, &str)> {
    for (first, _) in text.match_indices(':') {
        let remainder = text.get(first + 1..)?;
        let second = remainder.find(':')?;
        if let Ok(line) = remainder.get(..second)?.parse::<u32>() {
            return Some((text.get(..first)?, line, remainder.get(second + 1..)?));
        }
    }
    None
}

/// The value inside the backtick-quote pair TeX uses: `` `name' ``.
fn quoted_value(text: &str) -> Option<String> {
    let start = text.find('`')?;
    let rest = text.get(start + 1..)?;
    let end = rest.find('\'')?;
    let value = rest.get(..end)?.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

/// `algorithm2e.sty` names the package `algorithm2e`. Class files answer the
/// same way, because both are installed by package name.
fn package_name(file: &str) -> Option<&str> {
    file.strip_suffix(".sty")
        .or_else(|| file.strip_suffix(".cls"))
}

/// The line number TeX embeds in warning prose: `… on input line 88.`
fn input_line_number(text: &str) -> Option<u32> {
    let marker = text.find("input line ")?;
    let rest = text.get(marker + "input line ".len()..)?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// The first line of the `at lines 12--14` range a box complaint ends with.
fn trailing_line_range(text: &str) -> Option<u32> {
    let marker = text.rfind("at lines ").or_else(|| text.rfind("at line "))?;
    let rest = text.get(marker..)?;
    let digits: String = rest
        .chars()
        .skip_while(|character| !character.is_ascii_digit())
        .take_while(char::is_ascii_digit)
        .collect();
    digits.parse().ok()
}

/// `Overfull \hbox (12.34pt too wide) …` measures how far past the margin.
fn overfull_amount(text: &str) -> Option<String> {
    let start = text.find('(')?;
    let rest = text.get(start + 1..)?;
    let end = rest.find(" too wide")?;
    Some(rest.get(..end)?.trim().to_owned())
}

/// The command an `l.NN` context line ends on, which is the one TeX choked on.
fn trailing_command(context: &str) -> Option<String> {
    let start = context.rfind('\\')?;
    let name: String = context
        .get(start..)?
        .chars()
        .take_while(|character| *character == '\\' || character.is_ascii_alphabetic())
        .collect();
    (name.len() > 1).then_some(name)
}

fn truncate(mut value: String) -> String {
    if value.len() <= MAX_MESSAGE_BYTES {
        return value;
    }
    let mut boundary = MAX_MESSAGE_BYTES;
    while boundary > 0 && !value.is_char_boundary(boundary) {
        boundary -= 1;
    }
    value.truncate(boundary);
    value.push('…');
    value
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        diagnostics_from_log, rejoin_wrapped_lines, BuildDiagnostic, DiagnosticCode,
        DiagnosticSeverity,
    };

    fn root() -> &'static Path {
        Path::new("/projects/thesis")
    }

    /// Tests assert on the single diagnostic a fixture should produce. Failing
    /// with an error keeps the `unwrap`/`expect` ban intact in test code too.
    fn only(
        diagnostics: &[BuildDiagnostic],
    ) -> Result<&BuildDiagnostic, Box<dyn std::error::Error>> {
        match diagnostics {
            [diagnostic] => Ok(diagnostic),
            _ => Err(format!("expected exactly one diagnostic, got {}", diagnostics.len()).into()),
        }
    }

    #[test]
    fn rejoins_a_message_split_at_the_wrap_width() {
        let first = "x".repeat(79);
        let text = format!("{first}tail\nnext line\n");

        let lines = rejoin_wrapped_lines(&text, 79);

        assert_eq!(lines, [format!("{first}tail"), "next line".to_owned()]);
    }

    #[test]
    fn rejoins_a_message_split_across_several_wraps() {
        let segment = "y".repeat(79);
        let text = format!("{segment}{segment}end\n");

        let lines = rejoin_wrapped_lines(&text, 79);

        assert_eq!(lines, [format!("{segment}{segment}end")]);
    }

    /// The `l.NN` excerpt names the command TeX choked on, and it arrives on a
    /// different line from the error. Parsing the stream line by line loses it.
    #[test]
    fn names_the_undefined_command_from_the_context_line() -> Result<(), Box<dyn std::error::Error>>
    {
        let log = "./main.tex:12: Undefined control sequence.\nl.12 \\qed\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::UndefinedControlSequence);
        assert!(diagnostic
            .message
            .starts_with("\\qed isn't a known command"));
        assert_eq!(diagnostic.context.as_deref(), Some("l.12 \\qed"));
        assert_eq!(diagnostic.file.as_deref(), Some("main.tex"));
        assert_eq!(diagnostic.line, Some(12));
        assert_eq!(diagnostic.raw, "./main.tex:12: Undefined control sequence.");
        Ok(())
    }

    #[test]
    fn recognises_a_missing_package_by_name() -> Result<(), Box<dyn std::error::Error>> {
        let log = "! LaTeX Error: File `algorithm2e.sty' not found.\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::MissingPackage);
        assert_eq!(
            diagnostic.message,
            "The package algorithm2e isn't installed. Install it to build this document."
        );
        Ok(())
    }

    #[test]
    fn separates_a_missing_asset_from_a_missing_package() {
        let log = "! LaTeX Error: File `figures/plot.png' not found.\n";

        let diagnostics = diagnostics_from_log(log, root());

        assert_eq!(
            diagnostics.first().map(|item| item.code),
            Some(DiagnosticCode::MissingFile)
        );
    }

    /// The line number lives inside the warning's prose. Discarding it leaves
    /// the reader with a problem and no place to go.
    #[test]
    fn takes_the_line_number_out_of_warning_prose() -> Result<(), Box<dyn std::error::Error>> {
        let log = "LaTeX Warning: Reference `fig:flow' on page 3 undefined on input line 88.\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::UndefinedReference);
        assert_eq!(diagnostic.line, Some(88));
        assert_eq!(diagnostic.severity, DiagnosticSeverity::Warning);
        assert!(diagnostic.message.contains("\\label{fig:flow}"));
        Ok(())
    }

    #[test]
    fn reads_an_undefined_citation_key() -> Result<(), Box<dyn std::error::Error>> {
        let log = "LaTeX Warning: Citation `smith2020' on page 1 undefined on input line 42.\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::UndefinedCitation);
        assert!(diagnostic.message.contains("\\cite{smith2020}"));
        Ok(())
    }

    /// latexmk runs the engine two or three times. The same warning from each
    /// pass is one problem; listing it three times teaches people to ignore
    /// the panel.
    #[test]
    fn collapses_a_warning_repeated_by_every_pass() {
        let line = "LaTeX Warning: Reference `fig:flow' on page 3 undefined on input line 88.\n";
        let log = line.repeat(3);

        let diagnostics = diagnostics_from_log(&log, root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics.first().map(|item| item.occurrences), Some(3));
    }

    #[test]
    fn measures_an_overfull_box_and_locates_it() -> Result<(), Box<dyn std::error::Error>> {
        let log = "Overfull \\hbox (12.34pt too wide) in paragraph at lines 12--14\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::OverfullBox);
        assert_eq!(diagnostic.severity, DiagnosticSeverity::Warning);
        assert_eq!(diagnostic.line, Some(12));
        assert_eq!(
            diagnostic.message,
            "This line runs 12.34pt past the right margin."
        );
        Ok(())
    }

    #[test]
    fn ranks_errors_before_warnings_and_located_before_unlocated() {
        let log = concat!(
            "Overfull \\hbox (1.0pt too wide) in paragraph at lines 90--91\n",
            "! Missing $ inserted.\n",
            "./chapters/intro.tex:5: Undefined control sequence.\n",
            "l.5 \\nope\n",
        );

        let diagnostics = diagnostics_from_log(log, root());

        let codes: Vec<_> = diagnostics.iter().map(|item| item.code).collect();
        assert_eq!(
            codes,
            [
                DiagnosticCode::UndefinedControlSequence,
                DiagnosticCode::MissingDollar,
                DiagnosticCode::OverfullBox,
            ]
        );
    }

    /// A path that escapes the project is reported without a location rather
    /// than pointing at a file outside it.
    #[test]
    fn refuses_to_map_a_traversing_path() -> Result<(), Box<dyn std::error::Error>> {
        let log = "../outside.tex:3: Undefined control sequence.\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert!(diagnostic.file.is_none());
        assert!(diagnostic.mapping_uncertain);
        Ok(())
    }

    /// An unrecognised record keeps the compiler's own wording. Dropping what
    /// was not understood would hide the only evidence of some failures.
    #[test]
    fn keeps_an_unrecognised_error_verbatim() -> Result<(), Box<dyn std::error::Error>> {
        let log = "! Package tikz Error: Giving up on this path.\n";

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::CompilerMessage);
        assert_eq!(
            diagnostic.message,
            "Package tikz Error: Giving up on this path."
        );
        assert_eq!(
            diagnostic.raw,
            "! Package tikz Error: Giving up on this path."
        );
        Ok(())
    }

    #[test]
    fn parses_windows_file_line_locations() {
        assert_eq!(
            super::file_line_message(r"C:\work\main.tex:12: Undefined control sequence"),
            Some((r"C:\work\main.tex", 12, " Undefined control sequence"))
        );
    }

    #[test]
    fn ignores_ordinary_log_noise() {
        let log = "This is pdfTeX, Version 3.141592653\n(./main.tex\nLaTeX2e <2024-06-01>\n";

        assert!(diagnostics_from_log(log, root()).is_empty());
    }

    /// A real log holds both shapes within a few lines of each other: a path
    /// genuinely cut at the wrap width, and a path that happens to be exactly
    /// that long followed by a record of its own. Joining on length alone
    /// swallowed the second one.
    #[test]
    fn does_not_swallow_the_record_after_a_naturally_full_line() {
        let full_path = "/usr/local/texlive/texmf-dist/tex/latex/l3packages/xparse/xparse.st";
        let padded = format!("({full_path}{}", "y".repeat(79 - full_path.len() - 1));
        let text = format!("{padded}\nOverfull \\hbox (5.0pt too wide) at lines 3--4\n");
        assert_eq!(padded.chars().count(), 79);

        let lines = rejoin_wrapped_lines(&text, 79);

        assert_eq!(lines.len(), 2);
        assert_eq!(
            lines.get(1).map(String::as_str),
            Some("Overfull \\hbox (5.0pt too wide) at lines 3--4")
        );
    }

    /// The complementary case: a genuinely wrapped line whose continuation is
    /// prose must still be rejoined.
    #[test]
    fn still_rejoins_a_wrap_whose_continuation_is_prose() {
        let head = "x".repeat(79);
        let text = format!("{head}\nef\n");

        let lines = rejoin_wrapped_lines(&text, 79);

        assert_eq!(lines, [format!("{head}ef")]);
    }

    /// Verbatim from a real `latexmk` run of the `broken-build` fixture: the
    /// error, the `l.NN` excerpt naming the command, and TeX's own advice
    /// paragraph beneath it. The advice is prose, not a record, and must not
    /// become a diagnostic of its own.
    #[test]
    fn reads_a_real_failing_run_verbatim() -> Result<(), Box<dyn std::error::Error>> {
        let log = concat!(
            "LaTeX Font Info:    ... okay on input line 2.\n",
            " (./sections/failure.tex\n",
            "./sections/failure.tex:4: Undefined control sequence.\n",
            "l.4 \\FixtureCommandThatMustNotExist\n",
            "                                   \n",
            "The control sequence at the end of the top line\n",
            "of your error message was never \\def'ed. If you have\n",
            "misspelled it (e.g., `\\hobx'), type `I' and the correct\n",
            "spelling (e.g., `I\\hbox'). Otherwise just continue,\n",
            "and I'll forget about whatever was undefined.\n",
        );

        let diagnostics = diagnostics_from_log(log, root());

        let diagnostic = only(&diagnostics)?;
        assert_eq!(diagnostic.code, DiagnosticCode::UndefinedControlSequence);
        assert_eq!(diagnostic.severity, DiagnosticSeverity::Error);
        assert_eq!(diagnostic.file.as_deref(), Some("sections/failure.tex"));
        assert_eq!(diagnostic.line, Some(4));
        assert_eq!(
            diagnostic.message,
            "\\FixtureCommandThatMustNotExist isn't a known command here. Check the spelling, or add the package that defines it."
        );
        assert_eq!(
            diagnostic.context.as_deref(),
            Some("l.4 \\FixtureCommandThatMustNotExist")
        );
        Ok(())
    }

    /// The committed fixture is a real, clean `latexmk` + `biber` log. A clean
    /// build must produce no diagnostics at all; anything reported here is a
    /// false positive the panel would show a user who did nothing wrong.
    #[test]
    fn reports_nothing_for_a_real_clean_build_log() -> Result<(), Box<dyn std::error::Error>> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/latex-projects/biblatex-biber/main.log");
        let Ok(text) = std::fs::read(&path) else {
            return Ok(());
        };

        let diagnostics = diagnostics_from_log(&String::from_utf8_lossy(&text), root());

        assert!(
            diagnostics.is_empty(),
            "clean build reported {:?}",
            diagnostics
                .iter()
                .map(|item| item.message.as_str())
                .collect::<Vec<_>>()
        );
        Ok(())
    }
}
