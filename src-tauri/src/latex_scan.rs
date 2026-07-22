//! Turns LaTeX and BibTeX text into positioned symbol occurrences.
//!
//! This is the Rust counterpart of `src/domain/latex-syntax.ts` and owns one
//! job: saying where in a file a symbol is named, and in what role. It answers
//! nothing about the project as a whole — `latex_analysis` does that.
//!
//! The scan consumes escapes as it advances rather than looking behind for
//! backslashes, and it skips comments, verbatim environments, and inline
//! verbatim arguments. Those exclusions are what make an "undefined symbol"
//! conclusion safe: a `\ref` inside a commented-out paragraph or a code listing
//! must not be treated as a real reference.

use std::collections::HashSet;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum Role {
    LabelDefinition,
    LabelReference,
    CitationDefinition,
    CitationReference,
    FileReference,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Occurrence {
    pub role: Role,
    /// The symbol text exactly as written, trimmed.
    pub name: String,
    /// Byte offset of the first character of `name`.
    pub start: usize,
    /// Byte offset one past the last character of `name`.
    pub end: usize,
    /// The command that introduced the occurrence, without its backslash.
    pub command: String,
}

/// What a file's macro definitions imply about the reliability of symbol
/// analysis. A project that builds label or citation keys inside a macro body
/// hides them from a purely textual scan, so the undefined-symbol checks must
/// stand down rather than report references they cannot resolve.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct MacroFacts {
    pub defines_labels: bool,
    pub defines_citations: bool,
    /// `\graphicspath` moves image lookup outside the including file's
    /// directory, so unresolved image references stop being conclusive.
    pub sets_graphics_path: bool,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct FileScan {
    pub occurrences: Vec<Occurrence>,
    pub facts: MacroFacts,
}

const LABEL_REFERENCE_COMMANDS: &[&str] = &[
    "autopageref",
    "autoref",
    "cpageref",
    "Cpageref",
    "cref",
    "Cref",
    "crefrange",
    "Crefrange",
    "eqref",
    "fullref",
    "labelcref",
    "nameref",
    "pageref",
    "ref",
    "vref",
    "Vref",
];

const CITATION_COMMANDS: &[&str] = &[
    "autocite",
    "Autocite",
    "citealp",
    "citealt",
    "citeauthor",
    "cite",
    "citenum",
    "citep",
    "citet",
    "citeyear",
    "citeyearpar",
    "footcite",
    "fullcite",
    "nocite",
    "parencite",
    "Parencite",
    "smartcite",
    "supercite",
    "textcite",
    "Textcite",
];

const MACRO_DEFINITION_COMMANDS: &[&str] = &[
    "DeclareRobustCommand",
    "NewDocumentCommand",
    "ProvideDocumentCommand",
    "RenewDocumentCommand",
    "newcommand",
    "providecommand",
    "renewcommand",
];

/// Commands whose file path lives in the required group at the given index.
const FILE_COMMANDS: &[(&str, usize)] = &[
    ("addbibresource", 0),
    ("bibliography", 0),
    ("include", 0),
    ("includefrom", 1),
    ("includegraphics", 0),
    ("import", 1),
    ("input", 0),
    ("inputminted", 1),
    ("lstinputlisting", 0),
    ("subfile", 0),
    ("subimport", 1),
    ("subincludefrom", 1),
];

const VERBATIM_ENVIRONMENTS: &[&str] = &[
    "BVerbatim",
    "LVerbatim",
    "Verbatim",
    "alltt",
    "code",
    "comment",
    "filecontents",
    "lstlisting",
    "minted",
    "verbatim",
];

const INLINE_VERBATIM_COMMANDS: &[&str] = &["Verb", "lstinline", "mintinline", "verb"];

const MAX_OCCURRENCES: usize = 20_000;
const MAX_ARGUMENT_GROUPS: usize = 4;
const MAX_ENVIRONMENT_NAME: usize = 128;
/// Ceiling on the macro body inspected for hidden label or citation commands.
const MAX_MACRO_BODY: usize = 4_096;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum GroupKind {
    Optional,
    Required,
}

#[derive(Clone, Debug)]
struct Group {
    kind: GroupKind,
    /// Byte offset of the first character inside the delimiters.
    from: usize,
    /// Byte offset of the closing delimiter.
    to: usize,
}

fn char_at(source: &str, index: usize) -> Option<char> {
    source.get(index..).and_then(|rest| rest.chars().next())
}

fn is_command_character(character: char) -> bool {
    character.is_ascii_alphabetic() || character == '@'
}

/// Reads the delimited groups following `index`, tolerating whitespace but
/// stopping at a blank line, which ends a paragraph and cannot separate a
/// command from its argument.
fn read_arguments(source: &str, index: usize) -> Vec<Group> {
    let mut groups = Vec::new();
    let mut cursor = index;
    while groups.len() < MAX_ARGUMENT_GROUPS {
        let mut newlines = 0_usize;
        while let Some(character) = char_at(source, cursor) {
            if !character.is_whitespace() {
                break;
            }
            if character == '\n' {
                newlines += 1;
                if newlines > 1 {
                    return groups;
                }
            }
            cursor += character.len_utf8();
        }
        let (kind, closing) = match char_at(source, cursor) {
            Some('[') => (GroupKind::Optional, ']'),
            Some('{') => (GroupKind::Required, '}'),
            _ => return groups,
        };
        let opening = if closing == ']' { '[' } else { '{' };
        let from = cursor + opening.len_utf8();
        let mut depth = 1_usize;
        let mut scan = from;
        let close = loop {
            let Some(character) = char_at(source, scan) else {
                return groups;
            };
            if character == '\\' {
                scan += character.len_utf8();
                match char_at(source, scan) {
                    Some(escaped) => scan += escaped.len_utf8(),
                    None => return groups,
                }
                continue;
            }
            if character == opening {
                depth += 1;
            } else if character == closing {
                depth -= 1;
                if depth == 0 {
                    break scan;
                }
            }
            scan += character.len_utf8();
        };
        groups.push(Group {
            kind,
            from,
            to: close,
        });
        cursor = close + closing.len_utf8();
    }
    groups
}

fn required_groups(groups: &[Group]) -> Vec<&Group> {
    groups
        .iter()
        .filter(|group| group.kind == GroupKind::Required)
        .collect()
}

/// The trimmed value of a group with the byte span of the trimmed text.
fn single_value(source: &str, group: &Group) -> Option<(String, usize, usize)> {
    let raw = source.get(group.from..group.to)?;
    let leading = raw.len() - raw.trim_start().len();
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }
    let start = group.from + leading;
    Some((value.to_owned(), start, start + value.len()))
}

/// Each comma-separated value of a group with its own byte span.
fn comma_values(source: &str, group: &Group) -> Vec<(String, usize, usize)> {
    let Some(raw) = source.get(group.from..group.to) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    let mut offset = 0_usize;
    for part in raw.split(',') {
        let leading = part.len() - part.trim_start().len();
        let value = part.trim();
        if !value.is_empty() {
            let start = group.from + offset + leading;
            values.push((value.to_owned(), start, start + value.len()));
        }
        offset += part.len() + ','.len_utf8();
    }
    values
}

/// The environment name in the group at `index`, and the offset past its close.
fn read_environment_name(source: &str, index: usize) -> Option<(String, usize)> {
    let mut cursor = index;
    while matches!(char_at(source, cursor), Some(' ') | Some('\t')) {
        cursor += 1;
    }
    if char_at(source, cursor) != Some('{') {
        return None;
    }
    let from = cursor + '{'.len_utf8();
    let rest = source.get(from..)?;
    let limit = rest.len().min(MAX_ENVIRONMENT_NAME);
    let close = rest.get(..limit)?.find('}')?;
    Some((
        rest[..close].trim().to_owned(),
        from + close + '}'.len_utf8(),
    ))
}

/// Scans one `.tex` source into positioned occurrences and macro facts.
pub(crate) fn scan_latex(source: &str) -> FileScan {
    let label_references: HashSet<&str> = LABEL_REFERENCE_COMMANDS.iter().copied().collect();
    let citations: HashSet<&str> = CITATION_COMMANDS.iter().copied().collect();
    let macro_definitions: HashSet<&str> = MACRO_DEFINITION_COMMANDS.iter().copied().collect();
    let verbatim_environments: HashSet<&str> = VERBATIM_ENVIRONMENTS.iter().copied().collect();
    let inline_verbatim: HashSet<&str> = INLINE_VERBATIM_COMMANDS.iter().copied().collect();

    let mut scan = FileScan::default();
    let mut index = 0_usize;

    while index < source.len() {
        let Some(character) = char_at(source, index) else {
            break;
        };

        if character == '%' {
            index = source[index..]
                .find('\n')
                .map_or(source.len(), |offset| index + offset + 1);
            continue;
        }

        if character != '\\' {
            index += character.len_utf8();
            continue;
        }

        let mut name_end = index + '\\'.len_utf8();
        while let Some(next) = char_at(source, name_end) {
            if !is_command_character(next) {
                break;
            }
            name_end += next.len_utf8();
        }

        if name_end == index + '\\'.len_utf8() {
            // A single escaped character, which is how `\%`, `\{`, and `\\`
            // avoid being mistaken for structure.
            index = match char_at(source, name_end) {
                Some(escaped) => name_end + escaped.len_utf8(),
                None => source.len(),
            };
            continue;
        }

        let command = &source[index + '\\'.len_utf8()..name_end];
        let after_name = if char_at(source, name_end) == Some('*') {
            name_end + 1
        } else {
            name_end
        };

        if command == "begin" {
            let Some((name, next)) = read_environment_name(source, after_name) else {
                index = after_name;
                continue;
            };
            if verbatim_environments.contains(name.trim_end_matches('*')) {
                let terminator = format!("\\end{{{name}}}");
                index = source[next..]
                    .find(&terminator)
                    .map_or(source.len(), |offset| next + offset + terminator.len());
            } else {
                index = next;
            }
            continue;
        }

        if command == "end" {
            index = read_environment_name(source, after_name).map_or(after_name, |(_, next)| next);
            continue;
        }

        if inline_verbatim.contains(command) {
            index = skip_inline_verbatim(source, after_name);
            continue;
        }

        if command == "graphicspath" {
            scan.facts.sets_graphics_path = true;
            index = after_name;
            continue;
        }

        if macro_definitions.contains(command) || command == "def" {
            note_macro_facts(source, after_name, &mut scan.facts);
            index = after_name;
            continue;
        }

        if scan.occurrences.len() >= MAX_OCCURRENCES {
            index = after_name;
            continue;
        }

        collect_occurrences(
            source,
            command,
            after_name,
            &label_references,
            &citations,
            &mut scan.occurrences,
        );
        index = after_name;
    }

    scan
}

/// Skips a `\verb`-style argument, which is delimited by whatever character
/// follows the command and never spans a line.
fn skip_inline_verbatim(source: &str, after_name: usize) -> usize {
    let mut cursor = after_name;
    if char_at(source, cursor) == Some('{') {
        // `\mintinline{lang}|code|` takes a language argument first.
        cursor = source[cursor..]
            .find('}')
            .map_or(source.len(), |offset| cursor + offset + '}'.len_utf8());
    }
    let Some(delimiter) = char_at(source, cursor) else {
        return source.len();
    };
    if delimiter == '\n' {
        return cursor;
    }
    let body = cursor + delimiter.len_utf8();
    let Some(rest) = source.get(body..) else {
        return source.len();
    };
    let limit = rest.find('\n').unwrap_or(rest.len());
    match rest[..limit].find(delimiter) {
        Some(offset) => body + offset + delimiter.len_utf8(),
        None => body + limit,
    }
}

/// Records whether a macro body hides a label or citation command, so the
/// undefined-symbol checks can stand down for the whole project.
fn note_macro_facts(source: &str, after_name: usize, facts: &mut MacroFacts) {
    let end = (after_name + MAX_MACRO_BODY).min(source.len());
    let mut window_end = end;
    while window_end > after_name && !source.is_char_boundary(window_end) {
        window_end -= 1;
    }
    let Some(body) = source.get(after_name..window_end) else {
        return;
    };
    if body.contains("\\label") {
        facts.defines_labels = true;
    }
    if body.contains("\\cite") || body.contains("\\bibitem") {
        facts.defines_citations = true;
    }
}

fn collect_occurrences(
    source: &str,
    command: &str,
    after_name: usize,
    label_references: &HashSet<&str>,
    citations: &HashSet<&str>,
    occurrences: &mut Vec<Occurrence>,
) {
    let file_group = FILE_COMMANDS
        .iter()
        .find(|(name, _)| *name == command)
        .map(|(_, index)| *index);
    let is_label = command == "label";
    let is_bibitem = command == "bibitem";
    let is_reference = label_references.contains(command);
    let is_citation = citations.contains(command);

    if !is_label && !is_bibitem && !is_reference && !is_citation && file_group.is_none() {
        return;
    }

    let parsed = read_arguments(source, after_name);
    let required = required_groups(&parsed);

    if is_label || is_bibitem {
        let role = if is_label {
            Role::LabelDefinition
        } else {
            Role::CitationDefinition
        };
        if let Some(group) = required.first() {
            if let Some((name, start, end)) = single_value(source, group) {
                occurrences.push(Occurrence {
                    role,
                    name,
                    start,
                    end,
                    command: command.to_owned(),
                });
            }
        }
        return;
    }

    if is_reference {
        push_comma_values(
            source,
            required.first().copied(),
            Role::LabelReference,
            command,
            occurrences,
        );
        return;
    }

    if is_citation {
        // Biblatex's multi-cite commands place keys in the last required group.
        push_comma_values(
            source,
            required.last().copied(),
            Role::CitationReference,
            command,
            occurrences,
        );
        return;
    }

    let Some(group_index) = file_group else {
        return;
    };
    let Some(group) = required.get(group_index) else {
        return;
    };
    let directory = if group_index == 0 {
        String::new()
    } else {
        required
            .first()
            .and_then(|first| single_value(source, first))
            .map_or(String::new(), |(value, _, _)| value)
    };
    for (value, start, end) in comma_values(source, group) {
        let name = if directory.is_empty() {
            value
        } else if directory.ends_with('/') {
            format!("{directory}{value}")
        } else {
            format!("{directory}/{value}")
        };
        occurrences.push(Occurrence {
            role: Role::FileReference,
            name,
            start,
            end,
            command: command.to_owned(),
        });
    }
}

fn push_comma_values(
    source: &str,
    group: Option<&Group>,
    role: Role,
    command: &str,
    occurrences: &mut Vec<Occurrence>,
) {
    let Some(group) = group else {
        return;
    };
    for (name, start, end) in comma_values(source, group) {
        occurrences.push(Occurrence {
            role,
            name,
            start,
            end,
            command: command.to_owned(),
        });
    }
}

/// Scans a `.bib` file into positioned entry keys, ignoring the non-reference
/// `@string`, `@preamble`, and `@comment` entry types.
pub(crate) fn scan_bib(source: &str) -> Vec<Occurrence> {
    let mut occurrences = Vec::new();
    for (at, _) in source.match_indices('@') {
        if occurrences.len() >= MAX_OCCURRENCES {
            break;
        }
        let after_at = at + '@'.len_utf8();
        let Some(rest) = source.get(after_at..) else {
            continue;
        };
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
        let after_type = &rest[type_len..];
        let braces = after_type.len() - after_type.trim_start().len();
        let Some(body) = after_type.trim_start().strip_prefix('{') else {
            continue;
        };
        let key_start = after_at + type_len + braces + '{'.len_utf8();
        let end = body
            .find(|character: char| {
                character == ',' || character == '}' || character.is_whitespace()
            })
            .unwrap_or(body.len());
        let key = &body[..end];
        if key.is_empty() {
            continue;
        }
        occurrences.push(Occurrence {
            role: Role::CitationDefinition,
            name: key.to_owned(),
            start: key_start,
            end: key_start + key.len(),
            command: String::new(),
        });
    }
    occurrences
}

#[cfg(test)]
mod tests {
    use super::{scan_bib, scan_latex, Role};

    fn names(source: &str, role: Role) -> Vec<String> {
        scan_latex(source)
            .occurrences
            .into_iter()
            .filter(|occurrence| occurrence.role == role)
            .map(|occurrence| occurrence.name)
            .collect()
    }

    #[test]
    fn separates_label_definitions_from_references() {
        let source = "\\label{sec:a}\\ref{sec:a}\\cref{sec:a,sec:b}";
        assert_eq!(names(source, Role::LabelDefinition), vec!["sec:a"]);
        assert_eq!(
            names(source, Role::LabelReference),
            vec!["sec:a", "sec:a", "sec:b"]
        );
    }

    #[test]
    fn reports_the_exact_span_of_each_citation_key() {
        let source = "\\cite{knuth1984, lamport1994}";
        let spans: Vec<&str> = scan_latex(source)
            .occurrences
            .iter()
            .map(|occurrence| &source[occurrence.start..occurrence.end])
            .collect();
        assert_eq!(spans, vec!["knuth1984", "lamport1994"]);
    }

    #[test]
    fn takes_the_last_required_group_of_a_multi_cite() {
        assert_eq!(
            names("\\textcite[see][12]{knuth1984}", Role::CitationReference),
            vec!["knuth1984"]
        );
    }

    #[test]
    fn ignores_symbols_inside_comments_and_verbatim() {
        let source =
            "% \\ref{commented}\n\\begin{verbatim}\n\\ref{listed}\n\\end{verbatim}\n\\ref{real}";
        assert_eq!(names(source, Role::LabelReference), vec!["real"]);
    }

    #[test]
    fn ignores_a_symbol_inside_an_inline_verb_argument() {
        assert_eq!(
            names("\\verb|\\ref{listed}| \\ref{real}", Role::LabelReference),
            vec!["real"]
        );
    }

    #[test]
    fn does_not_treat_an_escaped_percent_as_a_comment() {
        assert_eq!(
            names("100\\% done \\ref{real}", Role::LabelReference),
            vec!["real"]
        );
    }

    #[test]
    fn joins_an_import_directory_with_its_file() {
        assert_eq!(
            names("\\subimport{chapters/}{intro}", Role::FileReference),
            vec!["chapters/intro"]
        );
    }

    #[test]
    fn notes_a_macro_that_hides_a_label_command() {
        assert!(
            scan_latex("\\newcommand{\\tag}[1]{\\label{t:#1}}")
                .facts
                .defines_labels
        );
        assert!(
            !scan_latex("\\newcommand{\\vect}[1]{\\mathbf{#1}}")
                .facts
                .defines_labels
        );
    }

    #[test]
    fn notes_a_declared_graphics_path() {
        assert!(
            scan_latex("\\graphicspath{{figures/}}")
                .facts
                .sets_graphics_path
        );
    }

    #[test]
    fn keeps_byte_spans_valid_across_multibyte_text() {
        let source = "Grüße — \\label{sec:end}";
        let occurrence = scan_latex(source).occurrences.remove(0);
        assert_eq!(&source[occurrence.start..occurrence.end], "sec:end");
    }

    #[test]
    fn extracts_bib_keys_with_their_spans() {
        let source = "@string{acm = {ACM}}\n@article{knuth1984,\n  title = {x}\n}";
        let keys = scan_bib(source);
        assert_eq!(keys.len(), 1);
        let key = &keys[0];
        assert_eq!(&source[key.start..key.end], "knuth1984");
    }

    #[test]
    fn terminates_on_an_unterminated_group() {
        let source = format!("\\ref{{{}", "x".repeat(10_000));
        assert!(scan_latex(&source).occurrences.is_empty());
    }
}
