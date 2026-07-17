#[derive(Clone, Debug, Eq, PartialEq)]
enum CompletionContext {
    None,
    Command {
        from: usize,
        prefix: String,
    },
    BeginEnvironment {
        from: usize,
        prefix: String,
    },
    EndEnvironment {
        from: usize,
        prefix: String,
    },
    Argument {
        from: usize,
        command: String,
        prefix: String,
    },
}

fn completion_context(source: &str, position: usize) -> CompletionContext {
    if position > source.len() || !source.is_char_boundary(position) {
        return CompletionContext::None;
    }

    let line_start = source[..position].rfind('\n').map_or(0, |index| index + 1);
    if source[line_start..position]
        .char_indices()
        .any(|(offset, character)| character == '%' && !is_escaped(source, line_start + offset))
    {
        return CompletionContext::None;
    }

    let mut name_start = position;
    while name_start > line_start {
        let Some(character) = source[..name_start].chars().next_back() else {
            break;
        };
        if !character.is_ascii_alphabetic() && character != '@' {
            break;
        }
        name_start -= character.len_utf8();
    }
    let prefix = source[name_start..position].to_owned();

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
                _ => CompletionContext::Argument {
                    from,
                    command,
                    prefix,
                },
            };
        }
    }

    CompletionContext::None
}

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

fn is_escaped(source: &str, position: usize) -> bool {
    let mut count = 0;
    let mut cursor = position;
    while cursor > 0 && source[..cursor].ends_with('\\') {
        count += 1;
        cursor -= '\\'.len_utf8();
    }
    count % 2 == 1
}

#[cfg(test)]
mod tests {
    use super::{
        completion_context, query, query_labels, resolve_completions, CompletionContext,
        CompletionProvenance, CompletionRequest,
    };

    #[test]
    fn detects_a_command_prefix_after_an_unescaped_backslash() {
        assert_eq!(
            completion_context("Text \\sec", 9),
            CompletionContext::Command {
                prefix: "sec".into(),
                from: 5,
            }
        );
    }

    #[test]
    fn detects_begin_and_end_environment_prefixes() {
        assert_eq!(
            completion_context("\\begin{fig", 10),
            CompletionContext::BeginEnvironment {
                prefix: "fig".into(),
                from: 7,
            }
        );
        assert_eq!(
            completion_context("\\end{ite", 8),
            CompletionContext::EndEnvironment {
                prefix: "ite".into(),
                from: 5,
            }
        );
    }

    #[test]
    fn suppresses_completion_in_plain_text_and_comments() {
        assert_eq!(
            completion_context("ordinary words", 13),
            CompletionContext::None
        );
        assert_eq!(completion_context("% \\sec", 6), CompletionContext::None);
    }

    #[test]
    fn ranks_a_local_macro_before_a_core_command() {
        let source = "\\newcommand{\\sectioner}[1]{#1}\n\\sec";
        assert_eq!(query(source, source.len()).items[0].label, "\\sectioner");
    }

    #[test]
    fn offers_align_only_when_amsmath_is_declared() {
        assert!(query_labels("\\begin{ali", 10).is_empty());
        assert_eq!(
            query_labels("\\usepackage{amsmath}\n\\begin{ali", 31),
            vec!["align"]
        );
    }

    #[test]
    fn proposes_the_nearest_open_environment_when_ending() {
        let source = "\\begin{figure}\n  \\end{fi";
        assert_eq!(query(source, source.len()).items[0].label, "figure");
    }

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

    #[test]
    fn offers_core_structure_snippets_in_a_command_context() {
        assert!(query_labels("\\enum", 5).contains(&"enumerate environment".to_owned()));
        assert!(query_labels("\\desc", 5).contains(&"description environment".to_owned()));
        assert!(query_labels("\\tab", 4).contains(&"table environment".to_owned()));
    }

    #[test]
    fn gates_package_snippets_behind_their_prerequisite() {
        assert!(!query_labels("\\theo", 5).contains(&"theorem environment".to_owned()));
        let source = "\\usepackage{amsthm}\n\\theo";
        assert!(query_labels(source, source.len()).contains(&"theorem environment".to_owned()));

        assert!(!query_labels("\\fram", 5).contains(&"frame environment".to_owned()));
        let beamer = "\\usepackage{beamer}\n\\fram";
        assert!(query_labels(beamer, beamer.len()).contains(&"frame environment".to_owned()));
    }

    #[test]
    fn offers_booktabs_rules_only_when_declared() {
        assert!(!query_labels("\\topr", 5).contains(&"\\toprule".to_owned()));
        let source = "\\usepackage{booktabs}\n\\topr";
        assert!(query_labels(source, source.len()).contains(&"\\toprule".to_owned()));
    }

    #[test]
    fn reports_the_package_a_capability_requires() {
        let source = "\\usepackage{amsmath}\n\\begin{ali";
        let requires = query(source, source.len())
            .items
            .into_iter()
            .find(|item| item.label == "align")
            .map(|item| item.requires);
        assert_eq!(requires, Some(Some("amsmath")));

        let core = query("\\sec", 4)
            .items
            .into_iter()
            .find(|item| item.label == "\\section")
            .map(|item| item.requires);
        assert_eq!(core, Some(None));
    }

    #[test]
    fn deduplicates_a_redefined_core_command() {
        let source = "\\renewcommand{\\section}{}\n\\section";
        let matches = query_labels(source, source.len())
            .into_iter()
            .filter(|label| label == "\\section")
            .count();
        assert_eq!(matches, 1);
    }

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
        assert!(matches!(
            response.items[0].provenance,
            CompletionProvenance::Project
        ));

        fs::remove_dir_all(root).ok();
    }
}
use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::latex_project_scan::{scan_project, ProjectSources};
use crate::latex_symbols::{
    bib_keys_in, bibitem_keys_in, classify_command, file_extensions, format_file_label, labels_in,
    match_symbols, ArgumentTarget, ResolvedSymbol, SymbolKind,
};
use crate::{project_access::ProjectAccess, source_read};
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletionRequest {
    project_path: String,
    relative_path: String,
    content: String,
    position: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    items: Vec<CompletionItem>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompletionItem {
    label: String,
    detail: &'static str,
    kind: CompletionKind,
    provenance: CompletionProvenance,
    /// The package a suggestion depends on, so the editor can explain why it appears;
    /// `None` for core and locally defined entries.
    requires: Option<&'static str>,
    from: usize,
    to: usize,
    insert_text: String,
    /// The project-relative file that defines a project symbol, so the editor can
    /// name its origin; `None` for catalog items and for file suggestions.
    source: Option<String>,
}

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

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum CompletionProvenance {
    Core,
    Package,
    Local,
    Project,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionError {
    code: &'static str,
    message: &'static str,
}

#[derive(Clone, Copy)]
struct Capability {
    name: &'static str,
    detail: &'static str,
    package: Option<&'static str>,
}

const COMMANDS: &[Capability] = &[
    Capability {
        name: "begin",
        detail: "Start an environment.",
        package: None,
    },
    Capability {
        name: "bottomrule",
        detail: "Bottom rule from booktabs.",
        package: Some("booktabs"),
    },
    Capability {
        name: "caption",
        detail: "Add a caption to a float.",
        package: None,
    },
    Capability {
        name: "chapter",
        detail: "Start a chapter in supporting classes.",
        package: None,
    },
    Capability {
        name: "cite",
        detail: "Cite a bibliography entry.",
        package: None,
    },
    Capability {
        name: "documentclass",
        detail: "Choose the document class.",
        package: None,
    },
    Capability {
        name: "end",
        detail: "End an environment.",
        package: None,
    },
    Capability {
        name: "includegraphics",
        detail: "Include a graphic file.",
        package: Some("graphicx"),
    },
    Capability {
        name: "item",
        detail: "Add an item to a list.",
        package: None,
    },
    Capability {
        name: "label",
        detail: "Define a cross-reference label.",
        package: None,
    },
    Capability {
        name: "midrule",
        detail: "Middle rule from booktabs.",
        package: Some("booktabs"),
    },
    Capability {
        name: "ref",
        detail: "Reference a label.",
        package: None,
    },
    Capability {
        name: "section",
        detail: "Start a section.",
        package: None,
    },
    Capability {
        name: "subsection",
        detail: "Start a subsection.",
        package: None,
    },
    Capability {
        name: "toprule",
        detail: "Top rule from booktabs.",
        package: Some("booktabs"),
    },
    Capability {
        name: "usepackage",
        detail: "Load a LaTeX package.",
        package: None,
    },
];

const ENVIRONMENTS: &[Capability] = &[
    Capability {
        name: "description",
        detail: "Labelled list environment.",
        package: None,
    },
    Capability {
        name: "enumerate",
        detail: "Numbered list environment.",
        package: None,
    },
    Capability {
        name: "equation",
        detail: "Numbered display equation.",
        package: None,
    },
    Capability {
        name: "figure",
        detail: "Floating figure environment.",
        package: None,
    },
    Capability {
        name: "itemize",
        detail: "Bulleted list environment.",
        package: None,
    },
    Capability {
        name: "table",
        detail: "Floating table environment.",
        package: None,
    },
    Capability {
        name: "align",
        detail: "Aligned display equations.",
        package: Some("amsmath"),
    },
    Capability {
        name: "frame",
        detail: "Beamer slide frame.",
        package: Some("beamer"),
    },
    Capability {
        name: "theorem",
        detail: "Theorem-like environment.",
        package: Some("amsthm"),
    },
];

/// Ranking tiers, lower first: a matching open environment for an end tag, then a
/// local definition, then a declared package/class capability, then a core capability.
const TIER_OPEN_ENVIRONMENT: u8 = 0;
const TIER_LOCAL: u8 = 1;
const TIER_PACKAGE: u8 = 2;
const TIER_CORE: u8 = 3;

struct Snippet {
    name: &'static str,
    detail: &'static str,
    package: Option<&'static str>,
    insert_text: &'static str,
}

const SNIPPETS: &[Snippet] = &[
    Snippet {
        name: "itemize",
        detail: "Insert a bulleted list with an item placeholder.",
        package: None,
        insert_text: "\\begin{itemize}\n  \\item ${item}\n\\end{itemize}",
    },
    Snippet {
        name: "enumerate",
        detail: "Insert a numbered list with an item placeholder.",
        package: None,
        insert_text: "\\begin{enumerate}\n  \\item ${item}\n\\end{enumerate}",
    },
    Snippet {
        name: "description",
        detail: "Insert a labelled list with term and description placeholders.",
        package: None,
        insert_text: "\\begin{description}\n  \\item[${term}] ${description}\n\\end{description}",
    },
    Snippet {
        name: "figure",
        detail: "Insert a figure with image, caption, and label placeholders.",
        package: None,
        insert_text: "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics{${file}}\n  \\caption{${caption}}\n  \\label{fig:${label}}\n\\end{figure}",
    },
    Snippet {
        name: "table",
        detail: "Insert a table with tabular, caption, and label placeholders.",
        package: None,
        insert_text: "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{${columns}}\n    ${content}\n  \\end{tabular}\n  \\caption{${caption}}\n  \\label{tab:${label}}\n\\end{table}",
    },
    Snippet {
        name: "equation",
        detail: "Insert a numbered display equation.",
        package: None,
        insert_text: "\\begin{equation}\n  ${equation}\n\\end{equation}",
    },
    Snippet {
        name: "align",
        detail: "Insert aligned equations from amsmath.",
        package: Some("amsmath"),
        insert_text: "\\begin{align}\n  ${equation} \\\\\n\\end{align}",
    },
    Snippet {
        name: "theorem",
        detail: "Insert a theorem environment from amsthm.",
        package: Some("amsthm"),
        insert_text: "\\begin{theorem}\n  ${statement}\n\\end{theorem}",
    },
    Snippet {
        name: "frame",
        detail: "Insert a Beamer slide frame.",
        package: Some("beamer"),
        insert_text: "\\begin{frame}{${title}}\n  ${content}\n\\end{frame}",
    },
];

#[tauri::command]
pub fn latex_completions(
    request: CompletionRequest,
    access: State<'_, ProjectAccess>,
) -> Result<CompletionResponse, CompletionError> {
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
}

fn query(source: &str, position: usize) -> CompletionResponse {
    let context = completion_context(source, position);
    let packages = declared_packages(source);
    let local_commands = local_commands(source);
    let local_environments = local_environments(source);
    let items = match context {
        CompletionContext::None => Vec::new(),
        CompletionContext::Command { from, prefix } => {
            command_items(&prefix, from, position, &packages, &local_commands)
        }
        CompletionContext::BeginEnvironment { from, prefix } => environment_items(
            &prefix,
            from,
            position,
            &packages,
            &local_environments,
            None,
        ),
        CompletionContext::EndEnvironment { from, prefix } => environment_items(
            &prefix,
            from,
            position,
            &packages,
            &local_environments,
            open_environments(source).last().map(String::as_str),
        ),
        CompletionContext::Argument { .. } => Vec::new(),
    };
    CompletionResponse { items }
}

fn resolve_completions(root: &Path, request: &CompletionRequest) -> CompletionResponse {
    match completion_context(&request.content, request.position) {
        CompletionContext::Argument {
            from,
            command,
            prefix,
        } => CompletionResponse {
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
                .map(move |label| ResolvedSymbol {
                    kind,
                    label,
                    source: source.clone(),
                })
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
            let keys = if is_bib {
                bib_keys_in(content)
            } else {
                bibitem_keys_in(content)
            };
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

#[cfg(test)]
fn query_labels(source: &str, position: usize) -> Vec<String> {
    query(source, position)
        .items
        .into_iter()
        .map(|item| item.label)
        .collect()
}

fn command_items(
    prefix: &str,
    from: usize,
    to: usize,
    packages: &HashSet<String>,
    local: &HashSet<String>,
) -> Vec<CompletionItem> {
    let mut ranked = Vec::new();
    for name in local {
        if name.starts_with(prefix) {
            ranked.push((
                TIER_LOCAL,
                item(
                    format!("\\{name}"),
                    "Project macro.",
                    CompletionKind::Command,
                    CompletionProvenance::Local,
                    None,
                    from,
                    to,
                    format!("\\{name}"),
                ),
            ));
        }
    }
    for capability in COMMANDS {
        if capability.name.starts_with(prefix) && is_available(*capability, packages) {
            let (tier, provenance) = capability_provenance(capability.package);
            ranked.push((
                tier,
                item(
                    format!("\\{}", capability.name),
                    capability.detail,
                    CompletionKind::Command,
                    provenance,
                    capability.package,
                    from,
                    to,
                    format!("\\{}", capability.name),
                ),
            ));
        }
    }
    for snippet in SNIPPETS {
        if snippet.name.starts_with(prefix) && is_snippet_available(snippet, packages) {
            let (tier, provenance) = capability_provenance(snippet.package);
            ranked.push((
                tier,
                item(
                    format!("{} environment", snippet.name),
                    snippet.detail,
                    CompletionKind::Snippet,
                    provenance,
                    snippet.package,
                    from,
                    to,
                    snippet.insert_text.to_owned(),
                ),
            ));
        }
    }
    finalize(ranked)
}

/// Maps a capability's package prerequisite to its ranking tier and provenance.
fn capability_provenance(package: Option<&'static str>) -> (u8, CompletionProvenance) {
    match package {
        Some(_) => (TIER_PACKAGE, CompletionProvenance::Package),
        None => (TIER_CORE, CompletionProvenance::Core),
    }
}

fn is_snippet_available(snippet: &Snippet, packages: &HashSet<String>) -> bool {
    snippet
        .package
        .is_none_or(|package| packages.contains(package))
}

/// Orders candidates by ranking tier, then label, so an exact prefix match (the
/// shortest label sharing the prefix) leads, and drops duplicate `(kind, label)` pairs.
fn finalize(mut ranked: Vec<(u8, CompletionItem)>) -> Vec<CompletionItem> {
    ranked.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.label.cmp(&right.1.label))
    });
    let mut seen = HashSet::new();
    ranked
        .into_iter()
        .map(|(_, item)| item)
        .filter(|item| seen.insert((item.kind, item.label.clone())))
        .collect()
}

fn environment_items(
    prefix: &str,
    from: usize,
    to: usize,
    packages: &HashSet<String>,
    local: &HashSet<String>,
    preferred: Option<&str>,
) -> Vec<CompletionItem> {
    let mut ranked = Vec::new();
    if let Some(name) = preferred.filter(|name| name.starts_with(prefix)) {
        ranked.push((
            TIER_OPEN_ENVIRONMENT,
            item(
                name.to_owned(),
                "Closest open environment.",
                CompletionKind::Environment,
                CompletionProvenance::Local,
                None,
                from,
                to,
                name.to_owned(),
            ),
        ));
    }
    for name in local {
        if name.starts_with(prefix) && Some(name.as_str()) != preferred {
            ranked.push((
                TIER_LOCAL,
                item(
                    name.to_owned(),
                    "Project environment.",
                    CompletionKind::Environment,
                    CompletionProvenance::Local,
                    None,
                    from,
                    to,
                    name.to_owned(),
                ),
            ));
        }
    }
    for capability in ENVIRONMENTS {
        if capability.name.starts_with(prefix)
            && is_available(*capability, packages)
            && Some(capability.name) != preferred
        {
            let (tier, provenance) = capability_provenance(capability.package);
            ranked.push((
                tier,
                item(
                    capability.name.to_owned(),
                    capability.detail,
                    CompletionKind::Environment,
                    provenance,
                    capability.package,
                    from,
                    to,
                    capability.name.to_owned(),
                ),
            ));
        }
    }
    finalize(ranked)
}

#[allow(
    clippy::too_many_arguments,
    reason = "one flat constructor for a serialized value"
)]
fn item(
    label: String,
    detail: &'static str,
    kind: CompletionKind,
    provenance: CompletionProvenance,
    requires: Option<&'static str>,
    from: usize,
    to: usize,
    insert_text: String,
) -> CompletionItem {
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
}

fn is_available(capability: Capability, packages: &HashSet<String>) -> bool {
    capability
        .package
        .is_none_or(|package| packages.contains(package))
}

fn declared_packages(source: &str) -> HashSet<String> {
    braced_values(source, "\\usepackage")
        .into_iter()
        .flat_map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .collect()
}

fn local_commands(source: &str) -> HashSet<String> {
    [
        "\\newcommand",
        "\\renewcommand",
        "\\providecommand",
        "\\DeclareMathOperator",
    ]
    .into_iter()
    .flat_map(|command| braced_values(source, command))
    .filter_map(|value| value.strip_prefix('\\').map(str::to_owned))
    .collect()
}

fn local_environments(source: &str) -> HashSet<String> {
    ["\\newenvironment", "\\renewenvironment"]
        .into_iter()
        .flat_map(|command| braced_values(source, command))
        .collect()
}

fn braced_values(source: &str, command: &str) -> Vec<String> {
    source
        .match_indices(command)
        .filter_map(|(start, _)| {
            let rest = &source[start + command.len()..];
            let open = rest.find('{')?;
            let value = &rest[open + 1..];
            let close = value.find('}')?;
            Some(value[..close].trim().to_owned())
        })
        .collect()
}

fn open_environments(source: &str) -> Vec<String> {
    let mut stack = Vec::new();
    for (start, _) in source.match_indices("\\begin{") {
        if let Some(name) = braced_values(&source[start..], "\\begin")
            .into_iter()
            .next()
        {
            stack.push(name);
        }
    }
    for (start, _) in source.match_indices("\\end{") {
        if let Some(name) = braced_values(&source[start..], "\\end").into_iter().next() {
            if stack.last() == Some(&name) {
                stack.pop();
            }
        }
    }
    stack
}

fn unavailable() -> CompletionError {
    CompletionError {
        code: "completion-unavailable",
        message: "TeX could not update project suggestions. Continue typing or try again.",
    }
}
