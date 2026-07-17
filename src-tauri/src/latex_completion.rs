#[derive(Clone, Debug, Eq, PartialEq)]
enum CompletionContext {
    None,
    Command { from: usize, prefix: String },
    BeginEnvironment { from: usize, prefix: String },
    EndEnvironment { from: usize, prefix: String },
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

    if name_start > line_start && source[..name_start].ends_with('{') {
        let from = name_start;
        let command = source[..from - '{'.len_utf8()]
            .rsplit_once('\\')
            .map(|(_, command)| command)
            .unwrap_or_default();
        return match command {
            "begin" => CompletionContext::BeginEnvironment { from, prefix },
            "end" => CompletionContext::EndEnvironment { from, prefix },
            _ => CompletionContext::None,
        };
    }

    CompletionContext::None
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
    use super::{completion_context, environment_labels, query, CompletionContext};

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
        assert!(environment_labels("\\begin{ali", 10).is_empty());
        assert_eq!(
            environment_labels("\\usepackage{amsmath}\n\\begin{ali", 31),
            vec!["align"]
        );
    }

    #[test]
    fn proposes_the_nearest_open_environment_when_ending() {
        let source = "\\begin{figure}\n  \\end{fi";
        assert_eq!(query(source, source.len()).items[0].label, "figure");
    }
}
use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{project_access::ProjectAccess, source_read};

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
    from: usize,
    to: usize,
    insert_text: String,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum CompletionKind {
    Command,
    Environment,
    Snippet,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum CompletionProvenance {
    Core,
    Package,
    Local,
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

#[tauri::command]
pub fn latex_completions(
    request: CompletionRequest,
    access: State<'_, ProjectAccess>,
) -> Result<CompletionResponse, CompletionError> {
    access
        .resolve(&request.project_path)
        .map_err(|_| unavailable())?;
    let relative = std::path::Path::new(&request.relative_path);
    if !source_read::valid_relative_path(relative) || !source_read::is_readable_source(relative) {
        return Err(unavailable());
    }
    if request.content.len() > source_read::MAX_SOURCE_BYTES as usize {
        return Err(unavailable());
    }
    Ok(query(&request.content, request.position))
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
    };
    CompletionResponse { items }
}

#[cfg(test)]
fn environment_labels(source: &str, position: usize) -> Vec<String> {
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
    let mut items = Vec::new();
    for name in local {
        if name.starts_with(prefix) {
            items.push(item(
                format!("\\{name}"),
                "Project macro.",
                CompletionKind::Command,
                CompletionProvenance::Local,
                from,
                to,
                format!("\\{name}"),
            ));
        }
    }
    for capability in COMMANDS {
        if capability.name.starts_with(prefix) && is_available(*capability, packages) {
            items.push(item(
                format!("\\{}", capability.name),
                capability.detail,
                CompletionKind::Command,
                if capability.package.is_some() {
                    CompletionProvenance::Package
                } else {
                    CompletionProvenance::Core
                },
                from,
                to,
                format!("\\{}", capability.name),
            ));
        }
    }
    for (name, detail, insert_text) in snippets(packages) {
        if name.starts_with(prefix) {
            items.push(item(
                format!("{name} environment"),
                detail,
                CompletionKind::Snippet,
                CompletionProvenance::Core,
                from,
                to,
                insert_text.to_owned(),
            ));
        }
    }
    items
}

fn snippets(packages: &HashSet<String>) -> Vec<(&'static str, &'static str, &'static str)> {
    let mut items = vec![
        (
            "itemize",
            "Insert a bulleted list with an item placeholder.",
            "\\begin{itemize}\n  \\item ${item}\n\\end{itemize}",
        ),
        (
            "figure",
            "Insert a figure with image, caption, and label placeholders.",
            "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics{${file}}\n  \\caption{${caption}}\n  \\label{fig:${label}}\n\\end{figure}",
        ),
        (
            "equation",
            "Insert a numbered display equation.",
            "\\begin{equation}\n  ${equation}\n\\end{equation}",
        ),
    ];
    if packages.contains("amsmath") {
        items.push((
            "align",
            "Insert aligned equations from amsmath.",
            "\\begin{align}\n  ${equation} \\\\\n\\end{align}",
        ));
    }
    items
}

fn environment_items(
    prefix: &str,
    from: usize,
    to: usize,
    packages: &HashSet<String>,
    local: &HashSet<String>,
    preferred: Option<&str>,
) -> Vec<CompletionItem> {
    let mut items = Vec::new();
    if let Some(name) = preferred.filter(|name| name.starts_with(prefix)) {
        items.push(item(
            name.to_owned(),
            "Closest open environment.",
            CompletionKind::Environment,
            CompletionProvenance::Local,
            from,
            to,
            name.to_owned(),
        ));
    }
    for name in local {
        if name.starts_with(prefix) && Some(name.as_str()) != preferred {
            items.push(item(
                name.to_owned(),
                "Project environment.",
                CompletionKind::Environment,
                CompletionProvenance::Local,
                from,
                to,
                name.to_owned(),
            ));
        }
    }
    for capability in ENVIRONMENTS {
        if capability.name.starts_with(prefix)
            && is_available(*capability, packages)
            && Some(capability.name) != preferred
        {
            items.push(item(
                capability.name.to_owned(),
                capability.detail,
                CompletionKind::Environment,
                if capability.package.is_some() {
                    CompletionProvenance::Package
                } else {
                    CompletionProvenance::Core
                },
                from,
                to,
                capability.name.to_owned(),
            ));
        }
    }
    items
}

fn item(
    label: String,
    detail: &'static str,
    kind: CompletionKind,
    provenance: CompletionProvenance,
    from: usize,
    to: usize,
    insert_text: String,
) -> CompletionItem {
    CompletionItem {
        label,
        detail,
        kind,
        provenance,
        from,
        to,
        insert_text,
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
