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
            .find(|character: char| {
                character == ',' || character == '}' || character.is_whitespace()
            })
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
        ArgumentTarget::SourceFile => slashed.strip_suffix(".tex").unwrap_or(&slashed).to_owned(),
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
        assert_eq!(
            bib_keys_in("@article{knuth1984,\n  title = {x}\n}"),
            vec!["knuth1984"]
        );
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
        assert_eq!(
            classify_command("includegraphics"),
            Some(ArgumentTarget::ImageFile)
        );
        assert_eq!(classify_command("section"), None);
    }

    #[test]
    fn filters_ranks_and_deduplicates_matches() {
        let symbols = vec![
            ResolvedSymbol {
                kind: SymbolKind::Label,
                label: "sec:intro".into(),
                source: "b.tex".into(),
            },
            ResolvedSymbol {
                kind: SymbolKind::Label,
                label: "sec".into(),
                source: "a.tex".into(),
            },
            ResolvedSymbol {
                kind: SymbolKind::Label,
                label: "sec:intro".into(),
                source: "a.tex".into(),
            },
            ResolvedSymbol {
                kind: SymbolKind::Label,
                label: "other".into(),
                source: "a.tex".into(),
            },
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
